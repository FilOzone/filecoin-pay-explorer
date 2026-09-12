import type { MonthWindow } from "../types";
import { timestampToEpoch } from "./epoch";

/** Six months reads as a trend without crowding the axis on a phone. */
export const MONTHS_SHOWN = 6;

const toUnixSeconds = (date: Date): bigint => BigInt(Math.floor(date.getTime() / 1_000));

/**
 * The last {@link MONTHS_SHOWN} calendar months, oldest first, ending with the
 * month `now` falls in.
 *
 * Months are the user's **local** ones. Someone in Auckland asking what last
 * month covers means their last month, not UTC's, and the boundary between the
 * two is a whole day.
 *
 * Adjacent windows share a boundary — month N's `endEpoch` is month N+1's
 * `startEpoch`, and its `endTimestamp` is their `startTimestamp` — which tiles
 * the range with no gap and no double-count under the conventions documented on
 * `MonthWindow`.
 */
export const buildMonthWindows = (now: Date, genesisTimestamp: bigint | number): MonthWindow[] => {
  const currentEpoch = timestampToEpoch(toUnixSeconds(now), genesisTimestamp);
  const windows: MonthWindow[] = [];

  for (let offset = MONTHS_SHOWN - 1; offset >= 0; offset--) {
    // `Date` normalises out-of-range months, so a negative index rolls the year
    // back on its own.
    const monthStart = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);

    const startTimestamp = toUnixSeconds(monthStart);
    const endTimestamp = toUnixSeconds(nextMonthStart);
    const endEpoch = timestampToEpoch(endTimestamp, genesisTimestamp);

    windows.push({
      label: monthStart.toLocaleDateString(undefined, { month: "short" }),
      // Six months can straddle a new year, so the tooltip carries one.
      fullLabel: monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      startEpoch: timestampToEpoch(startTimestamp, genesisTimestamp),
      endEpoch,
      startTimestamp,
      endTimestamp,
      // The month `now` falls in, which is always the last window here. Written
      // as the reason rather than the position so the flag reads as what the
      // chart uses it for: a bar that is still filling.
      isPartial: endEpoch > currentEpoch,
    });
  }

  return windows;
};
