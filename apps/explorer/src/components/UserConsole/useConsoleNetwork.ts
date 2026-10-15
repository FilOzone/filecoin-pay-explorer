import { useConnection } from "wagmi";
import { useTopUpActivity } from "@/components/UserConsole/providers/TopUpActivityContext";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { supportedChains } from "@/services/wagmi/config";
import type { Network } from "@/types";
import { DEFAULT_NETWORK } from "@/utils/constants";
import { isSupportedChainId } from "@/utils/network";

// Private to this hook: its mainnet fallback would hide a non-Filecoin chain anywhere else.
function getNetworkFromChainId(chainId: number | undefined): Network {
  if (!chainId) return DEFAULT_NETWORK;
  return supportedChains.find((c) => c.id === chainId)?.slug ?? DEFAULT_NETWORK;
}

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
