/**
 * One rail's spend history, in the shape the chart's maths needs it.
 *
 * Deliberately says nothing about GraphQL: `toRailSpendInput` is the only place
 * that knows the query's shape, so replacing the nested read with paged
 * top-level queries changes that one function and leaves the maths and
 * components alone.
 */
export type RailSpendInput = {
  /** Latest observed streaming rate, per epoch. A terminated rail may still be reduced before `endEpoch`. */
  paymentRate: bigint;
  /** `0n` while the rail is running; the last chargeable epoch once terminated. */
  endEpoch: bigint;
  /** Exclusive lower bound on accrual, like a segment's `startEpoch`. */
  createdAtEpoch: bigint;
  /** Historical rate segments, each spanning `(startEpoch, untilEpoch]`. Order is not significant. */
  segments: Array<{ startEpoch: bigint; untilEpoch: bigint; rate: bigint }>;
  /** One-time payments, gross, stamped with the unix second they were made. */
  oneTimePayments: Array<{ amount: bigint; timestamp: bigint }>;
};

/**
 * One calendar month in the viewer's local timezone.
 *
 * Epoch bounds use `(start, end]`; timestamp bounds use `[start, end)`. The two
 * differ on purpose — epochs follow the protocol's settlement intervals, while
 * timestamps bucket discrete payments, where half-open is what stops one landing
 * on a boundary being counted twice. Either tiles the range; harmonising them
 * would break that.
 */
export type MonthWindow = {
  /** Short axis label, e.g. "Mar". */
  label: string;
  /** Unambiguous label for the tooltip, e.g. "March 2026". */
  fullLabel: string;
  startEpoch: bigint;
  endEpoch: bigint;
  /** Unix seconds at local midnight starting the month. */
  startTimestamp: bigint;
  /** Unix seconds at local midnight starting the *next* month. */
  endTimestamp: bigint;
  /** The window runs past the present, so its bar is still filling. */
  isPartial: boolean;
};

/** One bar: a month's scheduled maximum, split into the two segments that stack. */
export type SpendSeriesRow = {
  label: string;
  fullLabel: string;
  isPartial: boolean;
  /** Estimated ceiling, not a charge — see `accrueRailInWindow`. */
  streaming: bigint;
  /** Gross one-time payments actually made in the month. */
  oneTime: bigint;
  /** An estimated ceiling plus actual payments — an upper bound, never a settled total. */
  total: bigint;
};
