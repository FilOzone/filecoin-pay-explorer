// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceMetrics as ServiceMetricsData } from "@/hooks/useAccountServices";
import { SUBGRAPH_PAGE_SIZE } from "@/utils/fetchAllPages";
import ServiceMetrics from "./ServiceMetrics";

const mocks = vi.hoisted(() => ({
  query: {} as { data?: ServiceMetricsData; isLoading?: boolean; isError?: boolean },
  useAccountServiceMetrics: vi.fn(),
}));

vi.mock("@/hooks/useAccountServices", () => ({
  useAccountServiceMetrics: mocks.useAccountServiceMetrics,
}));

const OPERATOR = "0x2222222222222222222222222222222222222222";
const USDFC = { id: "0xusdfc" as const, symbol: "USDFC", decimals: 18n };
const AXL_USDC = { id: "0xaxl" as const, symbol: "axlUSDC", decimals: 6n };

const data: ServiceMetricsData = {
  account: {
    operatorApprovals: [
      { lockupUsage: 9_640_000_000_000_000_000n, token: USDFC },
      { lockupUsage: 864_000n, token: AXL_USDC },
    ],
    userTokens: [],
  },
  rails: [
    { paymentRate: 100_000_000_000_000n, lockupPeriod: 86_400n, token: USDFC },
    { paymentRate: 10n, lockupPeriod: 86_400n, token: AXL_USDC },
  ],
  oneTimePayments: [{ totalAmount: 420_000_000_000_000_000n, token: USDFC }],
  oneTimePaymentsReachedLimit: false,
};

const renderMetrics = () => render(<ServiceMetrics accountId='0xaccount' network='mainnet' operatorId={OPERATOR} />);

const cellsOf = (symbol: string) => {
  const row = screen.getByRole("cell", { name: symbol }).closest("tr");
  if (!row) throw new Error(`No row for ${symbol}`);
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);
};

beforeEach(() => {
  mocks.query = { data };
  mocks.useAccountServiceMetrics.mockImplementation(() => mocks.query);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ServiceMetrics", () => {
  it("shows one row per token, in that token's own decimals", () => {
    renderMetrics();

    const notice = "Pays the 30-day notice after you terminate";
    expect(cellsOf("USDFC")).toEqual(["USDFC", "8.640", "0.420", `9.640${notice}`, "—"]);
    expect(cellsOf("axlUSDC")).toEqual(["axlUSDC", "0.864", "0", `0.864${notice}`, "—"]);
  });

  it("asks for payments from the start of the viewer's current month", () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 15, 12) });

    renderMetrics();

    expect(mocks.useAccountServiceMetrics).toHaveBeenLastCalledWith(
      "0xaccount",
      OPERATOR,
      BigInt(new Date(2026, 10, 1).getTime() / 1_000),
      { networkOverride: "mainnet" },
    );
  });

  it("shows loading while the metrics load", () => {
    mocks.query = { isLoading: true };

    renderMetrics();

    expect(screen.getByText("Loading spend and funding...")).toBeTruthy();
  });

  it("shows an error when the metrics fail", () => {
    mocks.query = { isError: true };

    renderMetrics();

    expect(screen.getByText("Failed to load spend and funding")).toBeTruthy();
  });

  it("renders nothing when the pair has no approved token", () => {
    mocks.query = { data: { ...data, account: { operatorApprovals: [], userTokens: [] } } };

    const { container } = renderMetrics();

    expect(container.innerHTML).toBe("");
  });

  it.each([
    ["rails fill a page", { rails: Array.from({ length: SUBGRAPH_PAGE_SIZE }, () => data.rails[0]) }],
    ["payments reach their limit", { oneTimePaymentsReachedLimit: true }],
  ])("warns when the %s", (_, overrides) => {
    mocks.query = { data: { ...data, ...overrides } };

    renderMetrics();

    expect(screen.getByText("This service reached the data limit, so these totals may be incomplete.")).toBeTruthy();
  });

  it("does not warn below the page limit", () => {
    renderMetrics();

    expect(screen.queryByText(/reached the data limit/)).toBeNull();
  });
});
