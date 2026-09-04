export type FilecoinGasBalanceStatus = "loading" | "unavailable" | "insufficient" | "funded";

export function filecoinGasBalanceStatus(
  balance: bigint | undefined,
  isFetching: boolean,
  isError: boolean,
  minimumBalance = 1n,
): FilecoinGasBalanceStatus {
  if (isFetching) return "loading";
  if (isError || balance === undefined) return "unavailable";
  return balance < minimumBalance ? "insufficient" : "funded";
}
