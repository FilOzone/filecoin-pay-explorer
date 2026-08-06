import {
  executeSquidFunding,
  SQUID_ROUTER_ADDRESS,
  type SquidExecutionResult,
  type SquidFundingPlan,
  type SquidPublicClient,
  type SquidWalletClient,
} from "squid-evm-funding";

const OP_STACK_CHAIN_IDS = new Set([10, 8453]);
const OP_STACK_FEE_BUFFER_BPS = 12_000n;
const BPS = 10_000n;

export async function executeSquidTopUp({
  destinationClient,
  integratorId,
  maxNativeFee,
  plan,
  sourcePublicClient,
  sourceWalletClient,
}: {
  destinationClient: SquidPublicClient;
  integratorId: string;
  maxNativeFee: bigint;
  plan: SquidFundingPlan;
  sourcePublicClient: SquidPublicClient;
  sourceWalletClient: SquidWalletClient;
}): Promise<SquidExecutionResult> {
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
      walletClient: sourceWalletClient,
    },
  );
}
