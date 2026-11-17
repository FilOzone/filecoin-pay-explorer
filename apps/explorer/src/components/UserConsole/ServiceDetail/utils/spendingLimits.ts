import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { formatUnits, maxUint256, parseUnits } from "viem";
import type { OperatorApprovalState } from "@/hooks/useOperatorApproval";
import { formatTokenTruncated, isUnlimitedValue } from "@/utils/formatter";
import { formatTokenAmount } from "../../FundsSection/utils/formatTokenAmount";

const { EPOCHS_PER_DAY, EPOCHS_PER_MONTH } = TIME_CONSTANTS;

/** What `setOperatorApproval` takes after the token, operator and approved flag. */
export type ApprovalTerms = Pick<OperatorApprovalState, "rateAllowance" | "lockupAllowance" | "maxLockupPeriod">;

export type LimitField = { text: string; unlimited: boolean };

/** The rate is per month, the lockup in tokens, and the lockup period in whole days. */
export type LimitsForm = Record<"rate" | "lockup" | "period", LimitField>;

type LimitsUpdate =
  | { status: "invalid" }
  | { status: "unchanged" }
  | { status: "ready"; terms: ApprovalTerms; belowUsage: boolean };

/** Synapse revokes with zeroed limits; re-approving asks for new ones anyway. */
export const REVOKED_TERMS: ApprovalTerms = { rateAllowance: 0n, lockupAllowance: 0n, maxLockupPeriod: 0n };

// A per-epoch rate rarely converts back to a round monthly figure, so the form starts from a readable one.
const toPrefillText = (value: bigint, decimals: number) => formatTokenTruncated(value, decimals, "", 6);

const toDays = (period: bigint) => formatUnits((period * 100n) / EPOCHS_PER_DAY, 2);

const field = (value: bigint, toText: (value: bigint) => string): LimitField =>
  isUnlimitedValue(value) ? { text: "", unlimited: true } : { text: toText(value), unlimited: false };

export const limitsForm = (current: ApprovalTerms, decimals: number): LimitsForm => ({
  rate: field(current.rateAllowance, (rate) => toPrefillText(rate * EPOCHS_PER_MONTH, decimals)),
  lockup: field(current.lockupAllowance, (lockup) => toPrefillText(lockup, decimals)),
  period: field(current.maxLockupPeriod, toDays),
});

const parseAmount = (text: string, decimals: number): bigint | null =>
  /^(\d+\.?\d*|\.\d+)$/.test(text) ? parseUnits(text, decimals) : null;

const ceilDiv = (value: bigint, divisor: bigint) => (value + divisor - 1n) / divisor;

/**
 * The absolute terms to sign. A field left as it was prefilled keeps the exact on-chain value, so a readable
 * prefill never rewrites a limit the owner did not touch. A monthly rate rounds up to whole base units per epoch.
 */
export const parseLimitsForm = (form: LimitsForm, current: OperatorApprovalState, decimals: number): LimitsUpdate => {
  const prefill = limitsForm(current, decimals);
  const read = (key: keyof LimitsForm, kept: bigint, parse: (text: string) => bigint | null) => {
    const { text, unlimited } = form[key];
    // Text typed and then hidden by Unlimited is a draft, not an edit.
    const untouched = unlimited ? prefill[key].unlimited : !prefill[key].unlimited && text === prefill[key].text;
    if (untouched) return kept;
    return unlimited ? maxUint256 : parse(text.trim());
  };

  const rateAllowance = read("rate", current.rateAllowance, (text) => {
    const monthly = parseAmount(text, decimals);
    return monthly === null ? null : ceilDiv(monthly, EPOCHS_PER_MONTH);
  });
  const lockupAllowance = read("lockup", current.lockupAllowance, (text) => parseAmount(text, decimals));
  const maxLockupPeriod = read("period", current.maxLockupPeriod, (text) =>
    /^\d+$/.test(text) ? BigInt(text) * EPOCHS_PER_DAY : null,
  );

  if (rateAllowance === null || lockupAllowance === null || maxLockupPeriod === null) return { status: "invalid" };
  const terms = { rateAllowance, lockupAllowance, maxLockupPeriod };
  if (Object.values(terms).some((value) => value > maxUint256)) return { status: "invalid" };

  const unchanged =
    current.isApproved &&
    rateAllowance === current.rateAllowance &&
    lockupAllowance === current.lockupAllowance &&
    maxLockupPeriod === current.maxLockupPeriod;
  if (unchanged) return { status: "unchanged" };

  const belowUsage = rateAllowance < current.rateUsage || lockupAllowance < current.lockupUsage;
  return { status: "ready", terms, belowUsage };
};

export const formatRateLimit = (rate: bigint, decimals: number, symbol: string) =>
  isUnlimitedValue(rate) ? "Unlimited" : `${formatTokenAmount(rate * EPOCHS_PER_MONTH, decimals)} ${symbol} / month`;

export const formatLockupLimit = (lockup: bigint, decimals: number, symbol: string) =>
  isUnlimitedValue(lockup) ? "Unlimited" : `${formatTokenAmount(lockup, decimals)} ${symbol}`;

export const formatPeriodLimit = (period: bigint) => {
  if (isUnlimitedValue(period)) return "Unlimited";
  const days = toDays(period);
  return `${days} ${days === "1" ? "day" : "days"}`;
};
