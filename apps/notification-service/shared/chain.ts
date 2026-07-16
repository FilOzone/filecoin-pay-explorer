import { calibration, mainnet } from "@filoz/synapse-sdk";

/**
 * Network selector — the only network config carried in wrangler `vars`.
 * Everything else (FilecoinPay address, ABI, default RPC) is derived from the
 * Synapse SDK chain objects, the same canonical source the explorer uses.
 */
export type Network = "mainnet" | "calibration";

export function getChain(network: Network) {
  return network === "mainnet" ? mainnet : calibration;
}

export function filecoinPayAddress(network: Network): string {
  return getChain(network).contracts.filecoinPay.address;
}
