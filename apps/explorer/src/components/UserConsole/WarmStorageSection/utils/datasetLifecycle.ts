import type { MockDataset } from "../data/mockDatasets";
import { MOCK_NOW } from "../data/mockDatasets";

export const MS_PER_DAY = 86_400_000;

export const daysBetween = (from: string | Date, to: Date = MOCK_NOW): number =>
  Math.max(0, Math.floor((to.getTime() - new Date(from).getTime()) / MS_PER_DAY));

/**
 * Days since the last write (piece added), from indexed contract events.
 * This is the page's only activity signal: retrieval visibility needs FilBeam
 * and is out of scope here.
 */
export const daysSinceLastWrite = (dataset: MockDataset): number => daysBetween(dataset.lastWriteAt);

export const STALE_AFTER_DAYS = 90;

export const isStale = (dataset: MockDataset): boolean => daysSinceLastWrite(dataset) >= STALE_AFTER_DAYS;

export const formatUSD = (value: number): string =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" });

export const formatDate = (value: string | Date): string =>
  new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const formatDaysAgo = (value: string): string => {
  const days = daysBetween(value);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
};
