import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { maxUint256 } from "viem";

const EPOCHS_PER_DAY = TIME_CONSTANTS.EPOCHS_PER_DAY;
/** The contracts treat this and anything larger as "no limit". */
const UNLIMITED_LOCKUP_PERIOD = 2n ** 64n - 1n;

/** A lockup period typed in days, as the epoch count the contract expects; null unless it is a positive number. */
export function daysToEpochs(days: string): bigint | null {
  const value = Number(days.trim());
  if (days.trim() === "" || !Number.isFinite(value) || value <= 0) return null;
  return BigInt(Math.round(value * Number(EPOCHS_PER_DAY)));
}

/** "30 days", "1 day", "under a day", or "no limit" for the sentinel values. */
export function formatLockupPeriod(epochs: bigint): string {
  if (epochs >= UNLIMITED_LOCKUP_PERIOD || epochs === maxUint256) return "no limit";
  const days = Number(epochs) / Number(EPOCHS_PER_DAY);
  if (days < 1) return "under a day";
  const rounded = Math.round(days * 10) / 10;
  return `${rounded} ${rounded === 1 ? "day" : "days"}`;
}
