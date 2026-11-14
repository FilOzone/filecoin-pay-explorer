import { type ResolvedAddressName, resolveAddressName } from "@/constants/known-addresses";
import { useAddressServiceMetadata } from "@/hooks/useServiceMetadata";
import type { Network } from "@/types";

export interface AddressName {
  name: ResolvedAddressName | undefined;
  /** The contract's onchain description; dropped when its name is rejected as impersonation. */
  description: string | undefined;
}

/** Names an address from the curated list and its onchain service metadata. Until the read lands, only a curated name resolves. */
export function useAddressName(address: string | undefined, network: Network): AddressName {
  const { data: metadata } = useAddressServiceMetadata(address, network);
  const name = address ? resolveAddressName(address, metadata?.name) : undefined;
  const description = name?.source === "rejected" ? undefined : metadata?.description;
  return { name, description };
}
