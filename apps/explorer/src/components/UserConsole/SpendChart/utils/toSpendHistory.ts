import type { AccountSpendHistoryResponse } from "@/hooks/useAccountDetails";
import type { SpendHistory } from "../types";

/**
 * Returns true when paging stopped at its cap rather than at the end of the data.
 *
 * Unlike the row caps this replaced, reaching the page limit does mean records
 * were left unread — the walk only stops early on a full final page. What it
 * still cannot say is whether any of them fall inside the charted months.
 */
export const hasReachedSpendHistoryLimit = (response: AccountSpendHistoryResponse): boolean =>
  response.reachedPageLimit;

/**
 * The single seam between the subgraph and the chart.
 *
 * Everything downstream — the accrual maths, its tests, every component — works
 * on `SpendHistory` and knows nothing about how the data arrived. A change to
 * the query is confined to this function.
 */
export const toSpendHistory = (response: AccountSpendHistoryResponse): SpendHistory => ({
  periods: response.railRatePeriods.map((period) => ({
    rate: BigInt(period.rate),
    startEpoch: BigInt(period.startEpoch),
    // Preserved as null rather than defaulted here: only the accrual maths knows
    // the epoch an open period should run to.
    untilEpoch: period.untilEpoch === null ? null : BigInt(period.untilEpoch),
    operatorAddress: period.operator.address.toLowerCase(),
  })),
  oneTimePayments: response.oneTimePayments.map((payment) => ({
    amount: BigInt(payment.totalAmount),
    timestamp: BigInt(payment.createdAt),
    operatorAddress: payment.operator.address.toLowerCase(),
  })),
});
