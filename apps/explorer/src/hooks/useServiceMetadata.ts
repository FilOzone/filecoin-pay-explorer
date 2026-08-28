import { useReadContracts } from "wagmi";
import useSynapse from "@/hooks/useSynapse";

/**
 * IFilecoinServiceMetadata getters (filecoin-services#551), live on mainnet
 * FWSS v1.3.1+. Declared inline because the synapse-sdk FWSS ABI predates the
 * homepage() getter.
 */
const SERVICE_METADATA_ABI = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "description", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "homepage", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

export type ServiceMetadata = {
  name?: string;
  description?: string;
  homepage?: string;
};

/**
 * Reads the FWSS service metadata (name/description/homepage) from the chain
 * the wallet is on. Values are unavailable (undefined) while loading, on
 * read failure, or on chains whose FWSS predates the metadata getters —
 * callers render their own fallbacks.
 */
export const useServiceMetadata = (): ServiceMetadata => {
  const { constants } = useSynapse();
  const address = constants.chain.contracts.fwss.address;

  const { data } = useReadContracts({
    contracts: SERVICE_METADATA_ABI.map((fn) => ({
      address,
      abi: SERVICE_METADATA_ABI,
      functionName: fn.name,
    })),
    allowFailure: true,
    query: { staleTime: Number.POSITIVE_INFINITY },
  });

  const [name, description, homepage] = (data ?? []).map((entry) =>
    entry.status === "success" && typeof entry.result === "string" && entry.result.length > 0
      ? entry.result
      : undefined,
  );

  return {
    name,
    description,
    // Contract-supplied homepage is untrusted display data: only surface it
    // when it looks like a plain http(s) URL, and never hyperlink it — copy only.
    homepage: homepage && /^https?:\/\/\S+$/.test(homepage) ? homepage : undefined,
  };
};
