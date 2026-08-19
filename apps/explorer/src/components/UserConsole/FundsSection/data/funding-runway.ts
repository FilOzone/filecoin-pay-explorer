import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { formatUnits, parseUnits } from "viem";
import { formatDate } from "@/utils/formatter";

export const USDFC_DECIMALS = 18;
export const EPOCHS_PER_DAY = TIME_CONSTANTS.EPOCHS_PER_DAY;
export const EPOCHS_PER_MONTH = TIME_CONSTANTS.EPOCHS_PER_MONTH;
export const ONE_YEAR_EPOCHS = 365n * EPOCHS_PER_DAY;
// Runway slider bounds: fund for anywhere between one month and five years,
// defaulting to one year.
export const MAX_FUNDING_MONTHS = 60;
export const DEFAULT_FUNDING_MONTHS = 12;
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

// Inverse of the suggested-top-up curve: the TOTAL runway (in months from now)
// that a deposit of `amount` roughly buys. Float math is fine here — it only
// positions a slider thumb; the exact bigint is still what gets deposited.
export function monthsForTopUp(summary: FundingAccountSummary, amount: bigint): number | null {
  if (summary.lockupRatePerEpoch === 0n) return null;
  const epochsAfter =
    Number(summary.runwayInEpochs) -
    Number(TOP_UP_BUFFER_EPOCHS) +
    (Number(amount) - Number(summary.debt)) / Number(summary.lockupRatePerEpoch);
  return epochsAfter / Number(EPOCHS_PER_MONTH);
}

// First whole-month runway target that still needs a top-up; null when the
// account has no recurring spend to project or is funded past `maxMonths`.
export function minTopUpMonths(summary: FundingAccountSummary, maxMonths = MAX_FUNDING_MONTHS): number | null {
  if (summary.lockupRatePerEpoch === 0n) return null;
  if (summary.debt > 0n) return 1;
  const coveredMonths = Number(summary.runwayInEpochs / EPOCHS_PER_MONTH);
  const min = coveredMonths + 1;
  return min > maxMonths ? null : min;
}

// Prefill for the funding dialogs: the suggestion at the slider's initial
// position (one year, clamped up to the first unfunded month so an account
// already covered past a year still opens with a live projection). Empty when
// there is nothing meaningful to suggest.
export function defaultTopUpSuggestion(summary: FundingAccountSummary, genesisTimestamp: number): string {
  const min = minTopUpMonths(summary);
  if (min === null) return "";
  const months = BigInt(Math.min(Math.max(DEFAULT_FUNDING_MONTHS, min), MAX_FUNDING_MONTHS));
  return formatSuggestedTopUp(
    calculateFundingRunway(summary, months * EPOCHS_PER_MONTH, genesisTimestamp).suggestedTopUp,
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
