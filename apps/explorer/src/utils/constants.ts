import { CONTRACT_ADDRESSES } from "@filoz/synapse-sdk";
import type { Hex } from "viem";
import { filecoinCalibration } from "viem/chains";
import { supportedChains } from "@/services/wagmi/config";

export const UNLIMITED_THRESHOLD = BigInt("1000000000000000000000000000000000000000000000000000000000000");

export interface FaucetProvider {
  name: string;
  url: string;
}

export type ChainConstants = {
  chain: (typeof supportedChains)[number];
  label: string;
  contracts: {
    usdfc: Hex;
  };
  faucets?: FaucetProvider[];
};

export const appConstants: Record<(typeof supportedChains)[number]["id"], ChainConstants> = {
  [filecoinCalibration.id]: {
    chain: filecoinCalibration,
    label: "Calibration",
    contracts: {
      usdfc: CONTRACT_ADDRESSES.USDFC.calibration,
    },
    faucets: [
      {
        name: "Get FIL",
        url: "https://faucet.calibnet.chainsafe-fil.io/funds.html",
      },
      {
        name: "Get USDFC",
        url: "https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc",
      },
    ],
  },
} as const;
