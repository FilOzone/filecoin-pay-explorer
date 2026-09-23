import type { DataSet } from "@filecoin-pay/types";
import { monthlyDataSetSpend } from "../../DatasetsSection/data/monthlySpend";

/** A dataset with no write for this many days shows up in the triage queue. */
export const STALE_AFTER_DAYS = 30;

const SECONDS_PER_DAY = 86_400n;

/**
 * Whole days since the dataset's last write, floored, never negative.
 *
 * The subgraph serializes `BigInt` fields as decimal strings over the wire;
 * the generated type calls `lastWriteAt` a `bigint`, but `graphql-request`
 * hands back the raw JSON string, so it must be converted before use.
 */
export function daysInactive(lastWriteAt: bigint, nowSeconds: bigint): bigint {
  const elapsed = nowSeconds - BigInt(lastWriteAt);
  return elapsed > 0n ? elapsed / SECONDS_PER_DAY : 0n;
}

export function isStale(lastWriteAt: bigint, nowSeconds: bigint): boolean {
  return daysInactive(lastWriteAt, nowSeconds) >= BigInt(STALE_AFTER_DAYS);
}

/**
 * Money spent since the dataset went quiet: its projected monthly rate,
 * scaled to the days it's actually been inactive. Ranks the triage queue —
 * a heuristic, not a precise accounting figure.
 */
export function wastedSpend(
  dataSet: Pick<DataSet, "pdpRail" | "cacheMissRail" | "cdnRail" | "lastWriteAt">,
  currentEpoch: bigint | undefined,
  nowSeconds: bigint,
): bigint | undefined {
  const monthlySpend = monthlyDataSetSpend(dataSet, currentEpoch);
  if (monthlySpend === undefined) return undefined;
  return (monthlySpend * daysInactive(dataSet.lastWriteAt, nowSeconds)) / 30n;
}
