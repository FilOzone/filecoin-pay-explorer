import {
  type AccountSpendHistoryResponse,
  SPEND_HISTORY_NESTED_LIMIT,
  SPEND_HISTORY_RAIL_LIMIT,
} from "@/hooks/useAccountDetails";
import type { RailSpendInput } from "../types";
import { timestampToEpoch } from "./epoch";

/**
 * Returns true when a capped collection is full and the response may be incomplete.
 *
 * A collection sitting exactly on its cap is indistinguishable from one that was
 * cut short, so this reports the limit being reached — not that records were
 * dropped, nor that any dropped record falls inside the charted months.
 */
export const hasReachedSpendHistoryLimit = (response: AccountSpendHistoryResponse): boolean =>
  response.rails.length >= SPEND_HISTORY_RAIL_LIMIT ||
  response.rails.some(
    (rail) =>
      rail.rateChangeQueue.length >= SPEND_HISTORY_NESTED_LIMIT ||
      rail.oneTimePayments.length >= SPEND_HISTORY_NESTED_LIMIT,
  );

/**
 * The single seam between the subgraph and the chart.
 *
 * Everything downstream — the accrual maths, its tests, every component — works
 * on `RailSpendInput` and knows nothing about how the data arrived. When the
 * nested query is replaced by paged top-level queries, this function is the
 * only chart-layer adapter that has to change.
 */
export const toRailSpendInput = (
  response: AccountSpendHistoryResponse,
  genesisTimestamp: bigint | number,
): RailSpendInput[] =>
  response.rails.map((rail) => ({
    paymentRate: BigInt(rail.paymentRate),
    endEpoch: BigInt(rail.endEpoch),
    // The schema has no creation epoch, only a unix `createdAt`, so it is
    // derived here. Integer division can land it one epoch either side of the
    // true block — negligible against a month, and it goes away when the native
    // field lands.
    createdAtEpoch: timestampToEpoch(BigInt(rail.createdAt), genesisTimestamp),
    segments: rail.rateChangeQueue.map((segment) => ({
      startEpoch: BigInt(segment.startEpoch),
      untilEpoch: BigInt(segment.untilEpoch),
      rate: BigInt(segment.rate),
    })),
    oneTimePayments: rail.oneTimePayments.map((payment) => ({
      amount: BigInt(payment.totalAmount),
      timestamp: BigInt(payment.createdAt),
    })),
  }));
