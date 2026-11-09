// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceMetricsResponse } from "@/hooks/useAccountServices";
import { SUBGRAPH_PAGE_SIZE } from "@/utils/fetchAllPages";
import ServiceMetrics from "./ServiceMetrics";

const mocks = vi.hoisted(() => ({
  metrics: {} as { data?: ServiceMetricsResponse; isLoading?: boolean; isError?: boolean },
  allPayments: {} as {
    data?: { items: { totalAmount: bigint; token: { id: `0x${string}` } }[]; reachedPageLimit: boolean };
    isError?: boolean;
  },
  railTokens: {} as { data?: string[] },
  useAccountServiceMetrics: vi.fn(),
  useAccountServiceOneTimePayments: vi.fn(),
}));

vi.mock("@/hooks/useAccountServices", () => ({
  useAccountServiceMetrics: mocks.useAccountServiceMetrics,
  useAccountServiceOneTimePayments: mocks.useAccountServiceOneTimePayments,
  useAccountServiceRailTokens: () => mocks.railTokens,
}));

const OPERATOR = "0x2222222222222222222222222222222222222222";
const USDFC = { id: "0xusdfc" as const, symbol: "USDFC", decimals: 18n };
const AXL_USDC = { id: "0xaxl" as const, symbol: "axlUSDC", decimals: 6n };
const NOTICE = "Pays the 30-day notice after you terminate";
const ONE_TOKEN_THOUSANDTH = 1_000_000_000_000_000n;

const data: ServiceMetricsResponse = {
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
};

const fullFirstPage: ServiceMetricsResponse = {
  ...data,
  oneTimePayments: Array.from({ length: SUBGRAPH_PAGE_SIZE }, () => ({
    totalAmount: ONE_TOKEN_THOUSANDTH,
    token: USDFC,
  })),
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
  mocks.metrics = { data };
  mocks.allPayments = {};
  mocks.railTokens = {};
  mocks.useAccountServiceMetrics.mockImplementation(() => mocks.metrics);
  mocks.useAccountServiceOneTimePayments.mockImplementation(() => mocks.allPayments);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("ServiceMetrics", () => {
  it("shows one row per token, in that token's own decimals", () => {
    renderMetrics();

    expect(cellsOf("USDFC")).toEqual(["USDFC", "8.640", "0.420", `9.640${NOTICE}`, "—"]);
    expect(cellsOf("axlUSDC")).toEqual(["axlUSDC", "0.864", "0", `0.864${NOTICE}`, "—"]);
  });

  it("explains the three columns whose figures follow a rule", () => {
    renderMetrics();

    expect(screen.getAllByRole("button", { name: /^Explain / }).map((hint) => hint.getAttribute("aria-label"))).toEqual(
      ["Explain recurring / month", "Explain one-time, this month", "Explain locked deposit"],
    );
  });

  it("leaves out an approved token the pair has no rail in", () => {
    mocks.railTokens = { data: [USDFC.id] };

    renderMetrics();

    expect(screen.getByRole("cell", { name: "USDFC" })).toBeTruthy();
    expect(screen.queryByRole("cell", { name: "axlUSDC" })).toBeNull();
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

  describe("when a pair's payments overflow the first page", () => {
    const lastWalkOptions = () => mocks.useAccountServiceOneTimePayments.mock.lastCall?.[3];

    it("does not walk the payments of a pair that fits the page", () => {
      renderMetrics();

      expect(lastWalkOptions().enabled).toBe(false);
    });

    it("shows the other figures while the rest of the payments load", () => {
      mocks.metrics = { data: fullFirstPage };

      renderMetrics();

      expect(lastWalkOptions().enabled).toBe(true);
      expect(cellsOf("USDFC").slice(0, 4)).toEqual(["USDFC", "8.640", "Loading...", `9.640${NOTICE}`]);
    });

    it("totals every payment once they have loaded, not just the first page", () => {
      mocks.metrics = { data: fullFirstPage };
      mocks.allPayments = {
        data: {
          items: Array.from({ length: SUBGRAPH_PAGE_SIZE + 5 }, () => ({
            totalAmount: ONE_TOKEN_THOUSANDTH,
            token: USDFC,
          })),
          reachedPageLimit: false,
        },
      };

      renderMetrics();

      expect(cellsOf("USDFC")[2]).toBe("1.005");
      expect(screen.queryByText(/reached the data limit/)).toBeNull();
    });

    it("keeps the rest of the table when the payments fail", () => {
      mocks.metrics = { data: fullFirstPage };
      mocks.allPayments = { isError: true };

      renderMetrics();

      expect(cellsOf("USDFC").slice(0, 4)).toEqual(["USDFC", "8.640", "Unavailable", `9.640${NOTICE}`]);
    });
  });

  it("keeps the heading while the metrics load", () => {
    mocks.metrics = { isLoading: true };

    renderMetrics();

    expect(screen.getByRole("heading", { name: "Spend and funding" })).toBeTruthy();
    expect(screen.getByText("Loading spend and funding...")).toBeTruthy();
  });

  it("keeps the heading when the metrics fail", () => {
    mocks.metrics = { isError: true };

    renderMetrics();

    expect(screen.getByRole("heading", { name: "Spend and funding" })).toBeTruthy();
    expect(screen.getByText("Failed to load spend and funding")).toBeTruthy();
  });

  it("renders nothing when the pair has no approved token", () => {
    mocks.metrics = { data: { ...data, account: { operatorApprovals: [], userTokens: [] } } };

    const { container } = renderMetrics();

    expect(container.innerHTML).toBe("");
  });

  it.each([
    [
      "rails fill a page",
      () => {
        mocks.metrics = { data: { ...data, rails: Array.from({ length: SUBGRAPH_PAGE_SIZE }, () => data.rails[0]) } };
      },
    ],
    [
      "payments reach their limit",
      () => {
        mocks.metrics = { data: fullFirstPage };
        mocks.allPayments = { data: { items: [], reachedPageLimit: true } };
      },
    ],
  ])("warns when the %s", (_, arrange) => {
    arrange();

    renderMetrics();

    expect(screen.getByText("This service reached the data limit, so these totals may be incomplete.")).toBeTruthy();
  });

  it("does not warn below the page limit", () => {
    renderMetrics();

    expect(screen.queryByText(/reached the data limit/)).toBeNull();
  });
});
