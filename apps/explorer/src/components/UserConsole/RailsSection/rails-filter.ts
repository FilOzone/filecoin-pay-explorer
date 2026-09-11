import { isAddress } from "viem";
import type { ServiceRailsFilter } from "@/hooks/useAccountServices";
import { formatAddress } from "@/utils/formatter";

/**
 * Classifies one search box by the shape of what was typed: an address filters
 * on payee, anything else on rail ID. Both are exact — the subgraph does the
 * filtering, so a partial value would simply match nothing.
 *
 * Checksum is not enforced: the payee column renders lowercase addresses, so a
 * pasted value would fail a strict check.
 */
export function toServiceRailsFilter(query: string): ServiceRailsFilter {
  const trimmed = query.trim();

  if (!trimmed) {
    return {};
  }

  if (isAddress(trimmed, { strict: false })) {
    return { payee: trimmed };
  }

  return { railId: trimmed };
}

/** Rail IDs are integers; anything else can only have been meant as an address. */
export function isSearchable(query: string): boolean {
  const trimmed = query.trim();
  return isAddress(trimmed, { strict: false }) || /^\d+$/.test(trimmed);
}

/** How an applied filter reads back to the user. */
export function describeServiceRailsFilter(filter: ServiceRailsFilter): { label: string; value: string } | undefined {
  if (filter.payee) {
    return { label: "Payee", value: formatAddress(filter.payee) };
  }

  if (filter.railId) {
    return { label: "Rail ID", value: filter.railId };
  }

  return undefined;
}
