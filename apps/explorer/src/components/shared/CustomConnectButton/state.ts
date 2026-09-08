export type WalletEntryState = "loading" | "login" | "preparing" | "connected";
export type WalletExitAction = "logout" | "disconnect";

export const WALLET_EXIT_LABEL: Record<WalletExitAction, string> = {
  logout: "Log out",
  disconnect: "Disconnect",
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

/**
 * A Privy session and a browser-extension wallet both leave by logging the
 * console out: the extension keeps its own site permission and nothing here
 * can revoke it, so the menu does not send the user into the extension. Only
 * a connect-only session over a remote protocol is a real disconnect.
 */
export const getWalletExitAction = (authenticated: boolean, connectorType?: string): WalletExitAction => {
  if (authenticated || connectorType === "injected") return "logout";
  return "disconnect";
};

export const exitWalletSession = async ({
  authenticated,
  logout,
  disconnect,
  disconnectConnection,
  pauseSelection,
  resumeSelection,
}: {
  authenticated: boolean;
  logout: () => Promise<void>;
  /** Privy's own disconnect for the wallet. */
  disconnect?: () => void;
  /** Drops wagmi's connection; Privy's disconnect leaves it in place for an extension wallet. */
  disconnectConnection?: () => Promise<void>;
  pauseSelection?: () => void;
  resumeSelection?: () => void;
}) => {
  // Pause before leaving so neither a logout nor a reload silently reselects the wallet.
  pauseSelection?.();
  try {
    if (authenticated) return await logout();
    if (!disconnect) throw new Error("Connected wallet was not found");
    disconnect();
    // Privy keeps an extension wallet in its list after disconnect, so the wagmi bridge never
    // re-selects and the console would stay connected; drop the connection directly.
    await disconnectConnection?.();
  } catch (error) {
    resumeSelection?.();
    throw error;
  }
};
