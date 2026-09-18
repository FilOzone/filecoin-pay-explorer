import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { FundingLaunchProvider, useFundingLaunch } from "../FundingLaunchContext";
import AccountNotFound from "./AccountNotFound";

vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, onClick, variant }: { children: React.ReactNode; onClick: () => void; variant: string }) => (
    <button data-variant={variant} onClick={onClick} type='button'>
      {children}
    </button>
  ),
}));
vi.mock("@filecoin-foundation/ui-filecoin/EmptyStateCard", () => ({
  EmptyStateCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../AddServiceDialog", () => ({
  default: ({ open }: { open: boolean }) => <output data-add-service-open={open} />,
}));

function LaunchState() {
  const { isAddFundsOpen } = useFundingLaunch();
  return <output data-open={isAddFundsOpen} />;
}

describe("AccountNotFound", () => {
  it("keeps Deposit and Add Service primary and direct funding secondary", () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <FundingLaunchProvider>
          <AccountNotFound />
          <LaunchState />
        </FundingLaunchProvider>,
      );
    });

    const primary = renderer.root.findByProps({ "data-variant": "primary" });
    expect(primary.findByType("span").children).toContain("Deposit and Add Service");
    act(() => primary.props.onClick());
    expect(renderer.root.findByProps({ "data-add-service-open": true })).toBeDefined();

    const addFunds = renderer.root.findByProps({ "data-variant": "ghost" });
    expect(addFunds.children).toContain("Add funds");
    act(() => addFunds.props.onClick());
    expect(renderer.root.findByProps({ "data-open": true })).toBeDefined();
  });
});
