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

export function getPlanNetworkGas(
  plan: SquidFundingPlan,
  currentAllowance?: bigint,
): { estimated: bigint; maximum: bigint | null; transactionCount: number | null } {
  const isNativeSource = isNativeToken(plan.source.token);
  if (!isNativeSource && currentAllowance === undefined) {
    return {
      estimated: plan.quotes.reduce((total, quote) => total + getQuoteNetworkGas(quote.costs, plan.source.chainId), 0n),
      maximum: null,
      transactionCount: null,
    };
  }

  let allowance = currentAllowance ?? 0n;
  let estimated = 0n;
  let maximum = 0n;
  let transactionCount = 0;
  for (const quote of plan.quotes) {
    const routeGas = getQuoteNetworkGas(quote.costs, plan.source.chainId);
    // Squid only supplies the route estimate. Model each approval as one
    // route-gas equivalent, but only when the exact allowance policy will
    // actually execute it. The executor still fails closed against this cap
    // after preparing each real transaction.
    const bufferedTransactionGas = applyNetworkFeeExecutionBuffer(plan.source.chainId, routeGas);
    estimated += routeGas;

    if (!isNativeSource && allowance !== quote.sourceAmount) {
      if (allowance > 0n) {
        maximum += bufferedTransactionGas;
        transactionCount += 1;
      }
      maximum += bufferedTransactionGas;
      transactionCount += 1;
      allowance = quote.sourceAmount;
    }

    maximum += bufferedTransactionGas;
    transactionCount += 1;
    // The executor grants exactly sourceAmount, which the route consumes.
    if (!isNativeSource) allowance = 0n;
  }
  return { estimated, maximum, transactionCount };
}

function getQuoteNetworkGas(costs: readonly SquidQuoteCost[], sourceChainId: number): bigint {
  return costs.reduce(
    (total, cost) =>
      total +
      (cost.kind === "gas" && cost.token.chainId === sourceChainId && isNativeToken(cost.token.address)
        ? cost.amount
        : 0n),
    0n,
  );
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
