export type FundingHelper = "elsewhere" | "insufficient" | "empty" | "gas" | null;

/**
 * One helper at a time, in order of what blocks the payment: another network
 * that can pay, then a top-up (buying or transferring USDC is only offered
 * once no scanned network can pay), then gas. Nothing while the balances or
 * the source are still unknown, or while the scan may yet find USDC.
 */
export function pickFundingHelper({
  hasAlternative,
  hasBalances,
  hasInsufficientGas,
  holdsUsdcSomewhere,
  isScanning,
  isSourceResolved,
  isUsdcShort,
}: {
  /** Another scanned network holds enough for the amount, or the most USDC before one is typed. */
  hasAlternative: boolean;
  hasBalances: boolean;
  hasInsufficientGas: boolean;
  holdsUsdcSomewhere: boolean;
  isScanning: boolean;
  isSourceResolved: boolean;
  /** The chosen source holds nothing, or less than the typed amount. */
  isUsdcShort: boolean;
}): FundingHelper {
  if (!hasBalances || !isSourceResolved) return null;
  if (isUsdcShort) {
    if (hasAlternative) return "elsewhere";
    if (isScanning) return null;
    return holdsUsdcSomewhere ? "insufficient" : "empty";
  }
  return hasInsufficientGas ? "gas" : null;
}
