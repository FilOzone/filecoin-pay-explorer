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

export type SquidTransactionKind = "approval" | "swap";

export async function executeSquidTopUp({
  destinationClient,
  integratorId,
  maxNativeFee,
  onBroadcast,
  onTransactionAttempt,
  plan,
  sourcePublicClient,
  sourceWalletClient,
}: {
  destinationClient: SquidPublicClient;
  integratorId: string;
  maxNativeFee: bigint;
  onBroadcast?: (transactionHash: Hash, kind: SquidTransactionKind) => void;
  onTransactionAttempt?: (kind: SquidTransactionKind) => void;
  plan: SquidFundingPlan;
  sourcePublicClient: SquidPublicClient;
  sourceWalletClient: SquidWalletClient;
}): Promise<SquidExecutionResult> {
  const trackedWalletClient = {
    ...sourceWalletClient,
    sendTransaction: async (...args: Parameters<SquidWalletClient["sendTransaction"]>) => {
      // Approvals target the source token contract; anything else is the swap
      // itself (the Squid router). Lets the UI stage its progress display.
      const kind: SquidTransactionKind =
        (args[0] as { to?: string } | undefined)?.to?.toLowerCase() === plan.source.token.toLowerCase()
          ? "approval"
          : "swap";
      onTransactionAttempt?.(kind);
      const transactionHash = await sourceWalletClient.sendTransaction(...args);
      onBroadcast?.(transactionHash, kind);
      return transactionHash;
    },
  } as SquidWalletClient;

  return executeSquidFunding(
    {
      feeMode: OP_STACK_CHAIN_IDS.has(plan.source.chainId) ? "op-stack" : "standard",
      maxNativeFee,
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
  // viem errors carry the multi-line request dump in `message` (URL, request
  // body, call args); `shortMessage` is the one-line cause meant for users.
  if (
    error instanceof Error &&
    "shortMessage" in error &&
    typeof error.shortMessage === "string" &&
    error.shortMessage.trim() !== ""
  ) {
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : fallback;
}
