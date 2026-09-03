import type { SourceToken } from "@filecoin-project/squid-evm-funding";
import { queryOptions } from "@tanstack/react-query";
import { isNativeToken } from "./guided-top-up";
import { isUsdcLikeSymbol, SQUID_API_BASE_URL, type SquidClient, selectUsdcTokens } from "./squid-deposit-route";

/** A token Squid can pay from, with its dollar price when the catalog knows it. */
export type PaymentToken = SourceToken & { usdPrice?: number };

const PAYMENT_TOKENS_STALE_MS = 5 * 60_000;
// Beyond USDC and the network's own coin: the stablecoins and majors most
// wallets hold. Kept short so one multicall per network reads every balance.
const OTHER_PAYMENT_SYMBOLS = /^(usdt|usdt0|dai|weth|wbtc)$/i;
const OTHER_STABLECOIN_SYMBOLS = /^(usdt|usdt0|dai)$/i;

/** Worth a dollar a unit, so balances compare directly and a rate near 1 USDFC is the norm. */
export function isStablecoinSymbol(symbol: string): boolean {
  return isUsdcLikeSymbol(symbol) || OTHER_STABLECOIN_SYMBOLS.test(symbol);
}

/**
 * Squid's catalog narrowed to what the scan reads: USDC variants first (plain
 * USDC ahead of bridged ones), then the network's native coin, then the other
 * stablecoins and majors.
 */
export function selectPaymentTokens<T extends SourceToken>(tokens: readonly T[]): T[] {
  const native = tokens.filter((token) => isNativeToken(token.token));
  const others = tokens.filter(
    (token) =>
      !isNativeToken(token.token) && !isUsdcLikeSymbol(token.symbol) && OTHER_PAYMENT_SYMBOLS.test(token.symbol),
  );
  return [...selectUsdcTokens(tokens), ...native, ...others];
}

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => value !== null && typeof value === "object";

/** Squid's `/tokens` response for one network, keeping the price the funding package drops. */
export function parsePaymentTokens(response: unknown, chainId: number): PaymentToken[] {
  if (!isRecord(response) || !Array.isArray(response.tokens)) throw new Error("Invalid Squid token catalog");
  const tokens: PaymentToken[] = [];
  const seen = new Set<string>();
  for (const raw of response.tokens) {
    if (!isRecord(raw) || Number(raw.chainId) !== chainId) continue;
    if (typeof raw.symbol !== "string" || raw.symbol.trim() === "") continue;
    if (typeof raw.address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(raw.address)) continue;
    if (typeof raw.decimals !== "number" || !Number.isSafeInteger(raw.decimals) || raw.decimals < 0) continue;
    const token = raw.address.toLowerCase() as SourceToken["token"];
    if (seen.has(token)) continue;
    seen.add(token);
    const usdPrice = Number(raw.usdPrice);
    tokens.push({
      chainId,
      decimals: raw.decimals,
      symbol: raw.symbol.trim(),
      token,
      ...(Number.isFinite(usdPrice) && usdPrice > 0 ? { usdPrice } : {}),
    });
  }
  return tokens;
}

export async function fetchPaymentTokens(sourceChainId: number, squid: SquidClient): Promise<PaymentToken[]> {
  const fetcher = squid.fetch ?? globalThis.fetch.bind(globalThis);
  const response = await fetcher(`${squid.baseUrl ?? SQUID_API_BASE_URL}/tokens`, {
    headers: { "x-integrator-id": squid.integratorId },
  });
  if (!response.ok) throw new Error(`Squid tokens request failed (${response.status})`);
  return selectPaymentTokens(parsePaymentTokens(await response.json(), sourceChainId));
}

/** The tokens the dialog can pay with on one network, shared by the quote and the balance scan. */
export function paymentTokensQueryOptions(sourceChainId: number, squid: SquidClient) {
  return queryOptions({
    queryFn: () => fetchPaymentTokens(sourceChainId, squid),
    queryKey: ["squid-payment-tokens", sourceChainId, squid.integratorId],
    staleTime: PAYMENT_TOKENS_STALE_MS,
  });
}
