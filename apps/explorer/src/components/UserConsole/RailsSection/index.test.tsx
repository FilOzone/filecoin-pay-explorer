import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RailsSection } from ".";

const observed = vi.hoisted(() => ({
  chainId: 0,
  railsArgs: [] as unknown[],
}));

const rail = {
  operator: { address: "0x2222222222222222222222222222222222222222" },
  payee: { address: "0x3333333333333333333333333333333333333333" },
  payer: { address: "0x1111111111111111111111111111111111111111" },
  railId: 1n,
};

vi.mock("@/hooks/useAccountServices", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useAccountServices")>()),
  useAccountServiceRails: (...args: unknown[]) => {
    observed.railsArgs = args;
    return { data: [rail], isError: false, isLoading: false };
  },
}));
vi.mock("@/hooks/useRailSettlements", () => ({
  useRailSettlements: () => ({ isSettling: () => false, settleRail: vi.fn(), settlements: new Set() }),
}));
vi.mock("../SettleRailDialog", () => ({ SettleRailDialog: () => null }));
vi.mock("./components", () => ({
  RailsEmptyInitial: () => null,
  RailsEmptyNoResults: () => null,
  RailsErrorState: () => null,
  RailsLoadingState: () => null,
  RailsSearch: () => null,
  RailsTable: () => <div>Rails</div>,
}));
vi.mock("./context/SettleRailContext", () => ({
  SettleRailProvider: ({ chainId, children }: { chainId: number; children: React.ReactNode }) => {
    observed.chainId = chainId;
    return children;
  },
}));

const ACCOUNT_ID = "0x1111111111111111111111111111111111111111";
const OPERATOR_ADDRESS = "0x2222222222222222222222222222222222222222";

const renderSection = (totalRails: bigint) =>
  renderToStaticMarkup(
    <RailsSection
      accountId={ACCOUNT_ID}
      network='mainnet'
      operatorAddress={OPERATOR_ADDRESS}
      totalRails={totalRails}
      userAddress={ACCOUNT_ID}
    />,
  );

describe("RailsSection", () => {
  beforeEach(() => {
    observed.chainId = 0;
    observed.railsArgs = [];
  });

  it("uses the explicit display chain for rail epochs", () => {
    renderSection(1n);

    expect(observed.chainId).toBe(314);
  });

  it("scopes the rail query to the payer and operator of the route", () => {
    renderSection(1n);

    expect(observed.railsArgs.slice(0, 3)).toEqual([ACCOUNT_ID, OPERATOR_ADDRESS, 1]);
  });

  it("pages on the pair's rail count, not the account-wide count", () => {
    // 25 rails at 10 per page is three pages, even though the fetched page holds
    // a single row.
    const markup = renderSection(25n);

    expect(markup).toContain('aria-label="pagination"');
    expect(markup).toContain(">3<");
    expect(markup).not.toContain(">4<");
  });

  it("hides pagination when the pair fits on one page", () => {
    const markup = renderSection(10n);

    expect(markup).not.toContain('aria-label="pagination"');
  });
});
