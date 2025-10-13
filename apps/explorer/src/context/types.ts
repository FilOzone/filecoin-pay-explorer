import { Synapse } from "@filoz/synapse-sdk";
import type { Hex } from "viem";
import type { ChainConstants } from "@/utils/constants";

export interface IConstants {
  network: "calibration" | "mainnet";
  usdfcAddress: Hex;
}

export interface SynapseContextType {
  constants: ChainConstants;
  synapse: Synapse | null;
}
