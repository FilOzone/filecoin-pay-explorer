import { formatUnits, parseUnits } from "viem";
import { EPOCH_DURATION } from "@/utils/constants";
import { formatDate } from "@/utils/formatter";

export const EPOCH_DURATION_SECONDS = BigInt(EPOCH_DURATION);
export const ONE_YEAR_DAYS = 365n;
export const USDFC_DECIMALS = 18;
export const SECONDS_PER_DAY = 24n * 60n * 60n;
export const EPOCHS_PER_DAY = SECONDS_PER_DAY / EPOCH_DURATION_SECONDS;
export const ONE_YEAR_EPOCHS = ONE_YEAR_DAYS * EPOCHS_PER_DAY;
export const FUNDING_ESTIMATE_DISCLAIMER =
  "Estimates assume your current recurring spend rate; one-time charges are not included.";
export const SUGGESTED_TOP_UP_CAPTION =
  "Keeps this account funded for about a year at your current recurring spend rate.";

export type FundingStatus = "long-term-funded" | "funded" | "low" | "urgent" | "critical" | "no-active-spend";

export type FundingPosition = {
  funds: bigint | string;
  lockupCurrent: bigint | string;
  lockupLastSettledUntilEpoch?: bigint | string;
  lockupLastSettledUntilTimestamp: bigint | string;
  lockupRate: bigint | string;
};

export type FundingRunway = {
  availableFunds: bigint;
  fundedThroughEpoch: bigint | null;
  fundedThroughTimestamp: bigint | null;
  status: FundingStatus;
  suggestedTopUp: bigint;
};

export function calculateFundingRunway(position: FundingPosition, nowTimestamp: bigint): FundingRunway {
  const availableFunds = BigInt(position.funds) - BigInt(position.lockupCurrent);
  const lockupRate = BigInt(position.lockupRate);

  if (lockupRate === 0n) {
    return {
      availableFunds,
      fundedThroughEpoch: null,
      fundedThroughTimestamp: null,
      status: availableFunds < 0n ? "critical" : "no-active-spend",
      suggestedTopUp: availableFunds < 0n ? -availableFunds : 0n,
    };
  }

  const fundedEpochs = availableFunds > 0n ? availableFunds / lockupRate : 0n;
  const fundedThroughEpoch =
    position.lockupLastSettledUntilEpoch === undefined
      ? null
      : BigInt(position.lockupLastSettledUntilEpoch) + fundedEpochs;
  const fundedThroughTimestamp =
    BigInt(position.lockupLastSettledUntilTimestamp) + fundedEpochs * EPOCH_DURATION_SECONDS;
  const elapsedSeconds = nowTimestamp - BigInt(position.lockupLastSettledUntilTimestamp);
  const elapsedEpochs = elapsedSeconds > 0n ? elapsedSeconds / EPOCH_DURATION_SECONDS : 0n;
  const currentFunds = availableFunds - elapsedEpochs * lockupRate;
  const runwayInEpochs = currentFunds > 0n ? currentFunds / lockupRate : 0n;
  const suggestedTopUp = lockupRate * ONE_YEAR_EPOCHS - currentFunds;

  return {
    availableFunds,
    fundedThroughEpoch,
    fundedThroughTimestamp,
    status: fundingStatus(runwayInEpochs, currentFunds),
    suggestedTopUp: suggestedTopUp > 0n ? suggestedTopUp : 0n,
  };
}

export function calculateProjectedFundingRunway(
  position: FundingPosition,
  amount: bigint,
  nowTimestamp: bigint,
): FundingRunway {
  return calculateFundingRunway({ ...position, funds: BigInt(position.funds) + amount }, nowTimestamp);
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
  runway: Pick<FundingRunway, "fundedThroughTimestamp" | "status">,
  nowTimestamp: bigint,
  approximate = false,
): string {
  if (runway.fundedThroughTimestamp === null) {
    return runway.status === "critical" ? "Underfunded" : "No active spend";
  }
  if (runway.fundedThroughTimestamp <= nowTimestamp) return "Underfunded";
  return `${approximate ? "~" : ""}${formatDate(runway.fundedThroughTimestamp)}`;
}

function fundingStatus(runwayInEpochs: bigint, currentFunds: bigint): FundingStatus {
  if (currentFunds < 0n || runwayInEpochs < EPOCHS_PER_DAY) return "critical";
  if (runwayInEpochs < 7n * EPOCHS_PER_DAY) return "urgent";
  if (runwayInEpochs < 30n * EPOCHS_PER_DAY) return "low";
  if (runwayInEpochs < ONE_YEAR_EPOCHS) return "funded";
  return "long-term-funded";
}

// Precision the suggested top-up is presented (and prefilled) at.
export const SUGGESTED_TOPUP_DISPLAY_DECIMALS = 2;

// Round a base-unit amount UP to `displayDecimals` places. Rounding up keeps the
// suggested top-up at or above the one-year target instead of falling just short.
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
