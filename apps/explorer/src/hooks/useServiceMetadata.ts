import { useMemo } from "react";
import { isAddress } from "viem";
import { useReadContracts } from "wagmi";

// IFilecoinServiceMetadata: minimal service identity exposed by FOC service
// contracts. All three values are untrusted display-only text from the
// contract — render as plain text, never hyperlink (homepage gets a copy
// affordance instead). Contracts predating the interface simply fail the
// calls and callers fall back to their local labels.
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

export interface ServiceMetadataResult {
  metadata: Map<string, ServiceMetadata>;
  isLoading: boolean;
}

export function useServiceMetadata(addresses: string[]): ServiceMetadataResult {
  const validAddresses = useMemo(() => addresses.filter((address) => isAddress(address)), [addresses]);

  const { data, isLoading } = useReadContracts({
    contracts: validAddresses.flatMap((address) =>
      METADATA_FIELDS.map((functionName) => ({
        address: address as `0x${string}`,
        abi: metadataAbi,
        functionName,
      })),
    ),
    query: { staleTime: 60 * 60 * 1000 },
  });

  const metadata = useMemo(() => {
    const map = new Map<string, ServiceMetadata>();
    if (!data) return map;
    validAddresses.forEach((address, index) => {
      const metadata: ServiceMetadata = {};
      METADATA_FIELDS.forEach((field, fieldIndex) => {
        const result = data[index * METADATA_FIELDS.length + fieldIndex];
        if (result?.status === "success" && typeof result.result === "string" && result.result.length > 0) {
          // Enforce the interface's byte cap defensively on the display side.
          const value = result.result.slice(0, MAX_METADATA_BYTES);
          if (field !== "homepage" || HOMEPAGE_PATTERN.test(value)) {
            metadata[field] = value;
          }
        }
      });
      if (Object.keys(metadata).length > 0) map.set(address.toLowerCase(), metadata);
    });
    return map;
  }, [data, validAddresses]);

  return { metadata, isLoading: validAddresses.length > 0 && isLoading };
}
