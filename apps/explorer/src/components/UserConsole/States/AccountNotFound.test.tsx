import { useEffect } from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { FundingLaunchProvider, useFundingLaunch } from "@/components/UserConsole/providers/FundingLaunchContext";
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
  const { isAddFundsOpen, isFundingAfterSignup } = useFundingLaunch();
  return <output data-open={isAddFundsOpen} data-after-signup={isFundingAfterSignup} />;
}

function SignupFlag() {
  const { requestFundingAfterSignup } = useFundingLaunch();
  useEffect(() => requestFundingAfterSignup(), [requestFundingAfterSignup]);
  return null;
}

function renderCard(children?: React.ReactNode) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <FundingLaunchProvider>
        {children}
        <AccountNotFound network='mainnet' />
        <LaunchState />
      </FundingLaunchProvider>,
    );
  });
  return renderer;
}

describe("AccountNotFound", () => {
  it("leads with Add funds and keeps adding a service secondary", () => {
    const renderer = renderCard();
    expect(renderer.root.findByProps({ "data-open": false })).toBeDefined();

    const service = renderer.root.findByProps({ "data-variant": "ghost" });
    expect(service.children).toContain("Add a service");
    act(() => service.props.onClick());
    expect(renderer.root.findByProps({ "data-add-service-open": true })).toBeDefined();

    const addFunds = renderer.root.findByProps({ "data-variant": "primary" });
    expect(addFunds.findByType("span").children).toContain("Add funds");
    act(() => addFunds.props.onClick());
    expect(renderer.root.findByProps({ "data-open": true })).toBeDefined();
  });

  it("opens Add funds once for a wallet that just signed up", () => {
    const renderer = renderCard(<SignupFlag />);
    expect(renderer.root.findByProps({ "data-open": true, "data-after-signup": false })).toBeDefined();
  });
});
