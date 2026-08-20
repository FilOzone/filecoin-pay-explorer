import {
  assertTrustedSquidQuote,
  planSquidFunding,
  type SourceToken,
  SQUID_ROUTER_ADDRESS,
  type SquidFundingPlan,
} from "@filecoin-project/squid-evm-funding";
import { type Address, formatUnits } from "viem";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";

// Squid's /tokens response is chain-independent, changes rarely, and gets
// re-fetched by the planner on every estimate; caching it leaves the
// rate-limit budget to /route calls.
const TOKENS_CACHE_MS = 5 * 60_000;
let tokensCache: { body: string; expires: number } | null = null;

export const squidFetch: typeof globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("/tokens")) return fetch(input, init);
  if (tokensCache && tokensCache.expires > Date.now()) {
    return new Response(tokensCache.body, { headers: { "content-type": "application/json" }, status: 200 });
  }
  const response = await fetch(input, init);
  if (!response.ok) return response;
  const body = await response.text();
  tokensCache = { body, expires: Date.now() + TOKENS_CACHE_MS };
  return new Response(body, { headers: { "content-type": "application/json" }, status: 200 });
};

export async function planSquidTopUp({
  destinationAmount,
  destinationToken,
  integratorId,
  owner,
  source,
  sourceAmount,
}: {
  destinationAmount: bigint;
  destinationToken: Address;
  integratorId: string;
  owner: Address;
  source: SourceToken;
  sourceAmount: bigint;
}): Promise<SquidFundingPlan> {
  if (!SQUID_SOURCE_CHAINS.some((chain) => chain.id === source.chainId)) {
    throw new Error("Select a supported source network");
  }
  if (integratorId.trim() === "") throw new Error("Squid quotes are unavailable");

  const plan = await planSquidFunding(
    {
      maxSourceAmount: formatUnits(sourceAmount, source.decimals),
      owner,
      requirements: [
        {
          amount: destinationAmount,
          chainId: 314,
          id: "filecoin-usdfc-top-up",
          recipient: owner,
          token: destinationToken,
        },
      ],
      slippage: 1,
      sourceChainId: source.chainId,
      sourceToken: source.token,
    },
    { fetch: squidFetch, integratorId },
  );
  return {
    ...plan,
    quotes: plan.quotes.map((quote) =>
      assertTrustedSquidQuote(quote, {
        spender: SQUID_ROUTER_ADDRESS,
        target: SQUID_ROUTER_ADDRESS,
      }),
    ),
  };
}
