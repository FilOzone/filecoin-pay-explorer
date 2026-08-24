import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RailsSection } from ".";

const observed = vi.hoisted(() => ({ chainId: 0 }));

vi.mock("@/hooks/useAccountDetails", () => ({
  useAccountRails: () => ({
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
  useRailSettlements: () => ({ isSettling: () => false, settleRail: vi.fn(), settlements: new Set() }),
}));
vi.mock("../RailsSearch", () => ({ RailsSearch: () => null }));
vi.mock("../SettleRailDialog", () => ({ SettleRailDialog: () => null }));
vi.mock("./components", () => ({
  RailsEmptyInitial: () => null,
  RailsEmptyNoResults: () => null,
  RailsErrorState: () => null,
  RailsLoadingState: () => null,
  RailsTable: () => <div>Rails</div>,
}));
vi.mock("./context/SettleRailContext", () => ({
  SettleRailProvider: ({ chainId, children }: { chainId: number; children: React.ReactNode }) => {
    observed.chainId = chainId;
    return children;
  },
}));

describe("RailsSection display network", () => {
  beforeEach(() => {
    observed.chainId = 0;
  });

  it("uses the explicit display chain for rail epochs", () => {
    renderToStaticMarkup(
      <RailsSection
        account={{ id: "account", totalRails: 1n } as never}
        network='mainnet'
        userAddress='0x1111111111111111111111111111111111111111'
      />,
    );

    expect(observed.chainId).toBe(314);
  });
});
