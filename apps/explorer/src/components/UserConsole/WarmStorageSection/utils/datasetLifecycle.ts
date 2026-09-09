import type { MockDataset } from "../data/mockDatasets";
import { MOCK_NOW } from "../data/mockDatasets";

const MS_PER_DAY = 86_400_000;

export const daysBetween = (from: string | Date, to: Date = MOCK_NOW): number =>
  Math.max(0, Math.floor((to.getTime() - new Date(from).getTime()) / MS_PER_DAY));

export const daysUntil = (target: string, from: Date = MOCK_NOW): number =>
  Math.floor((new Date(target).getTime() - from.getTime()) / MS_PER_DAY);

/**
 * Days since the best activity signal we have: retrieval recency when FilBeam
 * serves the dataset, last write (piece added) otherwise. The two are not
 * equivalent — callers that surface this number must also surface which signal
 * it came from (see RetrievalBadge / StaleQueue copy).
 */
export const daysInactive = (dataset: MockDataset): number => {
  const writeDays = daysBetween(dataset.lastWriteAt);
  if (!dataset.retrieval) return writeDays;
  return Math.min(writeDays, daysBetween(dataset.retrieval.lastRetrievedAt));
};

export const STALE_AFTER_DAYS = 90;

export const isStale = (dataset: MockDataset): boolean => daysInactive(dataset) >= STALE_AFTER_DAYS;

/** Spend since the last activity signal: the money "paying for nothing" so far. */
export const wastedSpendUSD = (dataset: MockDataset): number => daysInactive(dataset) * dataset.burnPerDayUSD;

export const formatUSD = (value: number): string =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" });

export const formatDate = (value: string): string =>
  new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const formatDaysAgo = (value: string): string => {
  const days = daysBetween(value);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
};
