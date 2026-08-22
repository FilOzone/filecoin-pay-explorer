import { fallback, http, type Transport } from "viem";

// viem's default per-chain RPCs rate-limit by IP and fail CORS in the browser;
// use explicit CORS-friendly endpoints, most reliable first, viem default last.
export const SOURCE_RPC_URLS: Record<number, readonly string[]> = {
  1: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"],
  10: ["https://optimism-rpc.publicnode.com", "https://optimism.drpc.org"],
  56: ["https://bsc-rpc.publicnode.com", "https://bsc.drpc.org"],
  137: ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"],
  8453: ["https://base-rpc.publicnode.com", "https://base.drpc.org"],
  42161: ["https://arbitrum-one-rpc.publicnode.com", "https://arbitrum.drpc.org"],
  43114: ["https://avalanche-c-chain-rpc.publicnode.com", "https://avalanche.drpc.org"],
};

export function chainTransport(chainId: number): Transport {
  const urls = SOURCE_RPC_URLS[chainId];
  if (!urls) return http();
  return fallback([...urls.map((url) => http(url)), http()]);
}
