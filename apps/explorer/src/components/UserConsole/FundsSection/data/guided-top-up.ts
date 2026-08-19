import type { QueryClient } from "@tanstack/react-query";
import { parseFundingAmount, USDFC_DECIMALS } from "./funding-runway";

export function parseTopUpAmount(amount: string): bigint | null {
  return parseFundingAmount(amount, USDFC_DECIMALS);
}

export function withoutTopUpSearchParam(searchParams: URLSearchParams): string {
  const nextSearchParams = new URLSearchParams(searchParams);
  nextSearchParams.delete("topUp");
  const query = nextSearchParams.toString();
  return query ? `?${query}` : "";
}

export function invalidateTopUpQueries(queryClient: QueryClient, accountId: string, accountOwner: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["account", accountOwner] }),
    queryClient.invalidateQueries({ queryKey: ["account", accountId, "tokens"] }),
    queryClient.invalidateQueries({ queryKey: ["payments", "account-summary"] }),
    queryClient.invalidateQueries({ queryKey: ["balance"] }),
    queryClient.invalidateQueries({ queryKey: ["readContract"] }),
  ]);
}
