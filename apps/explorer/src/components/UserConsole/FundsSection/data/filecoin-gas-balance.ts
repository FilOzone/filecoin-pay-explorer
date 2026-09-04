export type FilecoinGasBalanceStatus = "loading" | "unavailable" | "empty" | "funded";

export function filecoinGasBalanceStatus(
  balance: bigint | undefined,
  isFetching: boolean,
  isError: boolean,
): FilecoinGasBalanceStatus {
  if (isFetching) return "loading";
  if (isError || balance === undefined) return "unavailable";
  return balance === 0n ? "empty" : "funded";
}
