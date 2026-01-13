import { type Address, erc20Abi, type Chain as ViemChain } from "viem";

import { paymentsAbi } from "../abi/payments";

export type Contract = {
  implementation: string;
  proxy: string;
};

export type WarmStorage = {
  implementation: string;
  proxy: string;
  stateView: string;
};

export type Contracts = {
  pdp?: Partial<Contract>;
  warmStorage: WarmStorage;
  serviceProviderRegistry: Contract;
};

/**
 * Viem compatible chain interface with WarmStorage and ServiceRegistry contracts
 */
export interface Chain extends ViemChain {
  label: string;
  slug: Network;
  contracts: {
    payments: {
      address: Address;
      abi: typeof paymentsAbi;
    };
    usdfc: {
      address: Address;
      abi: typeof erc20Abi;
    };
  };
}

export const mainnet: Chain = {
  id: 314,
  label: "Mainnet",
  slug: "mainnet",
  name: "Filecoin - Mainnet",
  nativeCurrency: {
    name: "Filecoin",
    symbol: "FIL",
    decimals: 18,
  },
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
    payments: {
      address: "0x0000000000000000000000000000000000000000",
      abi: paymentsAbi,
    },
    usdfc: {
      address: "0x80B98d3aa09ffff255c3ba4A241111Ff1262F045",
      abi: erc20Abi,
    },
  },
};

export const calibration: Chain = {
  id: 314_159,
  label: "Calibration",
  slug: "calibration",
  name: "Filecoin - Calibration testnet",
  nativeCurrency: {
    name: "Filecoin",
    symbol: "tFIL",
    decimals: 18,
  },
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
    payments: {
      address: "0x09a0fDc2723fAd1A7b8e3e00eE5DF73841df55a0",
      abi: paymentsAbi,
    },
    usdfc: {
      address: "0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0",
      abi: erc20Abi,
    },
  },
};

export type Network = "calibration" | "mainnet";

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
