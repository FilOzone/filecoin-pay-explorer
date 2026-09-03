export type WalletEntryState = "loading" | "login" | "preparing" | "connected";
export type WalletExitAction = "logout" | "disconnect" | "manual-disconnect";

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
}: {
  authenticated: boolean;
  logout: () => Promise<void>;
  disconnect?: () => void;
}) => {
  if (authenticated) return logout();
  if (!disconnect) throw new Error("Connected wallet was not found");
  disconnect();
};
