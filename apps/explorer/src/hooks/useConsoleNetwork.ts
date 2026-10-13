import { useConnection } from "wagmi";
import { useTopUpActivity } from "@/components/UserConsole/providers/TopUpActivityContext";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import type { Network } from "@/types";
import { getNetworkFromChainId, isSupportedChainId } from "@/utils/network";

/**
 * The Filecoin network the console reads and writes. It follows the wallet chain, except during a Squid top-up,
 * when the wallet sits on the source chain and the console keeps showing mainnet.
 */
export function useConsoleNetwork(): { network: Network; isFilecoinChain: boolean; isSquidSourceChain: boolean } {
  const { chainId } = useConnection();
  const { isTopUpActive } = useTopUpActivity();
  const isFilecoinChain = isSupportedChainId(chainId);
  const isSquidSourceChain = !isFilecoinChain && SQUID_SOURCE_CHAINS.some((chain) => chain.id === chainId);
  const network = isTopUpActive && isSquidSourceChain ? "mainnet" : getNetworkFromChainId(chainId);
  return { network, isFilecoinChain, isSquidSourceChain };
}
