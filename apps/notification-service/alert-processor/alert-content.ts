import { formatUnits } from "@filoz/synapse-core/utils";
import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import type { AlertEmailProps } from "../shared/emails/templates/AlertEmail";
import { type AccountHealth, type AccountSummary, EPOCHS_PER_DAY, type HealthThresholds } from "./account";

// USDFC, the Filecoin Pay settlement token, uses 18 decimals (the SDK's default).
const USDFC_DECIMALS = 18;
const EPOCH_DURATION_SEC = Number(TIME_CONSTANTS.EPOCH_DURATION);

// Rails keep draining between reading the summary and the user paying, so the
// recommended top-up would otherwise be short by that drift. Cover a 15-minute
// window (pipeline + email delivery) as a safety margin, expressed in epochs.
const BUFFER_WINDOW_SEC = 15 * 60;
const BUFFER_EPOCHS = BigInt(Math.ceil(BUFFER_WINDOW_SEC / EPOCH_DURATION_SEC));

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
 * Amount that would restore the account to healthy: clear any outstanding debt,
 * fund runway back up to the warning threshold, and add a drift buffer for the
 * rails that keep draining until payment. Formatted as USDFC.
 *
 * The buffer mirrors synapse-core's `calculateBufferAmount`, which for a needed
 * deposit is exactly `netRate * bufferEpochs`; here the net rate is the current
 * `lockupRatePerEpoch` (no new upload).
 */
function recommendedTopUp(summary: AccountSummary, runwayEpochs: bigint, thresholds: HealthThresholds): string {
  const targetEpochs = BigInt(thresholds.warning) * EPOCHS_PER_DAY;
  const shortfallEpochs = targetEpochs > runwayEpochs ? targetEpochs - runwayEpochs : 0n;
  const buffer = summary.lockupRatePerEpoch * BUFFER_EPOCHS;
  const raw = shortfallEpochs * summary.lockupRatePerEpoch + summary.debt + buffer;
  return `${formatUnits(raw, { decimals: USDFC_DECIMALS, digits: 2 })} USDFC`;
}
