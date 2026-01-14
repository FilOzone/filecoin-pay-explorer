import type { Synapse } from "@filoz/synapse-sdk";
import type { Hex } from "viem";
import type { ChainConstants, Network } from "@/types";

export interface IConstants {
  network: Network;
  usdfcAddress: Hex;
}

export interface SynapseContextType {
  constants: ChainConstants;
  synapse: Synapse | null;
}

export interface NetworkContextType {
  network: Network;
  setNetwork: React.Dispatch<React.SetStateAction<Network>>;
  subgraphUrl: string;
}
