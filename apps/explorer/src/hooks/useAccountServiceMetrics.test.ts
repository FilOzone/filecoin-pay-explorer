import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET_SERVICE_METRICS, GET_SERVICE_ONE_TIME_PAYMENTS } from "@/services/grapql/queries";
import { SUBGRAPH_PAGE_SIZE } from "@/utils/fetchAllPages";
import { type ServiceMetrics, useAccountServiceMetrics } from "./useAccountServices";

const mocks = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  queryFn: undefined as unknown as (context: { signal?: AbortSignal }) => Promise<unknown>,
}));

vi.mock("./useGraphQLQuery", () => ({
  useGraphQLClient: () => ({ executeQuery: mocks.executeQuery }),
}));
vi.mock("./useNetwork", () => ({ default: () => ({ network: "mainnet" }) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryFn: typeof mocks.queryFn }) => {
    mocks.queryFn = options.queryFn;
  },
}));

const USDFC = { id: "0xusdfc" };
const PAYER = "0x1111111111111111111111111111111111111111";
const OPERATOR = "0x2222222222222222222222222222222222222222";

const payments = (count: number, prefix = "0x") =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}${String(index).padStart(6, "0")}`,
    totalAmount: "1",
    token: USDFC,
  }));

const read = async (firstPage: unknown[], pagedPages: unknown[][]): Promise<ServiceMetrics> => {
  mocks.executeQuery.mockImplementation(async (query: string, variables: { cursor?: string }) => {
    if (query === GET_SERVICE_METRICS) {
      return { account: null, rails: [], oneTimePayments: firstPage };
    }
    if (query !== GET_SERVICE_ONE_TIME_PAYMENTS) throw new Error("Unexpected query");
    const pageIndex = mocks.executeQuery.mock.calls.filter(([q]) => q === GET_SERVICE_ONE_TIME_PAYMENTS).length - 1;
    return { oneTimePayments: pagedPages[Math.min(pageIndex, pagedPages.length - 1)], cursor: variables.cursor };
  });
  useAccountServiceMetrics(PAYER, OPERATOR, 100n);
  return (await mocks.queryFn({})) as ServiceMetrics;
};

beforeEach(() => {
  mocks.executeQuery.mockReset();
});

describe("useAccountServiceMetrics", () => {
  it("reads the whole table in one request when the payments fit a page", async () => {
    const metrics = await read(payments(SUBGRAPH_PAGE_SIZE - 1), []);

    expect(mocks.executeQuery).toHaveBeenCalledTimes(1);
    expect(mocks.executeQuery.mock.calls[0][1]).toEqual({
      accountId: PAYER,
      payer: PAYER,
      operator: OPERATOR,
      monthStart: "100",
      first: SUBGRAPH_PAGE_SIZE,
    });
    expect(metrics.oneTimePayments).toHaveLength(SUBGRAPH_PAGE_SIZE - 1);
    expect(metrics.oneTimePaymentsReachedLimit).toBe(false);
  });

  // Regression: mainnet pairs make over 8,000 of these within a week, so a single page understated them eightfold.
  it("reads every payment when they overflow the first page", async () => {
    const metrics = await read(payments(SUBGRAPH_PAGE_SIZE), [
      payments(SUBGRAPH_PAGE_SIZE, "0xa"),
      payments(SUBGRAPH_PAGE_SIZE, "0xb"),
      payments(3, "0xc"),
    ]);

    expect(metrics.oneTimePayments).toHaveLength(2 * SUBGRAPH_PAGE_SIZE + 3);
    expect(metrics.oneTimePaymentsReachedLimit).toBe(false);
  });

  it("flags the payments as incomplete when they outrun the page cap", async () => {
    const pages = Array.from({ length: 11 }, (_, page) => payments(SUBGRAPH_PAGE_SIZE, `0x${page}`));

    const metrics = await read(payments(SUBGRAPH_PAGE_SIZE), pages);

    expect(metrics.oneTimePayments).toHaveLength(10 * SUBGRAPH_PAGE_SIZE);
    expect(metrics.oneTimePaymentsReachedLimit).toBe(true);
  });
});
