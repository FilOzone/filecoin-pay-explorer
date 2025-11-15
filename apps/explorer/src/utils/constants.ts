import { CONTRACT_ADDRESSES } from "@filoz/synapse-sdk";
import { filecoinCalibration } from "viem/chains";
import { paymentsAbi } from "@/abi/payments";
import type { supportedChains } from "@/services/wagmi/config";
import type { ChainConstants } from "@/types";

export const UNLIMITED_THRESHOLD = BigInt("1000000000000000000000000000000000000000000000000000000000000");
export const SETTLEMENT_FEE = 1300000000000000n;
export const EPOCH_DURATION = 30;

export const FUNDING_WARNING_THRESHOLD_SECONDS = 7 * 24 * 60 * 60;

export const DEFAULT_THEME = "system";
export const THEME_STORAGE_KEY = "filecoin-pay-explorer-theme";
export const DEFAULT_TOAST_POSITION = "top-right";

export const explorerUrls = {
  mainnet: "https://filfox.info/en",
  calibration: "https://calibration.filfox.info/en",
};

export const appConstants: Record<(typeof supportedChains)[number]["id"], ChainConstants> = {
  [filecoinCalibration.id]: {
    chain: filecoinCalibration,
    label: "Calibration",
    contracts: {
      usdfc: CONTRACT_ADDRESSES.USDFC.calibration,
      payments: {
        address: "0x09a0fDc2723fAd1A7b8e3e00eE5DF73841df55a0",
        abi: paymentsAbi,
      },
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
