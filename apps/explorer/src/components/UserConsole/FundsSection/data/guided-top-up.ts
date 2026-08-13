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
