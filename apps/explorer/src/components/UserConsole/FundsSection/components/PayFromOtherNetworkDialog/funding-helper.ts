export type FundingHelper = "elsewhere" | "insufficient" | "empty" | "gas" | null;

/**
 * One helper at a time, in order of what blocks the payment: another network
 * holding the same token, then a top-up (buying or transferring USDC is only
 * offered once nothing scanned can pay), then gas. Nothing while the balances
 * or the source are still unknown, or while the scan may yet find something.
 */
export function pickFundingHelper({
  hasAlternative,
  hasBalances,
  hasInsufficientGas,
  holdsTokensSomewhere,
  isScanning,
  isSourceResolved,
  isTokenShort,
}: {
  /** Another scanned network holds enough of the token for the amount, or the most of it before one is typed. */
  hasAlternative: boolean;
  hasBalances: boolean;
  hasInsufficientGas: boolean;
  holdsTokensSomewhere: boolean;
  isScanning: boolean;
  isSourceResolved: boolean;
  /** The chosen source holds nothing, or less than the typed amount. */
  isTokenShort: boolean;
}): FundingHelper {
  if (!hasBalances || !isSourceResolved) return null;
  if (isTokenShort) {
    if (hasAlternative) return "elsewhere";
    if (isScanning) return null;
    return holdsTokensSomewhere ? "insufficient" : "empty";
  }
  return hasInsufficientGas ? "gas" : null;
}
