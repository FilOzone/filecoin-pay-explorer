import {
  executeSquidFunding,
  maximumNativeRouteFee,
  NATIVE_TOKEN_ADDRESS,
  SQUID_ROUTER_ADDRESS,
  type SquidExecutionResult,
  type SquidFundingPlan,
  type SquidPublicClient,
  type SquidWalletClient,
} from "@filecoin-project/squid-evm-funding";
import type { Hash } from "viem";
import type { SquidAcquisitionExecutionStage } from "./squid-acquisition";

const OP_STACK_CHAIN_IDS = new Set([10, 8453]);
const OP_STACK_FEE_BUFFER_BPS = 12_000n;
const BPS = 10_000n;

export function applyNetworkFeeExecutionBuffer(chainId: number, fee: bigint): bigint {
  return OP_STACK_CHAIN_IDS.has(chainId) ? (fee * OP_STACK_FEE_BUFFER_BPS + BPS - 1n) / BPS : fee;
}

export async function executeSquidTopUp({
  destinationClient,
  integratorId,
  maxNativeFee,
  maxTotalNativeRouteFee,
  nativeBalanceFloor = 0n,
  onSwapAttempt,
  onSwapBroadcast,
  onIntermediateRouteComplete,
  plan,
  sourcePublicClient,
  sourceWalletClient,
}: {
  destinationClient: SquidPublicClient;
  integratorId: string;
  maxNativeFee: bigint;
  maxTotalNativeRouteFee: bigint;
  nativeBalanceFloor?: bigint;
  onSwapAttempt?: () => void;
  onSwapBroadcast?: (transactionHash: Hash) => void;
  onIntermediateRouteComplete?: () => Promise<void> | void;
  plan: SquidFundingPlan;
  sourcePublicClient: SquidPublicClient;
  sourceWalletClient: SquidWalletClient;
}): Promise<SquidExecutionResult> {
  const trackedWalletClient = {
    ...sourceWalletClient,
    sendTransaction: async (...args: Parameters<SquidWalletClient["sendTransaction"]>) => {
      const [request] = args;
      const isSwap = request.to?.toLowerCase() === SQUID_ROUTER_ADDRESS.toLowerCase();
      if (isSwap) onSwapAttempt?.();
      const transactionHash = await sourceWalletClient.sendTransaction(...args);
      if (isSwap) onSwapBroadcast?.(transactionHash);
      return transactionHash;
    },
  } as SquidWalletClient;

  const execute = (
    executionPlan: SquidFundingPlan,
    nativeFeeCap: bigint,
    nativeRouteFeeCap: bigint,
    sourceBalanceFloor = 0n,
  ) =>
    executeSquidFunding(
      {
        feeMode: OP_STACK_CHAIN_IDS.has(plan.source.chainId) ? "op-stack" : "standard",
        maxNativeFee: nativeFeeCap,
        maxTotalNativeRouteFee: nativeRouteFeeCap,
        nativeBalanceFloor,
        sourceBalanceFloor,
        maxPollAttempts: 30,
        opStackFeeBuffer: OP_STACK_CHAIN_IDS.has(plan.source.chainId)
          ? (fee) => applyNetworkFeeExecutionBuffer(plan.source.chainId, fee)
          : undefined,
        plan: executionPlan,
        pollIntervalMs: 10_000,
        trustedSpender: SQUID_ROUTER_ADDRESS,
        trustedTarget: SQUID_ROUTER_ADDRESS,
      },
      {
        destinationClient,
        publicClient: sourcePublicClient,
        squid: { integratorId },
        walletClient: trackedWalletClient,
      },
    );

  if (plan.quotes.length <= 1) return execute(plan, maxNativeFee, maxTotalNativeRouteFee);

  const plannedSourceAmount = plan.quotes.reduce((total, quote) => total + quote.sourceAmount, 0n);
  const requirementIds = new Set(plan.quotes.map((quote) => quote.requirement.id));
  const destinationChainIds = new Set(plan.quotes.map((quote) => quote.requirement.chainId));
  if (
    plan.maxSourceAmount <= 0n ||
    plannedSourceAmount > plan.maxSourceAmount ||
    plan.quotes.some((quote) => quote.sourceAmount <= 0n || quote.requirement.amount <= 0n) ||
    requirementIds.size !== plan.quotes.length ||
    destinationChainIds.size !== 1
  ) {
    throw new Error("Invalid multi-route funding plan");
  }
  const nativeRouteFeeCaps = plan.quotes.map((quote) =>
    maximumNativeRouteFee(
      quote.costs.reduce(
        (total, cost) =>
          total +
          (cost.kind === "fee" &&
          cost.token.chainId === plan.source.chainId &&
          cost.token.address?.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()
            ? cost.amount
            : 0n),
        0n,
      ),
    ),
  );
  if (nativeRouteFeeCaps.reduce((total, cap) => total + cap, 0n) > maxTotalNativeRouteFee) {
    throw new Error("Execution would exceed the total-native-route-fee cap");
  }

  let remainingNativeFee = maxNativeFee;
  let remainingNativeRouteFee = maxTotalNativeRouteFee;
  let nativeFee = 0n;
  let sourceAmount = 0n;
  const routes: SquidExecutionResult["routes"][number][] = [];
  for (const [index, quote] of plan.quotes.entries()) {
    const sourceBalanceFloor = plan.quotes
      .slice(index + 1)
      .reduce((total, remainingQuote) => total + remainingQuote.sourceAmount, 0n);
    const nativeRouteFeeCap = nativeRouteFeeCaps[index];
    if (nativeRouteFeeCap > remainingNativeRouteFee) {
      throw new Error("Execution would exceed the total-native-route-fee cap");
    }
    const result = await execute(
      { ...plan, quotes: [quote] },
      remainingNativeFee,
      nativeRouteFeeCap,
      sourceBalanceFloor,
    );
    remainingNativeFee -= result.nativeFee;
    remainingNativeRouteFee -= nativeRouteFeeCap;
    nativeFee += result.nativeFee;
    sourceAmount += result.sourceAmount;
    routes.push(...result.routes);
    if (index + 1 < plan.quotes.length) await onIntermediateRouteComplete?.();
  }
  return { nativeFee, routes, sourceAmount };
}

export function canClearSquidAcquisitionAfterError(
  executionStage: SquidAcquisitionExecutionStage | undefined,
  error: unknown,
): boolean {
  return executionStage === "preparing" || (executionStage === "swap-requested" && isUserRejectedRequest(error));
}

export function isUserRejectedRequest(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    if (
      ("code" in current && current.code === 4001) ||
      ("name" in current && current.name === "UserRejectedRequestError")
    ) {
      return true;
    }
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

export function walletErrorMessage(error: unknown, fallback: string): string {
  if (isUserRejectedRequest(error)) return "Transaction cancelled in your wallet.";
  return error instanceof Error ? error.message : fallback;
}
