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
  isExiting = false,
}: {
  ready: boolean;
  walletsReady: boolean;
  authenticated: boolean;
  isConnected: boolean;
  isExiting?: boolean;
}): WalletEntryState => {
  if (!ready || !walletsReady || isExiting) return "loading";
  if (isConnected) return "connected";
  if (authenticated) return "preparing";
  return "login";
};

// Injected wallets retain site permission, so leaving the console logs out without revoking access.
export const getWalletExitAction = (authenticated: boolean, connectorType?: string): WalletExitAction => {
  if (authenticated || connectorType === "injected") return "logout";
  return "disconnect";
};

export const exitWalletSession = async ({
  authenticated,
  logout,
  disconnect,
  disconnectConnection,
}: {
  authenticated: boolean;
  logout: () => Promise<void>;
  disconnect?: () => void;
  /** Prevents wagmi from restoring the connection after Privy exits. */
  disconnectConnection?: () => Promise<void>;
}) => {
  if (authenticated) await logout();
  else {
    if (!disconnect) throw new Error("Connected wallet was not found");
    disconnect();
  }
  await disconnectConnection?.();
};
