import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { isSupportedChainId } from "@/utils/network";

export type ConsoleAccessState = "not-connected" | "unsupported-chain" | "squid-source" | "ready";

export const getConsoleDisplayAccessState = (
  walletAccessState: ConsoleAccessState,
  isTopUpActive: boolean,
): ConsoleAccessState => (walletAccessState === "squid-source" && isTopUpActive ? "ready" : walletAccessState);

export const getConsoleAccessState = ({
  isConnected,
  hasAddress,
  chainId,
}: {
  isConnected: boolean;
  hasAddress: boolean;
  chainId: number | undefined;
}): ConsoleAccessState => {
  if (!isConnected || !hasAddress) {
    return "not-connected";
  }

  if (chainId !== undefined && !isSupportedChainId(chainId)) {
    return SQUID_SOURCE_CHAINS.some((chain) => chain.id === chainId) ? "squid-source" : "unsupported-chain";
  }

  return "ready";
};
