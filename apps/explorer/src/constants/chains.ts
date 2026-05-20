import { calibration as synapseCalibration, mainnet as synapseMainnet } from "@filoz/synapse-sdk";

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
  };
}

export const mainnet: Chain = {
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
  },
};

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
