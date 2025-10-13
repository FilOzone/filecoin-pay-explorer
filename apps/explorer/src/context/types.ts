import { PaymentsService, Synapse } from "@filoz/synapse-sdk";
import type { Hex } from "viem";
import type { ChainConstants } from "@/utils/constants";

export interface IConstants {
  network: "calibration" | "mainnet";
  usdfcAddress: Hex;
}

export interface SynapseContextType {
  constants: ChainConstants;
  paymentsService: PaymentsService | null;
  synapse: Synapse | null;
}
