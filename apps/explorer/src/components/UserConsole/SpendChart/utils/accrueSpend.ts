import type { RatePeriod } from "../types";

const max = (a: bigint, b: bigint): bigint => (a > b ? a : b);
const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);

/**
 * Counts the epochs in the intersection of two `(start, end]` intervals.
 *
 * Both use an exclusive start and inclusive end, so their length is
 * `end - start`. Adding one would count a shared boundary twice across adjacent
 * intervals.
 *
 * Mirrors `epochsRateChangeApplicable` in `packages/subgraph/src/utils/helpers.ts`.
 */
export const epochsApplicable = (
  startEpoch: bigint,
  untilEpoch: bigint,
  windowStart: bigint,
  windowEnd: bigint,
): bigint => {
  const start = max(startEpoch, windowStart);
  const end = min(untilEpoch, windowEnd);

  return end <= start ? 0n : end - start;
};

/**
 * The gross scheduled streaming amount for one rate period inside a window.
 *
 * This is not the amount paid or the final service cost. A validator may reduce
 * the proposed `rate × epochs` amount or make it zero — FWSS does this for
 * pre-activation, unproven, and partially proven ranges, and FilecoinPay debits
 * the `modifiedAmount` the validator returns. Network fees and operator
 * commission are deducted from the gross amount rather than added to the payer's
 * debit.
 *
 * The rate itself needs no reconstruction. The subgraph records a period at rail
 * creation and closes one on every rate change and on termination, so the
 * timeline has no gaps and this is a plain intersection.
 *
 * An open period has no `untilEpoch` and runs to the indexed epoch. A closed one
 * is still clamped to it, because termination sets an `untilEpoch` that can lie
 * in the future — a terminated rail keeps charging until it arrives.
 */
export const accruePeriodInWindow = (
  period: RatePeriod,
  windowStart: bigint,
  windowEnd: bigint,
  indexedEpoch: bigint,
): bigint => {
  const untilEpoch = period.untilEpoch === null ? indexedEpoch : min(period.untilEpoch, indexedEpoch);

  return period.rate * epochsApplicable(period.startEpoch, untilEpoch, windowStart, windowEnd);
};
