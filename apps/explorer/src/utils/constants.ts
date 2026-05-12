import { calibration, mainnet } from "@/constants/chains";
import type { supportedChains } from "@/services/wagmi/config";
import type { ChainConstants } from "@/types";

export const UNLIMITED_THRESHOLD = BigInt("1000000000000000000000000000000000000000000000000000000000000");
export const EPOCH_DURATION = 30;

export const FUNDING_WARNING_THRESHOLD_SECONDS = 7 * 24 * 60 * 60;

export const DEFAULT_THEME = "system";
export const THEME_STORAGE_KEY = "filecoin-pay-explorer-theme";
export const DEFAULT_TOAST_POSITION = "top-right";
export const DEFAULT_NETWORK = "mainnet";

export const explorerUrls = {
  mainnet: "https://filfox.info/en",
  calibration: "https://calibration.filfox.info/en",
};

export const appConstants: Record<(typeof supportedChains)[number]["id"], ChainConstants> = {
  [calibration.id]: {
    chain: calibration,
    label: "Calibration",
    contracts: {
      usdfc: calibration.contracts.usdfc.address,
      payments: calibration.contracts.payments,
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
  [mainnet.id]: {
    chain: mainnet,
    label: "Mainnet",
    contracts: {
      usdfc: mainnet.contracts.usdfc.address,
      payments: mainnet.contracts.payments,
    },
  },
} as const;
