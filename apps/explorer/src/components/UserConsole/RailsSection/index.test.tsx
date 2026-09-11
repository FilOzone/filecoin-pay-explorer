import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RailsSection } from ".";

const query = vi.hoisted(() => ({
  data: undefined as { rails: unknown[]; hasMore: boolean } | undefined,
  isError: false,
  isLoading: false,
}));

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
    return query;
  },
}));
vi.mock("@/hooks/useRailSettlements", () => ({
  useRailSettlements: () => ({ isSettling: () => false, settleRail: vi.fn(), settlements: new Set() }),
}));
vi.mock("../SettleRailDialog", () => ({ SettleRailDialog: () => null }));
vi.mock("./components", () => ({
  RailsEmptyInitial: () => <div>No payment rails</div>,
  RailsEmptyNoResults: () => <div>No results found</div>,
  RailsErrorState: () => <div>Failed to load rails</div>,
  RailsLoadingState: () => <div>Loading rails</div>,
  RailsSearch: ({ appliedQuery, onSearch }: { appliedQuery: string; onSearch: (query: string) => void }) => (
    <div>
      {appliedQuery ? `Filtered by ${appliedQuery}` : "Search"}
      <button type='button' aria-label='apply filter' onClick={() => onSearch("27138")} />
    </div>
  ),
  RailsSectionLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
    query.data = { rails: [rail], hasMore: false };
    query.isError = false;
    query.isLoading = false;
  });

  it("uses the explicit display chain for rail epochs", () => {
    renderSection(1n);

    expect(observed.chainId).toBe(314);
  });

  it("scopes the rail query to the payer and operator of the route", () => {
    renderSection(1n);

    expect(observed.railsArgs.slice(0, 4)).toEqual([ACCOUNT_ID, OPERATOR_ADDRESS, 1, {}]);
  });

  it("numbers pages from the pair's rail count, not the account-wide count", () => {
    // 25 rails at 10 per page is three pages, even though the fetched page holds
    // a single row.
    const markup = renderSection(25n);

    expect(markup).toContain('aria-label="pagination"');
    expect(markup).toContain(">3<");
    expect(markup).not.toContain(">4<");
  });

  it("caps the numbered links rather than listing every page", () => {
    // 400 rails is forty pages.
    const markup = renderSection(400n);

    expect(markup).toContain(">5<");
    expect(markup).not.toContain(">6<");
  });

  it("hides pagination when the pair fits on one page", () => {
    expect(renderSection(10n)).not.toContain('aria-label="pagination"');
  });
});

describe("RailsSection filtering", () => {
  beforeEach(() => {
    query.data = { rails: [rail], hasMore: false };
    query.isError = false;
    query.isLoading = false;
  });

  // Regression: the applied filter used to live inside RailsSearch, so the
  // loading state that every filter change triggers unmounted it and dropped
  // the chip, leaving a narrowed list with no way back.
  it("keeps the search box and its chip while a filtered query is in flight", () => {
    query.isLoading = true;

    const markup = renderSection(25n);

    expect(markup).toContain("Loading rails");
    expect(markup).toContain("Search");
  });

  it("keeps the section chrome on an error rather than replacing the whole section", () => {
    query.isError = true;

    const markup = renderSection(25n);

    expect(markup).toContain("Failed to load rails");
    expect(markup).toContain("Search");
  });

  it("distinguishes a pair with no rails from a filter that matched nothing", () => {
    query.data = { rails: [], hasMore: false };

    expect(renderSection(0n)).toContain("No payment rails");
  });

  it("hides the search box for a pair that has no rails at all", () => {
    query.data = { rails: [], hasMore: false };

    expect(renderSection(0n)).not.toContain("Search");
  });
});

describe("RailsSection pagination strategy", () => {
  beforeEach(() => {
    query.data = { rails: [rail], hasMore: true };
    query.isError = false;
    query.isLoading = false;
  });

  // A filtered set has no total, so numbered links would be a guess.
  it("steps instead of numbering once a filter is applied", () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <RailsSection
          accountId={ACCOUNT_ID}
          network='mainnet'
          operatorAddress={OPERATOR_ADDRESS}
          totalRails={25n}
          userAddress={ACCOUNT_ID}
        />,
      );
    });

    const pageLinks = () => tree.root.findAll((node) => typeof node.type === "string" && node.props.children === 3);

    expect(pageLinks()).toHaveLength(1);

    act(() => {
      tree.root.findAll((node) => node.props["aria-label"] === "apply filter")[0].props.onClick();
    });

    expect(JSON.stringify(tree.toJSON())).toContain("Filtered by 27138");
    expect(pageLinks()).toHaveLength(0);
  });
});
