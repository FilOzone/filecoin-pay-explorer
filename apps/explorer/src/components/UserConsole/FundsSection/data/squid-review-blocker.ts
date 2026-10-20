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
  if (balances.native < requiredNative) {
    const purpose = isNativeSource ? "the payment and network fees" : "network fees";
    return { kind: "funds", message: `${payerLabel} doesn't have enough ${nativeSymbol} for ${purpose}.` };
  }
  return null;
}
