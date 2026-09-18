import type { Address, Hex, PublicClient } from "viem";
import { estimateL1Fee } from "viem/op-stack";

const OP_STACK_CHAIN_IDS = new Set([10, 8453]);
const OP_STACK_FEE_BUFFER_BPS = 12_000n;
const BPS = 10_000n;

export function applyNetworkFeeExecutionBuffer(chainId: number, fee: bigint): bigint {
  return OP_STACK_CHAIN_IDS.has(chainId) ? (fee * OP_STACK_FEE_BUFFER_BPS + BPS - 1n) / BPS : fee;
}

export function isOpStackChain(chainId: number): boolean {
  return OP_STACK_CHAIN_IDS.has(chainId);
}

/**
 * Total native cost of one OP Stack transaction: the L1 data fee the gas
 * price oracle quotes for its calldata, plus its gas at the fee per gas it
 * will be sent with. viem's own total-fee helper re-simulates the call and
 * prices it at the legacy gas price, which both fails for a sender without
 * gas money and disagrees with what is actually sent.
 */
export async function estimateOpStackTotalFee(
  client: Pick<PublicClient, "readContract"> & { chain?: PublicClient["chain"] },
  request: {
    account: Address;
    to: Address;
    data: Hex;
    value: bigint;
    gas: bigint;
    maxFeePerGas?: bigint;
    gasPrice?: bigint;
  },
): Promise<bigint> {
  const perGas = request.maxFeePerGas ?? request.gasPrice;
  if (perGas === undefined) throw new Error("Complete execution fee is unavailable");
  // The oracle address comes from the client's chain; viem's generics want it restated.
  const l1Fee = await estimateL1Fee(
    client as unknown as Parameters<typeof estimateL1Fee>[0],
    {
      account: request.account,
      to: request.to,
      data: request.data,
      value: request.value,
      chain: client.chain,
    } as Parameters<typeof estimateL1Fee>[1],
  );
  return l1Fee + request.gas * perGas;
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
