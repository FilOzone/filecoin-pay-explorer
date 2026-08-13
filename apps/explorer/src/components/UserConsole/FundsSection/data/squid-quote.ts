import {
  assertTrustedSquidQuote,
  planSquidFunding,
  type SourceToken,
  SQUID_ROUTER_ADDRESS,
  type SquidFundingPlan,
} from "squid-evm-funding";
import { type Address, formatUnits } from "viem";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";

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
    { integratorId },
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
