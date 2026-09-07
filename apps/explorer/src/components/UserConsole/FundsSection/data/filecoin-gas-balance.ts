import { FIL_GAS_TOP_UP_AMOUNT } from "./squid-deposit-route";

export type FilecoinGasBalanceStatus = "loading" | "unavailable" | "insufficient" | "funded";

/**
 * FIL a wallet must hold before the console lets it pay Filecoin transaction
 * fees. It equals what the guided top-up delivers, so one top-up always clears
 * the guard.
 */
export const FIL_TRANSACTION_FEE_RESERVE = FIL_GAS_TOP_UP_AMOUNT;

export function getFilecoinGasBalanceStatus({
  balance,
  isError,
  isLoading,
  minimumBalance = FIL_TRANSACTION_FEE_RESERVE,
}: {
  balance: bigint | undefined;
  isError: boolean;
  /** True until a usable balance exists; a background refetch of a known balance is not loading. */
  isLoading: boolean;
  minimumBalance?: bigint;
}): FilecoinGasBalanceStatus {
  if (isLoading) return "loading";
  if (isError || balance === undefined) return "unavailable";
  return balance < minimumBalance ? "insufficient" : "funded";
}
