import {
  maximumNativeRouteFee,
  NATIVE_TOKEN_ADDRESS,
  type SquidFundingPlan,
  type SquidQuoteCost,
} from "@filecoin-project/squid-evm-funding";
import type { QueryClient } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { parseFundingAmount, USDFC_DECIMALS } from "./funding-runway";
import { applyNetworkFeeExecutionBuffer } from "./squid-execution";

// The reviewed source-chain gas estimate covers the Squid transaction. Three
// transaction-equivalents leave room for an exact ERC-20 approval reset and
// approval. The executor then applies this 20% buffer to prepared OP Stack
// fees, so include it in the user-visible cap too.
const NETWORK_FEE_TRANSACTION_MULTIPLIER = 3n;

export function parseTopUpAmount(amount: string): bigint | null {
  return parseFundingAmount(amount, USDFC_DECIMALS);
}

export function withoutTopUpSearchParam(searchParams: URLSearchParams): string {
  const nextSearchParams = new URLSearchParams(searchParams);
  nextSearchParams.delete("topUp");
  const query = nextSearchParams.toString();
  return query ? `?${query}` : "";
}

function isNativeToken(address: string | undefined): boolean {
  return address?.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

export function isBridgeNativeFee(cost: SquidQuoteCost, sourceChainId: number): boolean {
  return cost.kind === "fee" && cost.token.chainId === sourceChainId && isNativeToken(cost.token.address);
}

export function getBridgeNativeFee(costs: readonly SquidQuoteCost[], sourceChainId: number): bigint {
  return costs.reduce((total, cost) => total + (isBridgeNativeFee(cost, sourceChainId) ? cost.amount : 0n), 0n);
}

export function getMaximumBridgeNativeFee(value: bigint): bigint {
  return maximumNativeRouteFee(value);
}

export function getPlanBridgeNativeFees(plan: SquidFundingPlan): { estimated: bigint; maximum: bigint } {
  return plan.quotes.reduce(
    (total, quote) => {
      const estimated = getBridgeNativeFee(quote.costs, plan.source.chainId);
      return {
        estimated: total.estimated + estimated,
        maximum: total.maximum + getMaximumBridgeNativeFee(estimated),
      };
    },
    { estimated: 0n, maximum: 0n },
  );
}

export function getPlanNetworkGas(plan: SquidFundingPlan): { estimated: bigint; maximum: bigint } {
  const estimated = plan.quotes.reduce(
    (total, quote) =>
      total +
      quote.costs.reduce(
        (quoteTotal, cost) =>
          quoteTotal +
          (cost.kind === "gas" && cost.token.chainId === plan.source.chainId && isNativeToken(cost.token.address)
            ? cost.amount
            : 0n),
        0n,
      ),
    0n,
  );
  // Execution buffers every prepared OP Stack transaction before adding it to
  // the cumulative cap. Model the three possible transactions the same way so
  // integer rounding cannot make the reviewed cap smaller than execution.
  const maximum = applyNetworkFeeExecutionBuffer(plan.source.chainId, estimated) * NETWORK_FEE_TRANSACTION_MULTIPLIER;
  return { estimated, maximum };
}

export function getRequiredNativeBalance(plan: SquidFundingPlan, maximumNetworkFee: bigint): bigint {
  const sourceAmount = isNativeToken(plan.source.token)
    ? plan.quotes.reduce((total, quote) => total + quote.sourceAmount, 0n)
    : 0n;
  return sourceAmount + getPlanBridgeNativeFees(plan).maximum + maximumNetworkFee;
}

export function shouldBlockOnSeparateNativeBalance(
  isNativeSource: boolean,
  isSeparateNativeBalanceError: boolean,
  isSeparateNativeBalanceLoading: boolean,
): boolean {
  return !isNativeSource && (isSeparateNativeBalanceError || isSeparateNativeBalanceLoading);
}

export function formatNativeFee(value: bigint, currency: { decimals: number; symbol: string }): string | null {
  if (value === 0n) return null;
  return `${formatUnits(value, currency.decimals)} ${currency.symbol}`;
}

export function invalidateTopUpQueries(queryClient: QueryClient, accountId: string, accountOwner: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["account", accountOwner] }),
    queryClient.invalidateQueries({ queryKey: ["account", accountId, "tokens"] }),
    queryClient.invalidateQueries({ queryKey: ["payments", "account-summary"] }),
    queryClient.invalidateQueries({ queryKey: ["balance"] }),
    queryClient.invalidateQueries({ queryKey: ["readContract"] }),
  ]);
}
