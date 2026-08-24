import {
  executeSquidFunding,
  SQUID_ROUTER_ADDRESS,
  type SquidExecutionResult,
  type SquidFundingPlan,
  type SquidPublicClient,
  type SquidWalletClient,
} from "@filecoin-project/squid-evm-funding";
import type { Hash } from "viem";

const OP_STACK_CHAIN_IDS = new Set([10, 8453]);
const OP_STACK_FEE_BUFFER_BPS = 12_000n;
const BPS = 10_000n;

export async function executeSquidTopUp({
  destinationClient,
  integratorId,
  onSwapAttempt,
  onSwapBroadcast,
  plan,
  sourcePublicClient,
  sourceWalletClient,
}: {
  destinationClient: SquidPublicClient;
  integratorId: string;
  onSwapAttempt?: () => void;
  onSwapBroadcast?: (transactionHash: Hash) => void;
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

  return executeSquidFunding(
    {
      feeMode: OP_STACK_CHAIN_IDS.has(plan.source.chainId) ? "op-stack" : "standard",
      maxNativeFee: "auto",
      maxPollAttempts: 30,
      opStackFeeBuffer: OP_STACK_CHAIN_IDS.has(plan.source.chainId)
        ? (fee) => (fee * OP_STACK_FEE_BUFFER_BPS + BPS - 1n) / BPS
        : undefined,
      plan,
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
}

export function canClearSquidAcquisitionAfterError(
  didAttemptSwap: boolean,
  didSwapBroadcast: boolean,
  error: unknown,
): boolean {
  return !didAttemptSwap || (!didSwapBroadcast && isUserRejectedRequest(error));
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
