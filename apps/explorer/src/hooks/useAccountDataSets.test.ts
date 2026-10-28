import type { DataSet } from "@filecoin-pay/types";
import { describe, expect, it, vi } from "vitest";

type Page = { dataSets: DataSet[]; hasMore: boolean };

const observed = vi.hoisted(() => ({
  options: undefined as
    | { variables: { first: number; skip: number }; select: (data: { dataSets: DataSet[] }) => Page }
    | undefined,
}));

vi.mock("./useGraphQLQuery", () => ({
  useGraphQLQuery: (options: typeof observed.options) => {
    observed.options = options;
    return { data: undefined };
  },
}));

const { useAccountDataSets } = await import("./useAccountDataSets");

const rows = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `0x${i}` }) as DataSet);

const fetchPage = (page: number, returned: number) => {
  useAccountDataSets("0x1111111111111111111111111111111111111111", page);
  if (!observed.options) throw new Error("useGraphQLQuery was not called");
  return { variables: observed.options.variables, result: observed.options.select({ dataSets: rows(returned) }) };
};

describe("useAccountDataSets", () => {
  it("reports no next page when only a full page comes back", () => {
    const { variables, result } = fetchPage(2, 10);

    expect(variables).toMatchObject({ first: 11, skip: 10 });
    expect(result.dataSets).toHaveLength(10);
    expect(result.hasMore).toBe(false);
  });

  it("drops the extra row and reports a next page when one more than a page comes back", () => {
    const { result } = fetchPage(1, 11);

    expect(result.dataSets).toEqual(rows(10));
    expect(result.hasMore).toBe(true);
  });
});
