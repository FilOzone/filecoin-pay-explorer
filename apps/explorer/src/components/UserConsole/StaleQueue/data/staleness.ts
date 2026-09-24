import type { DataSet } from "@filecoin-pay/types";
import { monthlyDataSetSpend } from "../../DatasetsSection/data/monthlySpend";

/** A dataset with no write for this many days shows up in the triage queue. */
export const STALE_AFTER_DAYS = 30;

const SECONDS_PER_DAY = 86_400n;

export type RankedDataSet = {
  dataSet: DataSet;
  days: bigint;
  /** Undefined until the current epoch is known for a terminated rail. */
  monthlySpend: bigint | undefined;
};

/** Whole days since the dataset's last write, floored, never negative. */
export function daysInactive(lastWriteAt: bigint, nowSeconds: bigint): bigint {
  // GraphQL BigInt values arrive as decimal strings.
  const elapsed = nowSeconds - BigInt(lastWriteAt);
  return elapsed > 0n ? elapsed / SECONDS_PER_DAY : 0n;
}

/**
 * Highest monthly spend × days inactive first. An unknown spend ranks as zero,
 * and ties keep the input order.
 */
export function rankStaleDataSets(
  dataSets: DataSet[],
  currentEpoch: bigint | undefined,
  nowSeconds: bigint,
): RankedDataSet[] {
  const ranked = dataSets.map((dataSet) => ({
    dataSet,
    days: daysInactive(dataSet.lastWriteAt, nowSeconds),
    monthlySpend: monthlyDataSetSpend(dataSet, currentEpoch),
  }));
  const weight = (entry: RankedDataSet) => (entry.monthlySpend ?? 0n) * entry.days;

  return ranked.sort((a, b) => {
    const difference = weight(b) - weight(a);
    if (difference === 0n) return 0;
    return difference > 0n ? 1 : -1;
  });
}
