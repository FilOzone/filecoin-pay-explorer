/**
 * Why Review is disabled:
 * - missing: the form needs more input
 * - waiting: a balance, quote or fee estimate is loading
 * - failed: a read failed, and the form already shows that error with a retry
 * - funds: the paying account cannot cover the deposit
 */
export type SquidReviewBlocker = { kind: "missing" | "waiting" | "failed" | "funds"; message: string };

/** The first unmet requirement for Review, in the order the form asks for them, or null when Review can open. */
export function getSquidReviewBlocker({
  amount,
  balances,
  balancesFailed,
  feesFailed,
  feesLoading,
  isNativeSource,
  nativeSymbol,
  parsedAmount,
  payerLabel,
  quoteFailed,
  quoteLoading,
  quoteReady,
  requiredNative,
  sourceSymbol,
  usdcGas,
}: {
  amount: string;
  balances: { native: bigint; token: bigint } | undefined;
  balancesFailed: boolean;
  feesFailed: boolean;
  feesLoading: boolean;
  isNativeSource: boolean;
  nativeSymbol: string;
  parsedAmount: bigint | null;
  payerLabel: string;
  quoteFailed: boolean;
  quoteLoading: boolean;
  quoteReady: boolean;
  requiredNative: bigint | null;
  sourceSymbol: string | undefined;
  /** Set when network fees can only be paid in USDC; its plan then stands in for the native balance. */
  usdcGas?: "planning" | "failed" | "insufficient" | "conflict" | "ready";
}): SquidReviewBlocker | null {
  if (!sourceSymbol) return { kind: "missing", message: "Choose a source token." };
  if (amount.trim() === "") return { kind: "missing", message: "Enter an amount." };
  if (parsedAmount === null) return { kind: "missing", message: "Enter a valid amount." };
  if (balancesFailed) return { kind: "failed", message: `The ${sourceSymbol} balance could not be loaded.` };
  if (!balances) return { kind: "waiting", message: `Checking the ${sourceSymbol} balance…` };
  if (balances.token < parsedAmount) {
    return { kind: "funds", message: `${payerLabel} doesn't have enough ${sourceSymbol}.` };
  }
  if (quoteFailed) return { kind: "failed", message: "Squid could not quote this amount." };
  if (!quoteReady) {
    return quoteLoading
      ? { kind: "waiting", message: "Getting a quote…" }
      : { kind: "missing", message: "No quote is available yet." };
  }
  if (feesFailed) return { kind: "failed", message: "Network fees could not be estimated." };
  if (requiredNative === null) {
    return feesLoading
      ? { kind: "waiting", message: "Estimating network fees…" }
      : { kind: "missing", message: "Network fees are not available yet." };
  }
  if (usdcGas === "failed") return { kind: "failed", message: "USDC network fees could not be estimated." };
  if (usdcGas === "planning") return { kind: "waiting", message: "Setting aside USDC for network fees…" };
  if (usdcGas === "insufficient") {
    return {
      kind: "funds",
      message: `${payerLabel} doesn't have enough ${sourceSymbol} for the deposit and its fees.`,
    };
  }
  if (usdcGas === "conflict") {
    return {
      kind: "funds",
      message: `${payerLabel} is set up with another smart account, so its network fees can't be paid in ${sourceSymbol}. Add ${nativeSymbol} to pay them.`,
    };
  }
  if (usdcGas === "ready") return null;
  if (balances.native < requiredNative) {
    const purpose = isNativeSource ? "the payment and network fees" : "network fees";
    return { kind: "funds", message: `${payerLabel} doesn't have enough ${nativeSymbol} for ${purpose}.` };
  }
  return null;
}
