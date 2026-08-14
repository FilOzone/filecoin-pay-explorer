import { supportedChains } from "@/services/wagmi/config";
import type { Network } from "@/types";
import { DEFAULT_NETWORK } from "@/utils/constants";

export function isSupportedChainId(chainId: number | undefined): boolean {
  if (!chainId) return false;
  return supportedChains.some((c) => c.id === chainId);
}

export function getNetworkFromChainId(chainId: number | undefined): Network {
  if (!chainId) return DEFAULT_NETWORK;

  const chain = supportedChains.find((c) => c.id === chainId);
  return chain?.slug || DEFAULT_NETWORK;
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

export function getSubgraphUrl(network: Network): string {
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
