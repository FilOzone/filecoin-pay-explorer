import type { Account, Rail } from "@filecoin-pay/types";
import type { AccountService } from "@/hooks/useAccountServices";

/**
 * TEMPORARY FIXTURES. The `AccountOperator` schema is not deployed to the
 * subgraph endpoints yet, so the console has nothing real to render. Setting
 * `NEXT_PUBLIC_MOCK_CONSOLE_SERVICES=true` serves these rows instead of
 * querying.
 *
 * To remove: delete this file and the four `MOCK` branches that reference it in
 * `hooks/useAccountServices.ts` and `hooks/useAccountDetails.ts`.
 */

export const MOCK_CONSOLE_SERVICES = process.env.NEXT_PUBLIC_MOCK_CONSOLE_SERVICES === "true";

/** Filecoin Warm Storage Service on calibration — the one service with full metadata. */
const WARM_STORAGE = "0x02925630df557f957f70e112ba06e50965417ca0";
/** No metadata entry, so the console falls back to the truncated address. */
const UNKNOWN_SERVICE = "0x7b3f4a1c9d2e8f6a5b4c3d2e1f0a9b8c7d6e5f40";

const USDFC = {
  id: "0xb3042734b608a1b16e9e86b374a3f3e389b4cdf0",
  symbol: "USDFC",
  decimals: 18n,
} as unknown as Rail["token"];

const RAILS_PAGE_SIZE = 10;
const TOTAL_WARM_STORAGE_RAILS = 12;
/** 2026-08-01T00:00:00Z, so the dates in the table stay stable between runs. */
const FIRST_RAIL_CREATED_AT = 1785542400n;
const ONE_DAY = 86400n;
const CURRENT_EPOCH = 5_400_000n;

const account = (address: string) => ({ id: address, address }) as unknown as Rail["payer"];

const operator = (address: string) => ({ id: address, address }) as unknown as Rail["operator"];

/** Cycles through the states so the table shows every badge and settle affordance. */
const RAIL_STATES = ["ACTIVE", "ACTIVE", "TERMINATED", "ZERORATE", "FINALIZED"] as const;

const PAYEES = [
  "0x5c7e2a9f4b8d1c6e3a0f7b2d9c4e8a1b6d3f0c2e",
  "0x8f1d6b3a0c9e7f2b5d4a8c1e6b3f9d0a7c2e5b81",
  "0x3a9c5e1f7b2d8a4c0e6f3b9d5a1c7e2f8b4d6a03",
];

function buildRail(index: number, operatorAddress: string, payerAddress: string): Rail {
  const state = RAIL_STATES[index % RAIL_STATES.length];
  const isFinalized = state === "FINALIZED";
  const paymentRate = state === "ZERORATE" ? 0n : BigInt(120_000_000_000 + index * 9_000_000_000);
  const settledUpto = isFinalized ? CURRENT_EPOCH : CURRENT_EPOCH - BigInt(2880 * (index + 1));

  return {
    id: `0x${(index + 1).toString(16).padStart(8, "0")}`,
    railId: BigInt(4200 + index),
    state,
    paymentRate,
    totalSettledAmount: BigInt(index + 1) * 2_500_000_000_000_000_000n,
    totalOneTimePaymentAmount: index % 4 === 0 ? 500_000_000_000_000_000n : 0n,
    lockupPeriod: BigInt(2880 * 10),
    settledUpto,
    endEpoch: state === "TERMINATED" ? CURRENT_EPOCH + 2880n : 0n,
    rateChangeQueue: paymentRate > 0n ? [{ rate: paymentRate, untilEpoch: CURRENT_EPOCH }] : [],
    createdAt: FIRST_RAIL_CREATED_AT + BigInt(index) * ONE_DAY,
    payer: account(payerAddress),
    payee: account(PAYEES[index % PAYEES.length]),
    operator: operator(operatorAddress),
    token: USDFC,
  } as unknown as Rail;
}

export function getMockAccount(address: string): Account {
  return {
    id: address,
    address,
    totalRails: BigInt(TOTAL_WARM_STORAGE_RAILS),
    totalTokens: 1n,
    totalApprovals: 2n,
  } as unknown as Account;
}

export function getMockServices(accountId: string): AccountService[] {
  return [
    {
      id: `${accountId}${WARM_STORAGE.slice(2)}`,
      operator: { id: WARM_STORAGE, address: WARM_STORAGE },
      totalRails: BigInt(TOTAL_WARM_STORAGE_RAILS),
      totalActiveRails: 5n,
      totalApprovals: 1n,
      totalActiveApprovals: 1n,
    },
    // Approved but no rails yet: the case a browser-side grouping of a rail page
    // would miss entirely.
    {
      id: `${accountId}${UNKNOWN_SERVICE.slice(2)}`,
      operator: { id: UNKNOWN_SERVICE, address: UNKNOWN_SERVICE },
      totalRails: 0n,
      totalActiveRails: 0n,
      totalApprovals: 1n,
      totalActiveApprovals: 1n,
    },
  ] as unknown as AccountService[];
}

export function getMockService(accountId: string, operatorAddress: string): AccountService | null {
  return getMockServices(accountId).find((service) => service.operator.address === operatorAddress) ?? null;
}

export function getMockServiceRails(operatorAddress: string, payerAddress: string, page: number): Rail[] {
  if (operatorAddress !== WARM_STORAGE) {
    return [];
  }

  const start = (page - 1) * RAILS_PAGE_SIZE;

  return Array.from({ length: TOTAL_WARM_STORAGE_RAILS }, (_, index) =>
    buildRail(index, operatorAddress, payerAddress),
  ).slice(start, start + RAILS_PAGE_SIZE);
}
