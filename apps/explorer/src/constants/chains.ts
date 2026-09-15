import { calibration as synapseCalibration, mainnet as synapseMainnet } from "@filoz/synapse-sdk";
import type { Address } from "viem";
import { arbitrum, avalanche, base, bsc, mainnet as ethereum, optimism, polygon } from "viem/chains";

import type { Network } from "@/types";

type SynapseChain = typeof synapseMainnet;

/**
 * Synapse chain augmented with explorer display fields and a `payments`
 * alias for the `filecoinPay` contract.
 *
 * The full synapse contract set (`filecoinPay`, `fwss`, …) and
 * `genesisTimestamp` are preserved so that the chain object carried by the
 * wagmi connector client passes `@filoz/synapse-core`'s `asChain` validation
 * when a wallet (e.g. MetaMask) is connected.
 */
export interface Chain extends SynapseChain {
  label: string;
  slug: Network;
  contracts: SynapseChain["contracts"] & {
    payments: SynapseChain["contracts"]["filecoinPay"];
    /** Mainnet only. The direct Squid deposit's FIL top-up swaps USDFC to WFIL through this pool. */
    sushi?: { router: Address; wfil: Address; wfilUsdfcPoolFee: number };
  };
}

export const mainnet = {
  ...synapseMainnet,
  label: "Mainnet",
  slug: "mainnet",
  rpcUrls: {
    default: {
      http: ["https://api.node.glif.io/rpc/v1"],
      webSocket: ["wss://wss.node.glif.io/apigw/lotus/rpc/v1"],
    },
  },
  blockExplorers: {
    Beryx: {
      name: "Beryx",
      url: "https://beryx.io/fil/mainnet",
    },
    Filfox: {
      name: "Filfox",
      url: "https://filfox.info",
    },
    Glif: {
      name: "Glif",
      url: "https://www.glif.io/en",
    },
    default: {
      name: "Blockscout",
      url: "https://filecoin.blockscout.com",
    },
  },
  contracts: {
    ...synapseMainnet.contracts,
    payments: synapseMainnet.contracts.filecoinPay,
    sushi: {
      router: "0x0389879e0156033202C44BF784ac18fC02edeE4f",
      wfil: "0x60E1773636CF5E4A227d9AC24F20fEca034ee25A",
      wfilUsdfcPoolFee: 500,
    },
  },
} satisfies Chain;

export const calibration: Chain = {
  ...synapseCalibration,
  label: "Calibration",
  slug: "calibration",
  rpcUrls: {
    default: {
      http: ["https://api.calibration.node.glif.io/rpc/v1"],
      webSocket: ["wss://wss.calibration.node.glif.io/apigw/lotus/rpc/v1"],
    },
  },
  blockExplorers: {
    Beryx: {
      name: "Beryx",
      url: "https://beryx.io/fil/calibration",
    },
    Filfox: {
      name: "Filfox",
      url: "https://calibration.filfox.info",
    },
    Glif: {
      name: "Glif",
      url: "https://www.glif.io/en/calibrationnet",
    },
    default: {
      name: "Blockscout",
      url: "https://filecoin-testnet.blockscout.com",
    },
  },
  contracts: {
    ...synapseCalibration.contracts,
    payments: synapseCalibration.contracts.filecoinPay,
  },
};

export const SQUID_SOURCE_CHAINS = [
  mainnet,
  { ...arbitrum, name: "Arbitrum" },
  ethereum,
  base,
  { ...optimism, name: "Optimism" },
  polygon,
  avalanche,
  { ...bsc, name: "BNB Chain" },
] as const;

/**
 * Get a chain by network name
 * @param network - The network name. Defaults to calibration.
 */
export function getChain(network: Network = "calibration"): Chain {
  switch (network) {
    case "mainnet":
      return mainnet;
    case "calibration":
      return calibration;
    default:
      throw new Error(`Chain with network ${network} not found`);
  }
}
