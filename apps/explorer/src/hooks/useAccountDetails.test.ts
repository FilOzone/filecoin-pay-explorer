import { getAddress } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  fetchAllPages,
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

const PAGE_SIZE = 1_000;

/** `count` rows with ascending ids, served in pages the way graph-node would. */
const makePager = (count: number) => {
  const rows = Array.from({ length: count }, (_, index) => ({ id: `0x${(index + 1).toString(16).padStart(8, "0")}` }));
  let calls = 0;

  return {
    get calls() {
      return calls;
    },
    fetchPage: async (cursor: string) => {
      calls++;
      const start = cursor === "0x" ? 0 : rows.findIndex((row) => row.id === cursor) + 1;
      return rows.slice(start, start + PAGE_SIZE);
    },
  };
};

describe("fetchAllPages", () => {
  it("returns a short first page without asking for another", async () => {
    const pager = makePager(3);
    const result = await fetchAllPages(pager.fetchPage);

    expect(result.items).toHaveLength(3);
    expect(result.reachedPageLimit).toBe(false);
    expect(pager.calls).toBe(1);
  });

  it("returns an empty collection without looping", async () => {
    const pager = makePager(0);
    const result = await fetchAllPages(pager.fetchPage);

    expect(result.items).toEqual([]);
    expect(pager.calls).toBe(1);
  });

  it("walks every page and concatenates them in order", async () => {
    const pager = makePager(2_500);
    const result = await fetchAllPages(pager.fetchPage);

    expect(result.items).toHaveLength(2_500);
    expect(result.reachedPageLimit).toBe(false);
    expect(pager.calls).toBe(3);
    expect(result.items[0].id).toBe("0x00000001");
    expect(result.items[2_499].id).toBe(`0x${(2_500).toString(16).padStart(8, "0")}`);
  });

  it("makes one extra request when the last page is exactly full", async () => {
    // A full page is indistinguishable from more data, so the walk cannot stop
    // until it sees a short one.
    const pager = makePager(PAGE_SIZE);
    const result = await fetchAllPages(pager.fetchPage);

    expect(result.items).toHaveLength(PAGE_SIZE);
    expect(result.reachedPageLimit).toBe(false);
    expect(pager.calls).toBe(2);
  });

  it("stops at maxPages and reports the cap rather than paging forever", async () => {
    const pager = makePager(50_000);
    const result = await fetchAllPages(pager.fetchPage, 3);

    expect(result.items).toHaveLength(3 * PAGE_SIZE);
    expect(result.reachedPageLimit).toBe(true);
    // Three pages plus the read that confirms there is more behind them.
    expect(pager.calls).toBe(4);
  });

  it("does not report the cap when the data ends exactly at maxPages full pages", async () => {
    // Every page is full, so the walk cannot tell a complete history from a
    // truncated one without looking past the cap. Without that read this reports
    // a complete history as possibly incomplete.
    const pager = makePager(3 * PAGE_SIZE);
    const result = await fetchAllPages(pager.fetchPage, 3);

    expect(result.items).toHaveLength(3 * PAGE_SIZE);
    expect(result.reachedPageLimit).toBe(false);
    expect(pager.calls).toBe(4);
  });

  it("drops rows found beyond the cap rather than moving the boundary", async () => {
    const pager = makePager(3 * PAGE_SIZE + 500);
    const result = await fetchAllPages(pager.fetchPage, 3);

    expect(result.items).toHaveLength(3 * PAGE_SIZE);
    expect(result.reachedPageLimit).toBe(true);
  });

  it("throws instead of spinning when the cursor does not advance", async () => {
    // A full page whose last id equals the cursor would loop forever.
    const stuck = Array.from({ length: PAGE_SIZE }, () => ({ id: "0x" }));

    await expect(fetchAllPages(async () => stuck)).rejects.toThrow("did not advance");
  });
});

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
