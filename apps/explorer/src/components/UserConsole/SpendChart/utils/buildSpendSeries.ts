import type { MonthWindow, OperatorSpend, SpendHistory, SpendSeriesRow } from "../types";
import { accruePeriodInWindow } from "./accrueSpend";

/** Running totals for one month while it is being assembled. */
type WindowTotals = {
  streaming: bigint;
  oneTime: bigint;
  /** Keyed by lowercase operator address, so repeated lookups stay O(1). */
  byOperator: Map<string, bigint>;
};

const addOperatorSpend = (byOperator: Map<string, bigint>, address: string, amount: bigint): void => {
  if (amount === 0n) return;
  byOperator.set(address, (byOperator.get(address) ?? 0n) + amount);
};

/**
 * Largest first, so the tooltip leads with whatever drove the month.
 *
 * Ties break on address to keep the order stable between renders — otherwise two
 * services costing the same could swap places on a refetch.
 */
const toSortedOperatorSpend = (byOperator: Map<string, bigint>): OperatorSpend[] =>
  Array.from(byOperator, ([address, amount]) => ({ address, amount })).sort((a, b) => {
    if (a.amount !== b.amount) return a.amount > b.amount ? -1 : 1;
    return a.address < b.address ? -1 : 1;
  });

/**
 * Finds the window a unix second falls in, or `-1` when it is outside the range.
 *
 * Windows tile the range in ascending order, so the first one that has not yet
 * ended is the one containing the timestamp.
 */
const windowIndexAt = (windows: MonthWindow[], timestamp: bigint): number => {
  if (windows.length === 0) return -1;
  if (timestamp < windows[0].startTimestamp) return -1;
  if (timestamp >= windows[windows.length - 1].endTimestamp) return -1;

  return windows.findIndex((window) => timestamp < window.endTimestamp);
};

/**
 * One row per bar. Months with no activity come back as zeros rather than being
 * dropped, so the chart renders an empty slot and the gap stays visible.
 *
 * Periods and payments are each walked once, accumulating into the months they
 * touch, rather than rescanning the whole history per month. The history is far
 * larger than the six windows it is matched against.
 */
export const buildSpendSeries = (
  history: SpendHistory,
  windows: MonthWindow[],
  indexedEpoch: bigint,
): SpendSeriesRow[] => {
  const totals: WindowTotals[] = windows.map(() => ({ streaming: 0n, oneTime: 0n, byOperator: new Map() }));

  for (const period of history.periods) {
    for (let index = 0; index < windows.length; index++) {
      const amount = accruePeriodInWindow(period, windows[index].startEpoch, windows[index].endEpoch, indexedEpoch);
      if (amount === 0n) continue;

      totals[index].streaming += amount;
      addOperatorSpend(totals[index].byOperator, period.operatorAddress, amount);
    }
  }

  for (const payment of history.oneTimePayments) {
    const index = windowIndexAt(windows, payment.timestamp);
    if (index === -1) continue;

    totals[index].oneTime += payment.amount;
    addOperatorSpend(totals[index].byOperator, payment.operatorAddress, payment.amount);
  }

  return windows.map((window, index) => ({
    label: window.label,
    fullLabel: window.fullLabel,
    isPartial: window.isPartial,
    streaming: totals[index].streaming,
    oneTime: totals[index].oneTime,
    total: totals[index].streaming + totals[index].oneTime,
    byOperator: toSortedOperatorSpend(totals[index].byOperator),
  }));
};
