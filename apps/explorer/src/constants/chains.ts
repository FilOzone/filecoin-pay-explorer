import { toChain, validateDevnetInfo } from "@filoz/synapse-core/devnet";
import { calibration as synapseCalibration, mainnet as synapseMainnet } from "@filoz/synapse-sdk";
import type { Address } from "viem";
import { arbitrum, avalanche, base, bsc, mainnet as ethereum, optimism, polygon } from "viem/chains";

import type { FaucetProvider, Network } from "@/types";

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
    sushi?: { router: Address; quoter: Address; wfil: Address; wfilUsdfcPoolFee: number };
  };
  /** Testnet faucets; mainnet has none. */
  faucets?: FaucetProvider[];
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
      quoter: "0x3b9E156E93146B10551840701337B1C5356B1A98",
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
  faucets: [
    {
      name: "Get FIL",
      url: "https://faucet.calibnet.chainsafe-fil.io/funds.html",
      asset: "FIL",
    },
    {
      name: "Get USDFC",
      url: "https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc",
      asset: "USDFC",
    },
  ],
};

/**
 * A local foc-devnet, for console development only: `next dev` with NEXT_PUBLIC_DEVNET_INFO set (the devnet's
 * devnet-info.json). Undefined in any other build, so the env var leaking into a deployment adds nothing.
 * It has no subgraph (see getSubgraphUrl). In the browser, RPC goes through the /api/devnet-rpc rewrite in
 * next.config.ts, since Lotus sends no CORS headers; on the server it goes to Lotus directly.
 */
export const devnet: Chain | undefined =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEVNET_INFO
    ? devnetChain(process.env.NEXT_PUBLIC_DEVNET_INFO)
    : undefined;

function devnetChain(json: string): Chain {
  const chain = toChain(validateDevnetInfo(JSON.parse(json)));
  const lotus = chain.rpcUrls.default.http[0];
  const rpc = typeof window === "undefined" ? lotus : `${window.location.origin}/api/devnet-rpc`;
  return {
    ...chain,
    label: "Devnet",
    slug: "devnet",
    rpcUrls: { default: { http: [rpc] } },
    contracts: { ...chain.contracts, payments: chain.contracts.filecoinPay },
  } as unknown as Chain; // synapse-core's devnet chain carries its own (older) ABI types
}

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
    case "devnet":
      if (devnet) return devnet;
      break;
  }
  throw new Error(`Chain with network ${network} not found`);
}
