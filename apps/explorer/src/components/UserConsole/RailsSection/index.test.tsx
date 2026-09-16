import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RailsSection } from ".";

const observed = vi.hoisted(() => ({
  chainId: 0,
  settlements: undefined as { account?: string; chainId?: number; chainName?: string } | undefined,
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
    return { isSettling: () => false, settleRail: vi.fn(), settlements: new Set() };
  },
}));
vi.mock("../SettleRailDialog", () => ({ SettleRailDialog: () => null }));
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
  SettleRailProvider: ({ chainId, children }: { chainId: number; children: React.ReactNode }) => {
    observed.chainId = chainId;
    return children;
  },
}));

const render = () =>
  renderToStaticMarkup(
    <RailsSection
      accountId='0x1111111111111111111111111111111111111111'
      network='mainnet'
      operatorAddress='0x2222222222222222222222222222222222222222'
      totalRails={1n}
      userAddress='0x1111111111111111111111111111111111111111'
    />,
  );

describe("RailsSection display network", () => {
  beforeEach(() => {
    observed.chainId = 0;
    observed.settlements = undefined;
  });

  it("uses the explicit display chain for rail epochs", () => {
    render();
    expect(observed.chainId).toBe(314);
  });

  it("pins settlements to the connected account and the display chain", () => {
    render();
    expect(observed.settlements).toMatchObject({
      account: "0x1111111111111111111111111111111111111111",
      chainId: 314,
      chainName: "Filecoin - Mainnet",
    });
  });
});
