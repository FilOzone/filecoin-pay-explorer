import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import type { AlertEmailProps } from "../shared/emails/templates/AlertEmail";
import type { AccountHealth, AccountSummary } from "./account";

const EPOCH_DURATION_SEC = Number(TIME_CONSTANTS.EPOCH_DURATION);
const SECONDS_PER_DAY = 86_400;

// Month-day-year in UTC, e.g. "January 15, 2026" — matches the email template.
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * Display values derived from on-chain state, ready for the alert email template.
 * Structural subset of `AlertEmailProps` so the two types stay in sync, plus
 * `fundedUntilSec` (the raw timestamp persisted to notification_log).
 * The caller supplies the identity fields (name, wallet, tier).
 */
export type AlertContent = Pick<AlertEmailProps, "fundedUntil" | "daysRemaining"> & {
  /** Unix seconds the account's funds run out. */
  fundedUntilSec: number;
};

/**
 * Pure mapping from on-chain account state to the alert email's display values.
 * `fundedUntil` and `daysRemaining` are both derived from `fundedUntilSec` so
 * the date and the day count always agree.
 */
export function buildAlertContent(summary: AccountSummary, health: AccountHealth, nowSec: number): AlertContent {
  // Epochs of runway, consistent with the health tier: 0 when already in deficit.
  const runwayEpochs = health.fundedUntilEpoch === null ? 0n : health.fundedUntilEpoch - summary.epoch;
  const fundedUntilSec = nowSec + Number(runwayEpochs) * EPOCH_DURATION_SEC;

  return {
    fundedUntil: DATE_FORMAT.format(new Date(fundedUntilSec * 1000)),
    fundedUntilSec,
    daysRemaining: utcDayIndex(fundedUntilSec) - utcDayIndex(nowSec),
  };
}

/** UTC calendar-day number for a Unix-seconds instant (whole days since the epoch). */
function utcDayIndex(sec: number): number {
  return Math.floor(sec / SECONDS_PER_DAY);
}
