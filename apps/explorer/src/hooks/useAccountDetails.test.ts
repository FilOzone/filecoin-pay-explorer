import { getAddress } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  useAccountApprovals,
  useAccountDetails,
  useAccountRails,
  useAccountSpendHistory,
  useAccountToken,
  useAccountTokens,
  useInfiniteAccountApprovals,
} from "./useAccountDetails";
import { useAccountService, useAccountServiceRails, useAccountServices } from "./useAccountServices";

type ObservedQuery = {
  queryKey: readonly unknown[];
  variables?: Record<string, unknown>;
  getVariables?: (pageParam: unknown) => Record<string, unknown>;
  initialPageParam?: unknown;
  select?: (data: unknown, pageParam: unknown) => unknown;
};

const observed = vi.hoisted(() => ({ query: undefined as unknown }));
const lastQuery = () => observed.query as ObservedQuery;

vi.mock("./useGraphQLQuery", () => ({
  useGraphQLQuery: (options: unknown) => {
    observed.query = options;
  },
  useGraphQLInfiniteQuery: (options: unknown) => {
    observed.query = options;
  },
  useGraphQLClient: () => ({ executeQuery: vi.fn() }),
}));
vi.mock("./useNetwork", () => ({ default: () => ({ network: "mainnet" }) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => {
    observed.query = options;
  },
}));

const CHECKSUMMED = getAddress("0xabcdef0000000000000000000000000000000001");
const LOWERCASE = CHECKSUMMED.toLowerCase();

describe("account query ids", () => {
  const reads: Record<string, (address: string) => void> = {
    useAccountDetails: (address) => useAccountDetails(address),
    useAccountTokens: (address) => useAccountTokens(address),
    useAccountToken: (address) => useAccountToken(address, "0xtoken"),
    useAccountRails: (address) => useAccountRails(address),
    useAccountSpendHistory: (address) => useAccountSpendHistory(address, "0xtoken", 1n, 2n),
    useAccountApprovals: (address) => useAccountApprovals(address),
    useInfiniteAccountApprovals: (address) => useInfiniteAccountApprovals(address),
    useAccountServices: (address) => useAccountServices(address),
    useAccountService: (address) => useAccountService(address, "0xoperator"),
    useAccountServiceRails: (address) => useAccountServiceRails(address, "0xoperator"),
  };

  const readWith = (read: (address: string) => void, address: string) => {
    read(address);
    const { queryKey, variables, getVariables, initialPageParam } = lastQuery();
    return { queryKey, variables: variables ?? getVariables?.(initialPageParam) };
  };

  it.each(Object.entries(reads))("%s shares one cache entry between checksummed and lowercase callers", (_, read) => {
    const lowercase = readWith(read, LOWERCASE);

    expect(lowercase.queryKey.slice(0, 2)).toEqual(["account", LOWERCASE]);
    expect(readWith(read, CHECKSUMMED)).toEqual(lowercase);
  });

  it.each(
    Object.entries({
      useAccountService: (operator: string) => useAccountService(LOWERCASE, operator),
      useAccountServiceRails: (operator: string) => useAccountServiceRails(LOWERCASE, operator),
    }),
  )("%s shares one cache entry between checksummed and lowercase operators", (_, read) => {
    expect(readWith(read, CHECKSUMMED)).toEqual(readWith(read, LOWERCASE));
  });
});

describe("useInfiniteAccountApprovals", () => {
  const approvals = (from: number, count: number) => ({
    operatorApprovals: Array.from({ length: count }, (_, i) => ({ id: `approval-${from + i}` })),
  });

  it("asks for one row past each page", () => {
    useInfiniteAccountApprovals(LOWERCASE);
    const { getVariables, initialPageParam } = lastQuery();

    expect(initialPageParam).toBe(0);
    expect(getVariables?.(10)).toEqual({ accountId: LOWERCASE, first: 11, skip: 10 });
  });

  it("shows a page and resumes after it when a row came back past it", () => {
    useInfiniteAccountApprovals(LOWERCASE);

    expect(lastQuery().select?.(approvals(10, 11), 10)).toEqual({
      operatorApprovals: approvals(10, 10).operatorApprovals,
      nextSkip: 20,
    });
  });

  // Exactly a page used to offer a Load more that fetched nothing.
  it("offers no next page when the last page is exactly full", () => {
    useInfiniteAccountApprovals(LOWERCASE);

    expect(lastQuery().select?.(approvals(10, 10), 10)).toEqual({ ...approvals(10, 10), nextSkip: undefined });
  });
});
