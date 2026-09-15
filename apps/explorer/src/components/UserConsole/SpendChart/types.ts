/**
 * One stretch of epochs during which a single rail charged one rate.
 *
 * The subgraph's rate timeline is complete: it opens a period at rail creation
 * and closes one on every rate change and on termination. So a period needs no
 * context from its rail — nothing has to be reconstructed from the rail's
 * current rate, creation time or end epoch.
 */
export type RatePeriod = {
  rate: bigint;
  /** Exclusive: the rate applies from `startEpoch + 1`. */
  startEpoch: bigint;
  /** Inclusive. `null` while the period is open, so it runs to the indexed epoch. */
  untilEpoch: bigint | null;
  /** Lowercase, for grouping and for looking up a display name. */
  operatorAddress: string;
};

export type OneTimePaymentEntry = {
  /** Gross, as debited from the payer. */
  amount: bigint;
  /** Unix seconds. */
  timestamp: bigint;
  /** Lowercase, for grouping and for looking up a display name. */
  operatorAddress: string;
};

/**
 * The account's spend history for one token, in the shape the chart's maths needs.
 *
 * Deliberately says nothing about GraphQL: `toSpendHistory` is the only place
 * that knows the query's shape, so a change to how the data is fetched touches
 * that one function and leaves the maths and components alone.
 *
 */
export type SpendHistory = {
  periods: RatePeriod[];
  oneTimePayments: OneTimePaymentEntry[];
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

/** One service's share of a month, streaming and one-time combined. */
export type OperatorSpend = {
  /** Lowercase. */
  address: string;
  amount: bigint;
};

/** One bar: a month's scheduled maximum, split into the two segments that stack. */
export type SpendSeriesRow = {
  label: string;
  fullLabel: string;
  isPartial: boolean;
  /** Scheduled ceiling, not a charge — see `accruePeriodInWindow`. */
  streaming: bigint;
  /** Gross one-time payments actually made in the month. */
  oneTime: bigint;
  /** A scheduled ceiling plus actual payments — an upper bound, never a settled total. */
  total: bigint;
  /**
   * Who the month went to, largest first, summing to `total`. Services are named
   * where known and shown by address otherwise, so an unrecognised one is still
   * distinguishable rather than lumped into an "other" bucket.
   */
  byOperator: OperatorSpend[];
};
