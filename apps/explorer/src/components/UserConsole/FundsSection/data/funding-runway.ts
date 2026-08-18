import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { formatUnits, parseUnits } from "viem";
import { formatDate } from "@/utils/formatter";

export const USDFC_DECIMALS = 18;
export const EPOCHS_PER_DAY = TIME_CONSTANTS.EPOCHS_PER_DAY;
export const ONE_YEAR_EPOCHS = 365n * EPOCHS_PER_DAY;
export const FUNDING_TARGETS = {
  month: { epochs: TIME_CONSTANTS.EPOCHS_PER_MONTH, label: "1 month" },
  year: { epochs: ONE_YEAR_EPOCHS, label: "1 year" },
} as const;
export type FundingTarget = keyof typeof FUNDING_TARGETS;
export const FUNDING_ESTIMATE_DISCLAIMER =
  "Estimates assume your current recurring spend rate; one-time charges are not included.";
const TOP_UP_BUFFER_EPOCHS = TIME_CONSTANTS.EPOCHS_PER_HOUR / 4n;

export type FundingStatus = "long-term-funded" | "funded" | "low" | "urgent" | "critical" | "no-active-spend";

export type FundingAccountSummary = {
  availableFunds: bigint;
  debt: bigint;
  epoch: bigint;
  lockupRatePerEpoch: bigint;
  runwayInEpochs: bigint;
};

export type FundingRunway = {
  fundedThroughTimestamp: bigint | null;
  runwayInEpochs: bigint;
  status: FundingStatus;
  suggestedTopUp: bigint;
};

export function calculateFundingRunway(
  summary: FundingAccountSummary,
  targetEpochs: bigint,
  genesisTimestamp: number,
): FundingRunway {
  const shortfallEpochs = targetEpochs > summary.runwayInEpochs ? targetEpochs - summary.runwayInEpochs : 0n;
  const needsTopUp = summary.debt > 0n || shortfallEpochs > 0n;
  const suggestedTopUp = needsTopUp
    ? summary.debt + (shortfallEpochs + TOP_UP_BUFFER_EPOCHS) * summary.lockupRatePerEpoch
    : 0n;
  const fundedThroughTimestamp =
    summary.lockupRatePerEpoch === 0n
      ? null
      : BigInt(genesisTimestamp) + (summary.epoch + summary.runwayInEpochs) * BigInt(TIME_CONSTANTS.EPOCH_DURATION);

  return {
    fundedThroughTimestamp,
    runwayInEpochs: summary.runwayInEpochs,
    status: fundingStatus(summary.runwayInEpochs, summary.debt, summary.lockupRatePerEpoch),
    suggestedTopUp,
  };
}

export function calculateProjectedFundingRunway(
  summary: FundingAccountSummary,
  amount: bigint,
  targetEpochs: bigint,
  genesisTimestamp: number,
): FundingRunway {
  const remainingDebt = summary.debt > amount ? summary.debt - amount : 0n;
  const availableFunds = summary.availableFunds + (amount > summary.debt ? amount - summary.debt : 0n);
  const runwayInEpochs =
    summary.lockupRatePerEpoch === 0n ? summary.runwayInEpochs : availableFunds / summary.lockupRatePerEpoch;

  return calculateFundingRunway(
    { ...summary, availableFunds, debt: remainingDebt, runwayInEpochs },
    targetEpochs,
    genesisTimestamp,
  );
}

export function parseFundingAmount(amount: string, decimals: number): bigint | null {
  try {
    const parsedAmount = parseUnits(amount, decimals);
    return parsedAmount > 0n ? parsedAmount : null;
  } catch {
    return null;
  }
}

export function formatFundedThrough(
  runway: Pick<FundingRunway, "fundedThroughTimestamp" | "runwayInEpochs" | "status">,
  approximate = false,
): string {
  if (runway.fundedThroughTimestamp === null) {
    return runway.status === "critical" ? "Underfunded" : "No active spend";
  }
  if (runway.runwayInEpochs === 0n) return "Underfunded";
  return `${approximate ? "~" : ""}${formatDate(runway.fundedThroughTimestamp)}`;
}

function fundingStatus(runwayInEpochs: bigint, debt: bigint, lockupRate: bigint): FundingStatus {
  if (lockupRate === 0n) return debt > 0n ? "critical" : "no-active-spend";
  if (debt > 0n || runwayInEpochs < EPOCHS_PER_DAY) return "critical";
  if (runwayInEpochs < 7n * EPOCHS_PER_DAY) return "urgent";
  if (runwayInEpochs < 30n * EPOCHS_PER_DAY) return "low";
  if (runwayInEpochs < ONE_YEAR_EPOCHS) return "funded";
  return "long-term-funded";
}

// Precision the suggested top-up is presented (and prefilled) at.
export const SUGGESTED_TOPUP_DISPLAY_DECIMALS = 2;

// Round a base-unit amount UP to `displayDecimals` places. Rounding up keeps the
// suggested top-up at or above the selected target instead of falling just short.
export function roundUpUnits(amount: bigint, decimals: number, displayDecimals: number): bigint {
  const factor = 10n ** BigInt(decimals - displayDecimals);
  return factor <= 1n ? amount : ((amount + factor - 1n) / factor) * factor;
}

// A clean, prefill-ready suggested top-up string (e.g. "1.57"). Empty when nothing is owed.
export function formatSuggestedTopUp(amount: bigint): string {
  if (amount <= 0n) return "";
  return formatUnits(roundUpUnits(amount, USDFC_DECIMALS, SUGGESTED_TOPUP_DISPLAY_DECIMALS), USDFC_DECIMALS);
}

// Display-only USDFC formatting with capped fractional digits. The exact bigint is
// still what gets deposited and confirmed in the wallet.
export function formatUsdfcAmount(amount: bigint): string {
  return Number(formatUnits(amount, USDFC_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 6 });
}
