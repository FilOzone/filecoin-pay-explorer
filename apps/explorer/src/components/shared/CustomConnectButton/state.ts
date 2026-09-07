export type WalletEntryState = "loading" | "login" | "preparing" | "connected";
export type WalletExitAction = "logout" | "disconnect" | "manual-disconnect";

export const WALLET_EXIT_LABEL: Record<WalletExitAction, string> = {
  logout: "Log out",
  disconnect: "Disconnect",
  "manual-disconnect": "Disconnect in wallet",
};

// Privy reports a closed login or connect modal through onError; it is not a failure.
const USER_CANCELLED_FLOW_CODES = new Set(["exited_auth_flow", "exited_link_flow"]);

export const isUserCancelledFlow = (errorCode: string): boolean => USER_CANCELLED_FLOW_CODES.has(errorCode);

export const getWalletEntryState = ({
  ready,
  walletsReady,
  authenticated,
  isConnected,
}: {
  ready: boolean;
  walletsReady: boolean;
  authenticated: boolean;
  isConnected: boolean;
}): WalletEntryState => {
  if (!ready || !walletsReady) return "loading";
  if (isConnected) return "connected";
  if (authenticated) return "preparing";
  return "login";
};

export const getWalletExitAction = (authenticated: boolean, connectorType?: string): WalletExitAction => {
  if (authenticated) return "logout";
  return connectorType === "injected" ? "manual-disconnect" : "disconnect";
};

export const exitWalletSession = async ({
  authenticated,
  logout,
  disconnect,
  pauseSelection,
  resumeSelection,
}: {
  authenticated: boolean;
  logout: () => Promise<void>;
  disconnect?: () => void;
  pauseSelection?: () => void;
  resumeSelection?: () => void;
}) => {
  // Pause before leaving so neither a logout nor a reload silently reselects the wallet.
  pauseSelection?.();
  try {
    if (authenticated) return await logout();
    if (!disconnect) throw new Error("Connected wallet was not found");
    disconnect();
  } catch (error) {
    resumeSelection?.();
    throw error;
  }
};
