import type { ConsoleAccount } from "@/components/UserConsole/providers/ConsoleAccountContext";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { isSupportedChainId } from "@/utils/network";

export type ConsoleAccountState = "none" | "connecting" | "active" | "switched";

export type ConsoleAccessState =
  | "reconnecting"
  | "not-connected"
  | "account-switched"
  | "unsupported-chain"
  | "squid-source"
  | "ready";

/** Compares the wagmi connection with the console account, so nothing renders for another address. */
export const getConsoleAccountState = ({
  account,
  address,
  privyFailed,
  wallets,
  walletsReady,
}: {
  account: ConsoleAccount | null;
  address: string | undefined;
  privyFailed: boolean;
  wallets: readonly { address: string }[];
  walletsReady: boolean;
}): ConsoleAccountState => {
  // The gate explains that login is unavailable; waiting for wallets would load forever.
  if (privyFailed) return "none";
  // Privy's wallets load after hydration, so checking them first keeps the server and first client render identical.
  if (!walletsReady) return "connecting";
  if (!account) return "none";
  const accountAddress = account.address.toLowerCase();
  if (address?.toLowerCase() === accountAddress) return "active";
  if (wallets.some((wallet) => wallet.address.toLowerCase() === accountAddress)) return "connecting";
  // An embedded wallet can't switch accounts, so a missing one is still being created or its session ended.
  if (account.walletClientType === "privy") return "none";
  return "switched";
};

export const getConsoleDisplayAccessState = (
  walletAccessState: ConsoleAccessState,
  isTopUpActive: boolean,
): ConsoleAccessState => (walletAccessState === "squid-source" && isTopUpActive ? "ready" : walletAccessState);

export const getConsoleAccessState = ({
  accountState,
  isConnected,
  isReconnecting,
  hasAddress,
  chainId,
}: {
  accountState: ConsoleAccountState;
  isConnected: boolean;
  isReconnecting?: boolean;
  hasAddress: boolean;
  chainId: number | undefined;
}): ConsoleAccessState => {
  if (accountState === "none") return "not-connected";
  if (accountState === "switched") return "account-switched";
  if (accountState === "connecting" || isReconnecting) return "reconnecting";
  if (!isConnected || !hasAddress) {
    return "not-connected";
  }

  if (chainId !== undefined && !isSupportedChainId(chainId)) {
    return SQUID_SOURCE_CHAINS.some((chain) => chain.id === chainId) ? "squid-source" : "unsupported-chain";
  }

  return "ready";
};

export type ReadyConnection = { address: string; chainId: number };

/**
 * A reconnect that keeps the wallet and chain the console last showed as ready is a re-sync
 * (Privy's wagmi sync calls reconnect() on every user or wallet-list change), so the page stays
 * mounted. A first restore or a changed wallet or chain still reports "reconnecting".
 */
export const keepReadyThroughResync = (
  accessState: ConsoleAccessState,
  lastReady: ReadyConnection | null,
  address: string | undefined,
  chainId: number | undefined,
): ConsoleAccessState => {
  if (accessState !== "reconnecting" || lastReady === null) return accessState;
  return lastReady.address.toLowerCase() === address?.toLowerCase() && lastReady.chainId === chainId
    ? "ready"
    : accessState;
};

/** The wallet and chain to compare the next reconnect against; any state but a reconnect resets it. */
export const rememberReadyConnection = (
  accessState: ConsoleAccessState,
  address: string | undefined,
  chainId: number | undefined,
  previous: ReadyConnection | null,
): ReadyConnection | null => {
  if (accessState === "reconnecting") return previous;
  if (accessState !== "ready" || address === undefined || chainId === undefined) return null;
  return { address, chainId };
};
