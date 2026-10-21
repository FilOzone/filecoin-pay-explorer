import { queryOptions, type UseQueryResult, useQueries, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { isAddress, zeroAddress } from "viem";
import { getPublicClient } from "@/services/viem/client";
import type { Network } from "@/types";

// IFilecoinServiceMetadata: minimal service identity exposed by FOC service
// contracts. All three values are untrusted display-only text from the
// contract — render as plain text, never hyperlink (homepage gets a copy
// affordance instead). Contracts predating the interface, and EOAs, simply
// fail the calls and callers fall back to their local labels.
const metadataAbi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "description", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "homepage", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

const METADATA_FIELDS = ["name", "description", "homepage"] as const;

export interface ServiceMetadata {
  name?: string;
  description?: string;
  homepage?: string;
}

const MAX_METADATA_BYTES = 256;

// A homepage renders only when it looks like a plain URL (no whitespace
// tricks). Applied here, at the boundary, so no consumer can forget it.
const HOMEPAGE_PATTERN = /^https?:\/\/\S+$/i;

async function fetchServiceMetadata(address: `0x${string}`, network: Network): Promise<ServiceMetadata> {
  const results = await getPublicClient(network).multicall({
    allowFailure: true,
    contracts: METADATA_FIELDS.map((functionName) => ({ address, abi: metadataAbi, functionName })),
  });

  const metadata: ServiceMetadata = {};
  METADATA_FIELDS.forEach((field, index) => {
    const result = results[index];
    if (result?.status !== "success" || typeof result.result !== "string") return;
    // Newlines in a name or description could fake the address line of a tooltip.
    const text = field === "homepage" ? result.result : result.result.replace(/\s+/g, " ").trim();
    // Enforce the interface's byte cap defensively on the display side.
    const value = text.slice(0, MAX_METADATA_BYTES);
    if (value.length === 0) return;
    if (field !== "homepage" || HOMEPAGE_PATTERN.test(value)) metadata[field] = value;
  });
  return metadata;
}

/** One cache entry per (network, address), shared by every hook below. */
export const serviceMetadataQueryOptions = (address: string, network: Network) =>
  queryOptions({
    queryKey: ["serviceMetadata", network, address.toLowerCase()],
    queryFn: () => fetchServiceMetadata(address as `0x${string}`, network),
    staleTime: 60 * 60 * 1000,
  });

/** Metadata for one address; pass `undefined` to skip the read. The zero address (no validator) is skipped too. */
export function useAddressServiceMetadata(address: string | undefined, network: Network) {
  const enabled = !!address && isAddress(address) && address !== zeroAddress;
  return useQuery({ ...serviceMetadataQueryOptions(address ?? "", network), enabled });
}

export interface ServiceMetadataResult {
  /** Keyed by lowercase address; only addresses that published something. */
  metadata: Map<string, ServiceMetadata>;
  isLoading: boolean;
}

/**
 * @param network Network to read from: the one backing the data these
 * addresses came from, not the wallet's chain.
 */
export function useServiceMetadata(addresses: string[], network: Network): ServiceMetadataResult {
  // Keyed on the addresses themselves so callers need not memoize the array.
  const addressKey = addresses
    .filter((address) => isAddress(address))
    .map((address) => address.toLowerCase())
    .join(",");
  const validAddresses = useMemo(() => (addressKey ? addressKey.split(",") : []), [addressKey]);

  const combine = useCallback(
    (results: UseQueryResult<ServiceMetadata>[]): ServiceMetadataResult => {
      const metadata = new Map<string, ServiceMetadata>();
      results.forEach((result, index) => {
        if (result.data && Object.keys(result.data).length > 0) metadata.set(validAddresses[index], result.data);
      });
      return { metadata, isLoading: results.some((result) => result.isLoading) };
    },
    [validAddresses],
  );

  return useQueries({
    queries: validAddresses.map((address) => serviceMetadataQueryOptions(address, network)),
    combine,
  });
}
