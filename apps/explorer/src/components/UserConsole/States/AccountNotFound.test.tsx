import { useEffect } from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { FundingLaunchProvider, useFundingLaunch } from "@/components/UserConsole/providers/FundingLaunchContext";
import AccountNotFound from "./AccountNotFound";

const privy = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ user: privy.user }) }));

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
  const { isAddFundsOpen, signupUserId } = useFundingLaunch();
  return <output data-open={isAddFundsOpen} data-signup-user={signupUserId ?? "none"} />;
}

function SignupFlag({ userId }: { userId: string }) {
  const { requestFundingAfterSignup } = useFundingLaunch();
  useEffect(() => requestFundingAfterSignup(userId), [requestFundingAfterSignup, userId]);
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

  it("opens Add funds once for the user that just signed up", () => {
    privy.user = { id: "did:privy:new" };
    const renderer = renderCard(<SignupFlag userId='did:privy:new' />);
    expect(renderer.root.findByProps({ "data-open": true, "data-signup-user": "none" })).toBeDefined();
  });

  it.each([
    ["another user", { id: "did:privy:returning" }],
    ["a wallet with no Privy session", null],
  ])("drops a signup left behind when %s lands here", (_, user) => {
    privy.user = user;
    const renderer = renderCard(<SignupFlag userId='did:privy:new' />);
    expect(renderer.root.findByProps({ "data-open": false, "data-signup-user": "none" })).toBeDefined();
  });
});
