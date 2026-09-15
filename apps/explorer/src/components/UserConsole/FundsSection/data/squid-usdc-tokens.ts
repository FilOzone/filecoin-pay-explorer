import { fetchSourceTokens } from "@filecoin-project/squid-evm-funding";
import { queryOptions } from "@tanstack/react-query";
import { type SquidClient, selectUsdcTokens } from "./squid-deposit-route";

const USDC_TOKENS_STALE_MS = 5 * 60_000;

/** Squid's USDC tokens on one source network, shared by the quote and the balance scan. */
export function usdcTokensQueryOptions(sourceChainId: number, squid: SquidClient) {
  return queryOptions({
    queryFn: async () => selectUsdcTokens(await fetchSourceTokens(sourceChainId, squid)),
    queryKey: ["squid-usdc-tokens", sourceChainId, squid.integratorId],
    staleTime: USDC_TOKENS_STALE_MS,
  });
}
