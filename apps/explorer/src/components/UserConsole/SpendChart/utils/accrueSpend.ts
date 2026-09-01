import type { RailSpendInput } from "../types";

type RateSegment = RailSpendInput["segments"][number];

const max = (a: bigint, b: bigint): bigint => (a > b ? a : b);
const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);

/**
 * Counts the epochs in the intersection of a rate segment and a window.
 *
 * Both intervals use `(start, end]`, so their length is `end - start`. Adding
 * one would count a shared boundary twice across adjacent intervals.
 *
 * Mirrors `epochsRateChangeApplicable` in `packages/subgraph/src/utils/helpers.ts`.
 */
export const epochsApplicable = (segment: RateSegment, windowStart: bigint, windowEnd: bigint): bigint => {
  const start = max(segment.startEpoch, windowStart);
  const end = min(segment.untilEpoch, windowEnd);

  return end <= start ? 0n : end - start;
};

/**
 * Estimates the gross scheduled streaming amount for a rail in an epoch window.
 *
 * This is not the amount paid or the final service cost. A validator may reduce
 * the proposed `rate × epochs` amount or make it zero — FWSS does this for
 * pre-activation, unproven, and partially proven ranges, and FilecoinPay debits
 * the `modifiedAmount` the validator returns. Network fees and operator
 * commission are deducted from the gross amount rather than added to the payer's
 * debit.
 *
 * The subgraph data is not a complete rate timeline. It does not record the
 * initial zero-to-positive rate boundary, and `enqueueRateChange` skips the queue
 * entirely when the rail was already settled through the rate-change block
 * (`FilecoinPayV1.sol`, mirrored at `packages/subgraph/src/payments.ts`). Missing
 * history is reconstructed from the nearest known rate, so this result can
 * overestimate or underestimate the scheduled amount. Only a subgraph-side rate
 * timeline fixes that; until then, describe the output as an estimate.
 *
 * Segment order does not matter. Accrual stops at the indexed epoch or the
 * rail's inclusive termination epoch, whichever comes first.
 */
export const accrueRailInWindow = (
  rail: RailSpendInput,
  windowStart: bigint,
  windowEnd: bigint,
  indexedEpoch: bigint,
): bigint => {
  const start = max(windowStart, rail.createdAtEpoch);
  const railEnd = rail.endEpoch > 0n ? min(rail.endEpoch, indexedEpoch) : indexedEpoch;
  const end = min(windowEnd, railEnd);

  if (end <= start) return 0n;

  let total = 0n;
  let latestSegmentEnd = start;
  let earliestSegment: RateSegment | undefined;

  for (const segment of rail.segments) {
    total += segment.rate * epochsApplicable(segment, start, end);
    latestSegmentEnd = max(latestSegmentEnd, segment.untilEpoch);

    if (earliestSegment === undefined || segment.startEpoch < earliestSegment.startEpoch) {
      earliestSegment = segment;
    }
  }

  // The first stored segment can begin after the rail started charging because
  // settlement advances `settledUpto`. Use its rate for the uncovered leading
  // interval. This also applies that rate to any unrecorded initial zero-rate
  // gap, which is one source of overestimation.
  if (earliestSegment !== undefined) {
    const leadingEnd = min(earliestSegment.startEpoch, end);

    if (leadingEnd > start) {
      total += earliestSegment.rate * (leadingEnd - start);
    }
  }

  // The latest rate has no closing segment. The subgraph keeps this value after
  // on-chain finalization — `_zeroOutRail` clears the rate on chain but no
  // handler mirrors that — which is what keeps a terminated rail's history
  // readable. Mirroring it would make every finalized rail report zero for every
  // month. Rate decreases recorded before `endEpoch` are already covered by the
  // historical segments above.
  if (latestSegmentEnd < end) {
    total += rail.paymentRate * (end - latestSegmentEnd);
  }

  return total;
};
