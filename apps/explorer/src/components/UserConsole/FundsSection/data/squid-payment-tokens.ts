import { fetchSourceTokens, type SourceToken } from "@filecoin-project/squid-evm-funding";
import { queryOptions } from "@tanstack/react-query";
import type { SquidClient } from "./squid-deposit-route";

const PAYMENT_TOKENS_STALE_MS = 5 * 60_000;
const PAYMENT_SYMBOLS = new Set(["ETH", "USDC", "USDT", "DAI", "WETH", "WBTC"]);
const MAX_PAYMENT_TOKENS = 100;

/** Curated, liquid assets accepted by the direct Squid deposit flow. */
export function selectPaymentTokens(tokens: readonly SourceToken[], sourceChainId: number): SourceToken[] {
  const seen = new Set<string>();
  const selected = tokens.filter((token) => {
    const identity = `${token.chainId}:${token.token.toLowerCase()}`;
    if (token.chainId !== sourceChainId || !PAYMENT_SYMBOLS.has(token.symbol.toUpperCase()) || seen.has(identity))
      return false;
    seen.add(identity);
    return true;
  });
  if (selected.length > MAX_PAYMENT_TOKENS) throw new Error("Squid returned too many supported payment tokens");
  return selected;
}

/** Supported payment tokens on one selected source network. */
export function paymentTokensQueryOptions(sourceChainId: number, squid: SquidClient) {
  return queryOptions({
    queryFn: async () => selectPaymentTokens(await fetchSourceTokens(sourceChainId, squid), sourceChainId),
    queryKey: ["squid-payment-tokens", sourceChainId, squid.integratorId],
    staleTime: PAYMENT_TOKENS_STALE_MS,
  });
}
