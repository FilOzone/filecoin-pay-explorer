import { describe, expect, it, vi } from "vitest";

const observed = vi.hoisted(() => ({
  variables: {} as Record<string, unknown>,
  queryKey: [] as unknown[],
  select: ((data: unknown) => data) as (data: { rails: unknown[] }) => { rails: unknown[]; hasMore: boolean },
}));

vi.mock("./useGraphQLQuery", () => ({
  useGraphQLQuery: (options: {
    variables: Record<string, unknown>;
    queryKey: unknown[];
    select: (data: { rails: unknown[] }) => { rails: unknown[]; hasMore: boolean };
  }) => {
    observed.variables = options.variables;
    observed.queryKey = options.queryKey;
    observed.select = options.select;
    return { data: undefined, isLoading: false, isError: false };
  },
  useGraphQLInfiniteQuery: () => ({ data: undefined }),
}));

const { useAccountServiceRails } = await import("./useAccountServices");

const PAYER = "0x7a2eb67dad6b4e5598880c138705cd8fe8a3bd77";
const OPERATOR = "0xc6d414d51ff92d3643c6bfa092bb22fc9d89ee6f";
const PAYEE = "0x01d2a6dfa9ccbf4eefe50dfa5fd05341a0f74050";

describe("useAccountServiceRails where clause", () => {
  it("always pins the payer and operator", () => {
    useAccountServiceRails(PAYER, OPERATOR);

    expect(observed.variables.where).toEqual({ payer: PAYER, operator: OPERATOR });
  });

  it("narrows by rail ID without unpinning the pair", () => {
    useAccountServiceRails(PAYER, OPERATOR, 1, { railId: "27138" });

    expect(observed.variables.where).toEqual({
      payer: PAYER,
      operator: OPERATOR,
      railId: "27138",
    });
  });

  it("narrows by payee without unpinning the pair", () => {
    useAccountServiceRails(PAYER, OPERATOR, 1, { payee: PAYEE });

    expect(observed.variables.where).toEqual({ payer: PAYER, operator: OPERATOR, payee: PAYEE });
  });

  it("keys the cache on the composed filter so results are not shared", () => {
    useAccountServiceRails(PAYER, OPERATOR, 1, { railId: "1" });
    const withRailId = JSON.stringify(observed.queryKey);
    useAccountServiceRails(PAYER, OPERATOR, 1, { payee: PAYEE });

    expect(JSON.stringify(observed.queryKey)).not.toBe(withRailId);
  });
});

describe("useAccountServiceRails page boundary", () => {
  const rows = (count: number) => ({ rails: Array.from({ length: count }, (_, i) => ({ railId: String(i) })) });

  // Regression: asking for exactly a page cannot tell a full page apart from a
  // full page with nothing after it, so Next landed on an empty page.
  it("reports no more pages when the result is exactly one page", () => {
    useAccountServiceRails(PAYER, OPERATOR);

    expect(observed.select(rows(10))).toEqual({ rails: rows(10).rails, hasMore: false });
  });

  it("reports another page only once an extra row comes back", () => {
    useAccountServiceRails(PAYER, OPERATOR);
    const result = observed.select(rows(11));

    expect(result.hasMore).toBe(true);
    expect(result.rails).toHaveLength(10);
  });

  it("skips by the displayed page size, not the fetched size", () => {
    useAccountServiceRails(PAYER, OPERATOR, 3);

    expect(observed.variables.skip).toBe(20);
  });
});
