import { getAddress } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  useAccountApprovals,
  useAccountDetails,
  useAccountRails,
  useAccountSpendHistory,
  useAccountToken,
  useAccountTokens,
} from "./useAccountDetails";
import {
  useAccountService,
  useAccountServiceMetrics,
  useAccountServiceOneTimePayments,
  useAccountServiceRails,
  useAccountServices,
  useServiceApprovals,
} from "./useAccountServices";

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
    useAccountServices: (address) => useAccountServices(address),
    useAccountService: (address) => useAccountService(address, "0xoperator"),
    useAccountServiceRails: (address) => useAccountServiceRails(address, "0xoperator"),
    useAccountServiceMetrics: (address) => useAccountServiceMetrics(address, "0xoperator", 1n),
    useAccountServiceOneTimePayments: (address) =>
      useAccountServiceOneTimePayments(address, "0xoperator", 1n, { enabled: true }),
    useServiceApprovals: (address) => useServiceApprovals(address, "0xoperator"),
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
      useAccountServiceMetrics: (operator: string) => useAccountServiceMetrics(LOWERCASE, operator, 1n),
      useAccountServiceOneTimePayments: (operator: string) =>
        useAccountServiceOneTimePayments(LOWERCASE, operator, 1n, { enabled: true }),
      useServiceApprovals: (operator: string) => useServiceApprovals(LOWERCASE, operator),
    }),
  )("%s shares one cache entry between checksummed and lowercase operators", (_, read) => {
    expect(readWith(read, CHECKSUMMED)).toEqual(readWith(read, LOWERCASE));
  });
});
