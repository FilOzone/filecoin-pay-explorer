import { TIME_CONSTANTS } from "@filoz/synapse-sdk";

export const UNLIMITED_THRESHOLD = BigInt("1000000000000000000000000000000000000000000000000000000000000");
export const EPOCH_DURATION = TIME_CONSTANTS.EPOCH_DURATION;
export const WITHDRAW_MAX_BUFFER_EPOCHS = 5;
/**
 * A service contract reserves upcoming charges from the deposit for its lockup
 * period (30 days for Filecoin Warm Storage Service), so an approval must allow
 * at least that long. Submitted with every new approval, in epochs, instead of
 * asking users to reason about epochs.
 */
export const DEFAULT_MAX_LOCKUP_PERIOD = TIME_CONSTANTS.EPOCHS_PER_MONTH;

export const DEFAULT_THEME = "system";
export const THEME_STORAGE_KEY = "filecoin-pay-explorer-theme";
export const DEFAULT_TOAST_POSITION = "top-right";
export const DEFAULT_NETWORK = "mainnet";

export const explorerUrls = {
  mainnet: "https://filfox.info/en",
  calibration: "https://calibration.filfox.info/en",
};
