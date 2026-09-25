import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { isSupportedChainId } from "@/utils/network";

export type ConsoleAccessState = "reconnecting" | "not-connected" | "unsupported-chain" | "squid-source" | "ready";

export const getConsoleDisplayAccessState = (
  walletAccessState: ConsoleAccessState,
  isTopUpActive: boolean,
): ConsoleAccessState => (walletAccessState === "squid-source" && isTopUpActive ? "ready" : walletAccessState);

export const getConsoleAccessState = ({
  isConnected,
  isReconnecting,
  hasAddress,
  chainId,
}: {
  isConnected: boolean;
  isReconnecting?: boolean;
  hasAddress: boolean;
  chainId: number | undefined;
}): ConsoleAccessState => {
  if (isReconnecting) return "reconnecting";
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
  return lastReady.address === address && lastReady.chainId === chainId ? "ready" : accessState;
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
