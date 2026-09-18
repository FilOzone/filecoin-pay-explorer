const OP_STACK_CHAIN_IDS = new Set([10, 8453]);
const OP_STACK_FEE_BUFFER_BPS = 12_000n;
const BPS = 10_000n;

export function applyNetworkFeeExecutionBuffer(chainId: number, fee: bigint): bigint {
  return OP_STACK_CHAIN_IDS.has(chainId) ? (fee * OP_STACK_FEE_BUFFER_BPS + BPS - 1n) / BPS : fee;
}

export function isOpStackChain(chainId: number): boolean {
  return OP_STACK_CHAIN_IDS.has(chainId);
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
