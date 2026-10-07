// @vitest-environment jsdom
import type { Rail } from "@filecoin-pay/types";
import { act, cleanup, fireEvent, render as renderDom, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RailsSection } from ".";

const observed = vi.hoisted(() => ({
  chainId: 0,
  settlements: undefined as { account?: string; chainId?: number; chainName?: string } | undefined,
  onSettle: undefined as ((rail: Rail, currentEpoch: bigint | undefined) => void) | undefined,
  dialog: undefined as
    | { rail: Rail; currentEpoch?: bigint; open: boolean; onOpenChange: (open: boolean) => void }
    | undefined,
}));

vi.mock("@/hooks/useAccountServices", () => ({
  ACCOUNT_SERVICE_RAILS_PAGE_SIZE: 10,
  useAccountServiceRails: () => ({
    data: {
      rails: [
        {
          operator: { address: "0x2222222222222222222222222222222222222222" },
          payee: { address: "0x3333333333333333333333333333333333333333" },
          payer: { address: "0x1111111111111111111111111111111111111111" },
          railId: 1n,
        },
      ],
    },
    isError: false,
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useRailSettlements", () => ({
  useRailSettlements: (options: { account?: string; chainId?: number; chainName?: string }) => {
    observed.settlements = options;
    return { isSettling: () => false, settleRail: vi.fn() };
  },
}));
vi.mock("../SettleRailDialog", () => ({
  SettleRailDialog: (props: NonNullable<typeof observed.dialog>) => {
    observed.dialog = props;
    return props.open ? <div role='dialog' aria-label={`Settle rail ${props.rail.railId}`} /> : null;
  },
}));
vi.mock("./components", () => ({
  RailsEmptyInitial: () => null,
  RailsEmptyNoResults: () => null,
  RailsErrorState: () => null,
  RailsLoadingState: () => null,
  RailsSearch: () => null,
  RailsSectionLayout: ({ children }: { children: React.ReactNode }) => children,
  RailsTable: () => <div>Rails</div>,
}));
vi.mock("./context/SettleRailContext", () => ({
  SettleRailProvider: ({
    chainId,
    children,
    onSettle,
  }: {
    chainId: number;
    children: React.ReactNode;
    onSettle: (rail: Rail, currentEpoch: bigint | undefined) => void;
  }) => {
    observed.chainId = chainId;
    observed.onSettle = onSettle;
    return children;
  },
}));

const section = (totalRails = 1n) => (
  <RailsSection
    accountId='0x1111111111111111111111111111111111111111'
    network='mainnet'
    operatorAddress='0x2222222222222222222222222222222222222222'
    totalRails={totalRails}
    userAddress='0x1111111111111111111111111111111111111111'
  />
);

afterEach(cleanup);

describe("RailsSection display network", () => {
  beforeEach(() => {
    observed.chainId = 0;
    observed.settlements = undefined;
  });

  it("uses the explicit display chain for rail epochs", () => {
    renderDom(section());
    expect(observed.chainId).toBe(314);
  });

  it("pins settlements to the connected account and the display chain", () => {
    renderDom(section());
    expect(observed.settlements).toMatchObject({
      account: "0x1111111111111111111111111111111111111111",
      chainId: 314,
      chainName: "Filecoin - Mainnet",
    });
  });
});

describe("RailsSection pagination", () => {
  const pageLinks = () => screen.getAllByText(/^\d+$/).map((link) => link.textContent);
  const activePage = () => document.querySelector('[aria-current="page"]')?.textContent;

  // Regression: links stopped at 5, so from page 6 on no link was numbered or marked active.
  it("numbers a window around a page beyond the first five and marks it active", () => {
    renderDom(section(100n));
    for (let step = 0; step < 5; step++) fireEvent.click(screen.getByLabelText("Go to next page"));

    expect(pageLinks()).toEqual(["4", "5", "6", "7", "8"]);
    expect(activePage()).toBe("6");
  });

  it("keeps five links at either end of the range", () => {
    renderDom(section(100n));
    expect(pageLinks()).toEqual(["1", "2", "3", "4", "5"]);

    fireEvent.click(screen.getByText("5"));
    fireEvent.click(screen.getByText("7"));
    fireEvent.click(screen.getByText("9"));
    fireEvent.click(screen.getByText("10"));
    expect(pageLinks()).toEqual(["6", "7", "8", "9", "10"]);
    expect(activePage()).toBe("10");
  });
});

describe("RailsSection settle dialog", () => {
  const rail = { railId: 7n } as unknown as Rail;

  it("opens for the chosen rail with the epoch read at that moment, and closes without unmounting", () => {
    renderDom(section());
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => observed.onSettle?.(rail, 123n));
    expect(screen.getByRole("dialog", { name: "Settle rail 7" })).toBeTruthy();
    expect(observed.dialog).toMatchObject({ rail, currentEpoch: 123n });

    act(() => observed.dialog?.onOpenChange(false));
    expect(screen.queryByRole("dialog")).toBeNull();
    // Still mounted with the same rail, so the dialog can play its leave transition.
    expect(observed.dialog).toMatchObject({ rail, open: false });

    const next = { railId: 8n } as unknown as Rail;
    act(() => observed.onSettle?.(next, 456n));
    expect(screen.getByRole("dialog", { name: "Settle rail 8" })).toBeTruthy();
    expect(observed.dialog).toMatchObject({ rail: next, currentEpoch: 456n });
  });
});
