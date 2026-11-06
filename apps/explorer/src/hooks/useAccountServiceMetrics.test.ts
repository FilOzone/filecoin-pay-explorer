import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GET_SERVICE_METRICS,
  GET_SERVICE_ONE_TIME_PAYMENTS,
  GET_SERVICE_TOKEN_RAIL,
  GET_SUBGRAPH_BLOCK,
} from "@/services/grapql/queries";
import { SUBGRAPH_PAGE_SIZE } from "@/utils/fetchAllPages";
import {
  useAccountServiceMetrics,
  useAccountServiceOneTimePayments,
  useAccountServiceRailTokens,
} from "./useAccountServices";

const mocks = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  useQuery: vi.fn(),
  useGraphQLQuery: vi.fn(),
}));

vi.mock("./useGraphQLQuery", () => ({
  useGraphQLClient: () => ({ executeQuery: mocks.executeQuery }),
  useGraphQLQuery: mocks.useGraphQLQuery,
}));
vi.mock("./useNetwork", () => ({ default: () => ({ network: "mainnet" }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));

const USDFC = { id: "0xusdfc" };
const PAYER = "0x1111111111111111111111111111111111111111";
const OPERATOR = "0x2222222222222222222222222222222222222222";
const BLOCK = 77;

const payments = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}${String(index).padStart(6, "0")}`,
    totalAmount: "1",
    token: USDFC,
  }));

const lastQueryOptions = () => mocks.useQuery.mock.lastCall?.[0];

const flatten = (query: string) => query.replace(/\s+/g, " ");

beforeEach(() => {
  mocks.executeQuery.mockReset();
  mocks.useQuery.mockReset();
  mocks.useGraphQLQuery.mockReset();
});

describe("useAccountServiceMetrics", () => {
  it("asks for this pair's month with a full page of each list", () => {
    useAccountServiceMetrics(PAYER, OPERATOR, 100n);

    expect(mocks.useGraphQLQuery.mock.lastCall?.[0].variables).toEqual({
      accountId: PAYER,
      payer: PAYER,
      operator: OPERATOR,
      monthStart: "100",
      first: SUBGRAPH_PAGE_SIZE,
    });
  });

  // Mocked responses cannot catch a lost filter: without these, terminated rails or other services would count here.
  it("reads only the pair's paying active rails and its payments since the month began", () => {
    const query = flatten(GET_SERVICE_METRICS);

    expect(query).toContain("operatorApprovals(where: { operator: $operator }");
    expect(query).toContain("rails(where: { payer: $payer, operator: $operator, state: ACTIVE, paymentRate_gt: 0 }");
    expect(query).toContain(
      "oneTimePayments(where: { payer: $payer, operator: $operator, createdAt_gte: $monthStart }",
    );
  });
});

describe("useAccountServiceOneTimePayments", () => {
  const stubPages = (pagesByCursor: Record<string, unknown[]>) => {
    mocks.executeQuery.mockImplementation(async (query: string, variables?: { cursor: string }) => {
      if (query === GET_SUBGRAPH_BLOCK) return { _meta: { block: { number: BLOCK } } };
      if (query === GET_SERVICE_ONE_TIME_PAYMENTS && variables) {
        return { oneTimePayments: pagesByCursor[variables.cursor] ?? [] };
      }
      throw new Error("Unexpected query");
    });
  };

  const walk = () => {
    useAccountServiceOneTimePayments(PAYER, OPERATOR, 100n, { enabled: true });
    return lastQueryOptions().queryFn({});
  };

  const pageRequests = () =>
    mocks.executeQuery.mock.calls.filter(([query]) => query === GET_SERVICE_ONE_TIME_PAYMENTS).map(([, vars]) => vars);

  // Regression: mainnet pairs make over 8,000 of these within a week, so a single page understated them eightfold.
  it("follows the cursor through every page, all pinned to one block", async () => {
    const first = payments(SUBGRAPH_PAGE_SIZE, "0xa");
    const second = payments(3, "0xb");
    const lastIdOfFirst = first[first.length - 1]?.id ?? "";
    stubPages({ "0x": first, [lastIdOfFirst]: second });

    await expect(walk()).resolves.toEqual({ items: [...first, ...second], reachedPageLimit: false });

    const pair = { payer: PAYER, operator: OPERATOR, monthStart: "100", first: SUBGRAPH_PAGE_SIZE, block: BLOCK };
    expect(pageRequests()).toEqual([
      { ...pair, cursor: "0x" },
      { ...pair, cursor: lastIdOfFirst },
    ]);
  });

  it("flags the result as incomplete when payments outrun the page cap", async () => {
    mocks.executeQuery.mockImplementation(async (query: string, variables?: { cursor: string }) => {
      if (query === GET_SUBGRAPH_BLOCK) return { _meta: { block: { number: BLOCK } } };
      return { oneTimePayments: payments(SUBGRAPH_PAGE_SIZE, `${variables?.cursor}-`) };
    });

    const { items, reachedPageLimit } = await walk();

    expect(items).toHaveLength(10 * SUBGRAPH_PAGE_SIZE);
    expect(reachedPageLimit).toBe(true);
  });

  it("fails rather than walking unpinned while the subgraph reports no block", async () => {
    mocks.executeQuery.mockResolvedValue({ _meta: null });

    await expect(walk()).rejects.toThrow("Subgraph has not reported an indexed block yet");
    expect(pageRequests()).toEqual([]);
  });

  it("does not repeat the walk on every focus", () => {
    useAccountServiceOneTimePayments(PAYER, OPERATOR, 100n, { enabled: true });

    expect(lastQueryOptions().staleTime).toBeGreaterThan(0);
  });

  it("stays idle until asked", () => {
    useAccountServiceOneTimePayments(PAYER, OPERATOR, 100n, { enabled: false });

    expect(lastQueryOptions().enabled).toBe(false);
  });
});

describe("useAccountServiceRailTokens", () => {
  it("keeps only the tokens the pair has a rail in", async () => {
    mocks.executeQuery.mockImplementation(async (query: string, variables: { token: string }) => {
      if (query !== GET_SERVICE_TOKEN_RAIL) throw new Error("Unexpected query");
      return { rails: variables.token === "0xused" ? [{ id: "0x01" }] : [] };
    });

    useAccountServiceRailTokens(PAYER, OPERATOR, ["0xused", "0xunused"]);

    await expect(lastQueryOptions().queryFn({})).resolves.toEqual(["0xused"]);
    expect(mocks.executeQuery.mock.calls.map(([, variables]) => variables)).toEqual([
      { payer: PAYER, operator: OPERATOR, token: "0xused" },
      { payer: PAYER, operator: OPERATOR, token: "0xunused" },
    ]);
  });

  it.each([
    [0, false],
    [1, false],
    [2, true],
  ])("with %i approved tokens, asks: %s", (count, enabled) => {
    useAccountServiceRailTokens(
      PAYER,
      OPERATOR,
      Array.from({ length: count }, (_, index) => `0x${index}`),
    );

    expect(lastQueryOptions().enabled).toBe(enabled);
  });
});
