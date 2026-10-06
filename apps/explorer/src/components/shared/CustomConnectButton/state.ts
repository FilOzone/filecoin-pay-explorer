export type WalletEntryState = "loading" | "login" | "preparing";
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
}: {
  ready: boolean;
  walletsReady: boolean;
  authenticated: boolean;
}): WalletEntryState => {
  if (!ready || !walletsReady) return "loading";
  return authenticated ? "preparing" : "login";
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
  clearAccount,
}: {
  authenticated: boolean;
  logout: () => Promise<void>;
  disconnect?: () => void;
  /** wagmi's disconnect, which asks an extension like MetaMask to revoke the site's access. */
  disconnectConnection: () => Promise<void>;
  clearAccount: () => void;
}) => {
  // Runs while wagmi still holds the console account; once the account is cleared there is nothing to revoke.
  // A wallet provider that fails to disconnect must not block leaving the console, so the exit continues.
  try {
    await disconnectConnection();
  } catch {}
  if (authenticated) await logout();
  else disconnect?.();
  clearAccount();
};
