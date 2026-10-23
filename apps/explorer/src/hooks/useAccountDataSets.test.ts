import { describe, expect, it, vi } from "vitest";

const observed = vi.hoisted(() => ({ query: "" }));

vi.mock("./useGraphQLQuery", () => ({
  useGraphQLQuery: (options: { query: string }) => {
    observed.query = options.query;
    return { data: undefined };
  },
}));

const { useAccountDataSets } = await import("./useAccountDataSets");

describe("useAccountDataSets", () => {
  // A deleted dataset has no rails left to act on, so the subgraph filters it out before pagination.
  it("excludes deleted datasets", () => {
    useAccountDataSets("0x1111111111111111111111111111111111111111", 1);

    expect(observed.query).toMatch(/where: \{ payer: \$payer, status_not: DELETED \}/);
  });
});
