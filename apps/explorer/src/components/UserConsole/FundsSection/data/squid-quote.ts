import {
  assertTrustedSquidQuote,
  planSquidFunding,
  type SourceToken,
  SQUID_ROUTER_ADDRESS,
  type SquidFundingPlan,
} from "squid-evm-funding";
import { type Address, formatUnits } from "viem";
import { SQUID_SOURCE_CHAINS } from "@/constants/chains";

const FEE_LIMIT_BUFFER_BPS = 12_000n;
const BPS = 10_000n;

export function suggestedNativeFeeLimit(plan: SquidFundingPlan): bigint {
  const sourceChain = SQUID_SOURCE_CHAINS.find((chain) => chain.id === plan.source.chainId);
  if (!sourceChain) return 0n;

  const { decimals, symbol } = sourceChain.nativeCurrency;
  const quotedGas = plan.quotes
    .flatMap((quote) => quote.costs)
    .filter(
      (cost) =>
        cost.kind === "gas" &&
        cost.token.chainId === plan.source.chainId &&
        cost.token.decimals === decimals &&
        cost.token.symbol.toLowerCase() === symbol.toLowerCase(),
    )
    .reduce((total, cost) => total + cost.amount, 0n);

  return (quotedGas * FEE_LIMIT_BUFFER_BPS + BPS - 1n) / BPS;
}

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
