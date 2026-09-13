import { isAddress } from "viem";
import type { ServiceRailsFilter } from "@/hooks/useAccountServices";
import { formatAddress } from "@/utils/formatter";

/** Rail IDs are unsigned integers; the subgraph filters them as BigInt. */
const RAIL_ID_PATTERN = /^\d+$/;

export type ServiceRailsSearch = {
  /** What to narrow the query by. Empty when nothing in the box can match. */
  filter: ServiceRailsFilter;
  /** How it reads back to the user. Present exactly when `filter` narrows. */
  summary?: { label: string; value: string };
};

/**
 * Reads one search box by the shape of what was typed: an address narrows on
 * payee, digits on rail ID, and anything else narrows on nothing. Both are
 * exact — the subgraph does the matching, so a partial value would match
 * nothing rather than narrow the list.
 */
export function parseServiceRailsSearch(query: string): ServiceRailsSearch {
  const trimmed = query.trim();

  if (isAddress(trimmed, { strict: false })) {
    return { filter: { payee: trimmed }, summary: { label: "Payee", value: formatAddress(trimmed) } };
  }

  if (RAIL_ID_PATTERN.test(trimmed)) {
    return { filter: { railId: trimmed }, summary: { label: "Rail ID", value: trimmed } };
  }

  return { filter: {} };
}
