import { SQUID_SOURCE_CHAINS } from "@/constants/chains";
import { getNetworkFromChainId, isSupportedChainId } from "@/utils/network";

/**
 * USDC funding deposits into the Filecoin mainnet account, so it is offered
 * when the console shows mainnet and while the paying wallet sits on a Squid
 * source network mid-payment. Calibration and unknown networks get nothing.
 */
export function isUsdcFundingAvailable(chainId: number | undefined): boolean {
  if (chainId === undefined || isSupportedChainId(chainId)) return getNetworkFromChainId(chainId) === "mainnet";
  return SQUID_SOURCE_CHAINS.some((chain) => chain.id === chainId);
}
