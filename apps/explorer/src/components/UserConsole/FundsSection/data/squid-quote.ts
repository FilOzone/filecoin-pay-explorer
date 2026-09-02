import {
  NATIVE_TOKEN_ADDRESS,
  planSquidFunding,
  type SourceToken,
  type SquidFundingPlan,
} from "@filecoin-project/squid-evm-funding";
import { type Address, formatUnits, parseEther } from "viem";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";

export const FILECOIN_FIL_AMOUNT = parseEther("0.25");
export const FILECOIN_FIL_REQUIREMENT_ID = "filecoin-wallet-network-fees";
export const FILECOIN_USDFC_REQUIREMENT_ID = "filecoin-usdfc-top-up";

const SQUID_TOKENS_PROXY_URL = "/api/squid/tokens";
// Squid's /tokens response is chain-independent, changes rarely, and gets
// re-fetched by the planner on every estimate. Route browser catalog reads
// through the same-origin proxy and cache successful responses locally.
const TOKENS_CACHE_MS = 5 * 60_000;
let tokensCache: { body: string; expires: number } | null = null;

export const squidFetch: typeof globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("/tokens")) return fetch(input, init);
  if (tokensCache && tokensCache.expires > Date.now()) {
    return new Response(tokensCache.body, { headers: { "content-type": "application/json" }, status: 200 });
  }
  const response = await fetch(SQUID_TOKENS_PROXY_URL, init);
  if (!response.ok) return response;
  const body = await response.text();
  tokensCache = { body, expires: Date.now() + TOKENS_CACHE_MS };
  return new Response(body, { headers: { "content-type": "application/json" }, status: 200 });
};

export async function planSquidTopUp({
  destinationAmount,
  destinationToken,
  includeFil = false,
  integratorId,
  owner,
  source,
  sourceAmount,
}: {
  destinationAmount: bigint;
  destinationToken: Address;
  includeFil?: boolean;
  integratorId: string;
  owner: Address;
  source: SourceToken;
  sourceAmount: bigint;
}): Promise<SquidFundingPlan> {
  if (!SQUID_SOURCE_CHAINS.some((chain) => chain.id === source.chainId)) {
    throw new Error("Select a supported source network");
  }
  if (integratorId.trim() === "") throw new Error("Squid quotes are unavailable");

  const isFilecoinFilSource =
    source.chainId === 314 && source.token.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
  const sourceCap = isFilecoinFilSource ? sourceAmount - FILECOIN_FIL_AMOUNT : sourceAmount;
  if (sourceCap <= 0n) throw new Error("Keep 0.25 FIL in your wallet for Filecoin network fees");

  return planSquidFunding(
    {
      maxSourceAmount: formatUnits(sourceCap, source.decimals),
      owner,
      requirements: [
        ...(includeFil && !isFilecoinFilSource
          ? [
              {
                amount: FILECOIN_FIL_AMOUNT,
                chainId: 314,
                id: FILECOIN_FIL_REQUIREMENT_ID,
                recipient: owner,
                token: NATIVE_TOKEN_ADDRESS,
              },
            ]
          : []),
        {
          amount: destinationAmount,
          chainId: 314,
          id: FILECOIN_USDFC_REQUIREMENT_ID,
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
}
