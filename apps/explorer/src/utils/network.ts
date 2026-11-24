import { supportedChains } from "@/services/wagmi/config";
import type { Network } from "@/types";

export function isSupportedChainId(chainId: number | undefined): boolean {
  if (!chainId) return false;
  return supportedChains.some((c) => c.id === chainId);
}

function parseEligibleNetwork(): Network {
  const raw = (process.env.NEXT_PUBLIC_NOTIFICATIONS_ELIGIBLE_NETWORKS ?? "mainnet").trim();
  return supportedChains.some((c) => c.slug === raw) ? (raw as Network) : "mainnet";
}

export function isNotificationsEligibleNetwork(network: Network): boolean {
  return network === parseEligibleNetwork();
}

export function getNotificationsEligibleNetwork(): Network {
  return parseEligibleNetwork();
}

/** Undefined for the devnet, which has no subgraph: queries against it fail with noIndexer. */
export function getSubgraphUrl(network: Network): string | undefined {
  if (network === "devnet") return undefined;
  const urls = {
    mainnet: process.env.NEXT_PUBLIC_SUBGRAPH_URL_MAINNET,
    calibration: process.env.NEXT_PUBLIC_SUBGRAPH_URL_CALIBRATION,
  };

  const url = urls[network];

  if (!url) {
    throw new Error(`Missing environment variable: NEXT_PUBLIC_SUBGRAPH_URL_${network.toUpperCase()}`);
  }

  return url;
}

export const noIndexer = new Error("No indexer on devnet: this list needs a subgraph, and foc-devnet has none.");

/** The subgraph URL to query, or the noIndexer error. */
export function subgraphUrlOrThrow(url: string | undefined): string {
  if (url === undefined) throw noIndexer;
  return url;
}
