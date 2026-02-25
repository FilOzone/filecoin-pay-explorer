import { createPublicClient, http, type PublicClient } from "viem";
import { getChain } from "@/constants/chains";
import type { Network } from "@/types";

const clients = new Map<Network, PublicClient>();

export function getPublicClient(network: Network): PublicClient {
  const existing = clients.get(network);
  if (existing) {
    return existing;
  }

  const chain = getChain(network);
  const client = createPublicClient({
    chain,
    transport: http(),
  });

  clients.set(network, client);
  return client;
}
