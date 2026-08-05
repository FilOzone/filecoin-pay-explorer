import { parseUnits } from "viem";
import { calculateFundingRunway, type FundingPosition, USDFC_DECIMALS } from "./funding-runway";

export function parseTopUpAmount(amount: string): bigint | null {
  try {
    const parsedAmount = parseUnits(amount, USDFC_DECIMALS);
    return parsedAmount > 0n ? parsedAmount : null;
  } catch {
    return null;
  }
}

export function calculateProjectedFundingRunway(position: FundingPosition, amount: bigint, nowTimestamp: bigint) {
  return calculateFundingRunway({ ...position, funds: BigInt(position.funds) + amount }, nowTimestamp);
}

export function withoutTopUpSearchParam(searchParams: URLSearchParams): string {
  const nextSearchParams = new URLSearchParams(searchParams);
  nextSearchParams.delete("topUp");
  const query = nextSearchParams.toString();
  return query ? `?${query}` : "";
}
