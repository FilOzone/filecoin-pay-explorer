import type { MonthWindow, RailSpendInput, SpendSeriesRow } from "../types";
import { accrueRailInWindow } from "./accrueSpend";

/**
 * Totals one-time payments into the window each falls in, in a single pass.
 *
 * A payment belongs to at most one window, so scanning every rail's history once
 * per month would repeat the same work six times over — and the history is far
 * larger than the six windows it is matched against. Payments outside the range
 * are rejected on two comparisons before any window is considered.
 */
const totalOneTimeByWindow = (rails: RailSpendInput[], windows: MonthWindow[]): bigint[] => {
  const totals = windows.map(() => 0n);
  if (windows.length === 0) return totals;

  const rangeStart = windows[0].startTimestamp;
  const rangeEnd = windows[windows.length - 1].endTimestamp;

  for (const rail of rails) {
    for (const payment of rail.oneTimePayments) {
      if (payment.timestamp < rangeStart || payment.timestamp >= rangeEnd) continue;

      // Windows tile the range in ascending order, so the first one that has not
      // yet ended is the one containing this payment.
      const index = windows.findIndex((window) => payment.timestamp < window.endTimestamp);
      totals[index] += payment.amount;
    }
  }

  return totals;
};

/**
 * One row per bar. Months with no activity come back as zeros rather than being
 * dropped, so the chart renders an empty slot and the gap stays visible.
 */
export const buildSpendSeries = (
  rails: RailSpendInput[],
  windows: MonthWindow[],
  indexedEpoch: bigint,
): SpendSeriesRow[] => {
  const oneTimeTotals = totalOneTimeByWindow(rails, windows);

  return windows.map((window, index) => {
    let streaming = 0n;
    for (const rail of rails) {
      streaming += accrueRailInWindow(rail, window.startEpoch, window.endEpoch, indexedEpoch);
    }

    const oneTime = oneTimeTotals[index];

    return {
      label: window.label,
      fullLabel: window.fullLabel,
      isPartial: window.isPartial,
      streaming,
      oneTime,
      total: streaming + oneTime,
    };
  });
};
