import type { Synapse } from "@filoz/synapse-sdk";
import type { Hex } from "viem";
import type { ChainConstants, Network } from "@/types";

export interface IConstants {
  network: "calibration" | "mainnet";
  usdfcAddress: Hex;
}

export interface SynapseContextType {
  constants: ChainConstants;
  synapse: Synapse | null;
}

export interface NetworkContextType {
  network: Network;
  setNetwork: (network: Network) => void;
  subgraphUrl: string;
}
