import { describe, expect, it, vi } from "vitest";

const observed = vi.hoisted(() => ({
  variables: {} as Record<string, unknown>,
  select: ((data: unknown) => data) as (data: { accountOperators: Array<{ id: string }> }) => {
    services: Array<{ id: string }>;
    nextCursor: string | undefined;
  },
}));

vi.mock("./useGraphQLQuery", () => ({
  useGraphQLQuery: () => ({ data: undefined }),
  useGraphQLInfiniteQuery: (options: {
    getVariables: (cursor: string) => Record<string, unknown>;
    select: (data: { accountOperators: Array<{ id: string }> }) => {
      services: Array<{ id: string }>;
      nextCursor: string | undefined;
    };
  }) => {
    observed.variables = options.getVariables("0xcursor");
    observed.select = options.select;
    return { data: undefined };
  },
}));

const { useAccountServices } = await import("./useAccountServices");

const PAYER = "0x1111111111111111111111111111111111111111";
const rows = (count: number) => ({
  accountOperators: Array.from({ length: count }, (_, i) => ({ id: `0x${String(i).padStart(2, "0")}` })),
});

describe("useAccountServices page boundary", () => {
  it("opens the cursor at the payer address, which every id for it sorts after", () => {
    useAccountServices(PAYER);

    expect(observed.variables.accountId).toBe(PAYER);
  });

  // Regression: exactly one page of services offered a Load more that fetched
  // nothing and then silently disappeared.
  it("offers no next page when the result is exactly one page", () => {
    useAccountServices(PAYER);

    expect(observed.select(rows(10))).toEqual({ services: rows(10).accountOperators, nextCursor: undefined });
  });

  it("resumes from the last shown id, not the extra row", () => {
    useAccountServices(PAYER);
    const result = observed.select(rows(11));

    expect(result.services).toHaveLength(10);
    expect(result.nextCursor).toBe("0x09");
  });
});
