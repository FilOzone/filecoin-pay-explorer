import { resolveExpiry } from "@/utils/sessionKeys";

const DAY_SECONDS = 86_400;

/** Longest snooze Keep offers. There is no "forever". */
const MAX_SNOOZE_DAYS = 365;

export const SNOOZE_PRESETS = [
  { label: "30 days", seconds: 30 * DAY_SECONDS },
  { label: "90 days", seconds: 90 * DAY_SECONDS },
  { label: "365 days", seconds: MAX_SNOOZE_DAYS * DAY_SECONDS },
];

/** A local date as an `<input type="date">` value, `YYYY-MM-DD`. */
function toDateInputValue(ms: number): string {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The custom dates Keep accepts, as `<input type="date">` bounds. */
export function snoozeDateRange(nowMs: number): { min: string; max: string } {
  return {
    min: toDateInputValue(nowMs),
    max: toDateInputValue(nowMs + MAX_SNOOZE_DAYS * DAY_SECONDS * 1000),
  };
}

/** When the snooze ends (unix seconds), or null when the choice is missing, past, or over a year away. */
export function resolveSnoozeUntil(presetIndex: string, customDate: string, nowMs: number): bigint | null {
  // `YYYY-MM-DD` strings compare in date order.
  if (presetIndex === "custom" && customDate > snoozeDateRange(nowMs).max) return null;
  return resolveExpiry(presetIndex, customDate, nowMs, SNOOZE_PRESETS);
}
