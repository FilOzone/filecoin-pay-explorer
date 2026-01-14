import { supportedChains } from "@/services/wagmi/config";
import type { Network } from "@/types";

export function isSupportedChainId(chainId: number | undefined): boolean {
  if (!chainId) return false;
  return supportedChains.some((c) => c.id === chainId);
}

export function getNetworkFromChainId(chainId: number | undefined): Network {
  if (!chainId) return "mainnet";

  const chain = supportedChains.find((c) => c.id === chainId);
  return chain?.slug || "mainnet";
}

export function getSubgraphUrl(network: Network): string {
  const projectId = process.env.NEXT_PUBLIC_GOLDSKY_PROJECT_ID;
  const subgraphNames = {
    mainnet: process.env.NEXT_PUBLIC_GOLDSKY_MAINNET_SUBGRAPH_NAME,
    calibration: process.env.NEXT_PUBLIC_GOLDSKY_CALIBRATION_SUBGRAPH_NAME,
  };
  const subgraphVersions = {
    mainnet: process.env.NEXT_PUBLIC_GOLDSKY_MAINNET_SUBGRAPH_VERSION,
    calibration: process.env.NEXT_PUBLIC_GOLDSKY_CALIBRATION_SUBGRAPH_VERSION,
  };

  return `https://api.goldsky.com/api/public/${projectId}/subgraphs/${subgraphNames[network]}/${subgraphVersions[network]}/gn`;
}
