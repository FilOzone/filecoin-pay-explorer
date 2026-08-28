import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import useSynapse from "@/hooks/useSynapse";

// IFilecoinServiceMetadata (filecoin-services#551): minimal service identity
// exposed by FOC service contracts. All three values are untrusted display-only
// text from the contract — render as plain text, never hyperlink (homepage gets
// a copy affordance instead). Contracts predating the interface simply fail the
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

export function useServiceMetadata(addresses: string[]): Map<string, ServiceMetadata> {
  const validAddresses = useMemo(() => addresses.filter((address) => /^0x[0-9a-fA-F]{40}$/.test(address)), [addresses]);

  const { data } = useReadContracts({
    contracts: validAddresses.flatMap((address) =>
      METADATA_FIELDS.map((functionName) => ({
        address: address as `0x${string}`,
        abi: metadataAbi,
        functionName,
      })),
    ),
    query: { staleTime: 60 * 60 * 1000 },
  });

  return useMemo(() => {
    const map = new Map<string, ServiceMetadata>();
    if (!data) return map;
    validAddresses.forEach((address, index) => {
      const metadata: ServiceMetadata = {};
      METADATA_FIELDS.forEach((field, fieldIndex) => {
        const result = data[index * METADATA_FIELDS.length + fieldIndex];
        if (result?.status === "success" && typeof result.result === "string" && result.result.length > 0) {
          // Enforce the interface's byte cap defensively on the display side.
          metadata[field] = result.result.slice(0, MAX_METADATA_BYTES);
        }
      });
      if (Object.keys(metadata).length > 0) map.set(address.toLowerCase(), metadata);
    });
    return map;
  }, [data, validAddresses]);
}

/**
 * The Warm Storage service's own metadata on the wallet's current chain —
 * convenience over useServiceMetadata for the console surfaces that render
 * FWSS identity (service page header, sidebar label, dashboard rollup).
 * Homepage is additionally gated to a plain http(s) URL: it is copy-only
 * display text and must never look linkable when it isn't one.
 */
export function useWarmStorageMetadata(): ServiceMetadata {
  const { constants } = useSynapse();
  const address = constants.chain.contracts.fwss.address;
  const metadata = useServiceMetadata(useMemo(() => [address], [address])).get(address.toLowerCase()) ?? {};
  return {
    ...metadata,
    homepage: metadata.homepage && /^https?:\/\/\S+$/.test(metadata.homepage) ? metadata.homepage : undefined,
  };
}
