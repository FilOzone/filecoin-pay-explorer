import { formatUnits } from "@filoz/synapse-core/utils";
import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import type { AlertEmailProps } from "../shared/emails/templates/AlertEmail";
import { type AccountHealth, type AccountSummary, EPOCHS_PER_DAY, type HealthThresholds } from "./account";

// USDFC, the Filecoin Pay settlement token, uses 18 decimals (the SDK's default).
const USDFC_DECIMALS = 18;
const EPOCH_DURATION_SEC = Number(TIME_CONSTANTS.EPOCH_DURATION);

// Month-day-year in UTC, e.g. "January 15, 2026" — matches the email template.
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * The display values derived from on-chain state — the template-facing fields of
 * `AlertEmailProps` plus `fundedUntilSec` (the raw timestamp persisted to
 * notification_log). The caller supplies the identity fields (name, wallet, tier).
 */
export type AlertContent = Pick<AlertEmailProps, "fundedUntil" | "daysRemaining" | "topUpAmount"> & {
  /** Unix seconds the account's funds run out. */
  fundedUntilSec: number;
};

/**
 * Pure mapping from on-chain account state to the alert email's display values.
 * `daysRemaining` and `fundedUntil` are both derived from the same runway value
 * so they can never disagree (e.g. "0 days remaining" beside a future date).
 */
export function buildAlertContent(
  summary: AccountSummary,
  health: AccountHealth,
  thresholds: HealthThresholds,
  nowSec: number,
): AlertContent {
  // Epochs of runway, consistent with the health tier: 0 when already in deficit.
  const runwayEpochs = health.fundedUntilEpoch === null ? 0n : health.fundedUntilEpoch - summary.epoch;
  const fundedUntilSec = nowSec + Number(runwayEpochs) * EPOCH_DURATION_SEC;

  return {
    fundedUntil: DATE_FORMAT.format(new Date(fundedUntilSec * 1000)),
    fundedUntilSec,
    daysRemaining: health.runwayDays,
    topUpAmount: recommendedTopUp(summary, runwayEpochs, thresholds),
  };
}

/**
 * Amount that would restore the account to healthy: clear any outstanding debt
 * and fund runway back up to the warning threshold. Formatted as USDFC.
 */
function recommendedTopUp(summary: AccountSummary, runwayEpochs: bigint, thresholds: HealthThresholds): string {
  const targetEpochs = BigInt(thresholds.warning) * EPOCHS_PER_DAY;
  const shortfallEpochs = targetEpochs > runwayEpochs ? targetEpochs - runwayEpochs : 0n;
  const raw = shortfallEpochs * summary.lockupRatePerEpoch + summary.debt;
  return `${formatUnits(raw, { decimals: USDFC_DECIMALS, digits: 2 })} USDFC`;
}
