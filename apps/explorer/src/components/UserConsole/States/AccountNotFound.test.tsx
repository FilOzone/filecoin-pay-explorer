import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { FundingLaunchProvider, useFundingLaunch } from "../FundingLaunchContext";
import AccountNotFound from "./AccountNotFound";

vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <button onClick={onClick} type='button'>
      {children}
    </button>
  ),
}));
vi.mock("@filecoin-foundation/ui-filecoin/EmptyStateCard", () => ({
  EmptyStateCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../AddServiceDialog", () => ({ default: () => null }));

function LaunchState() {
  const { isAddFundsOpen } = useFundingLaunch();
  return <output data-open={isAddFundsOpen} />;
}

describe("AccountNotFound", () => {
  it("opens the shared funding host from the empty-account action", () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <FundingLaunchProvider>
          <AccountNotFound />
          <LaunchState />
        </FundingLaunchProvider>,
      );
    });

    const addFunds = renderer.root.findAllByType("button").find((button) => button.children.includes("Add funds"));
    expect(addFunds).toBeDefined();
    act(() => addFunds?.props.onClick());
    expect(renderer.root.findByType("output").props["data-open"]).toBe(true);
  });
});
