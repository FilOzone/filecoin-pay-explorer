// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  default: ({ open }: { open: boolean }) => (open ? <output>Add a Service dialog</output> : null),
}));

afterEach(cleanup);

// Stands in for FundingHost, which shows Add funds from the shared launch state.
function AddFundsHost() {
  const { closeAddFunds, isAddFundsOpen } = useFundingLaunch();
  if (!isAddFundsOpen) return null;
  return (
    <button onClick={closeAddFunds} type='button'>
      Close Add funds
    </button>
  );
}

function Signup({ userId }: { userId: string }) {
  const { requestFundingAfterSignup } = useFundingLaunch();
  useEffect(() => requestFundingAfterSignup(userId), [requestFundingAfterSignup, userId]);
  return null;
}

function Console({ card = true, signup }: { card?: boolean; signup?: string }) {
  return (
    <FundingLaunchProvider>
      {signup && <Signup userId={signup} />}
      {card && <AccountNotFound network='mainnet' />}
      <AddFundsHost />
    </FundingLaunchProvider>
  );
}

const isAddFundsOpen = () => screen.queryByRole("button", { name: "Close Add funds" }) !== null;

describe("AccountNotFound", () => {
  it("leads with Add funds and keeps adding a service secondary", () => {
    privy.user = { id: "did:privy:returning" };
    render(<Console />);
    expect(isAddFundsOpen()).toBe(false);

    const service = screen.getByRole("button", { name: "Add a service" });
    expect(service.dataset.variant).toBe("ghost");
    fireEvent.click(service);
    expect(screen.getByText("Add a Service dialog")).toBeTruthy();

    const addFunds = screen.getByRole("button", { name: "Add funds" });
    expect(addFunds.dataset.variant).toBe("primary");
    fireEvent.click(addFunds);
    expect(isAddFundsOpen()).toBe(true);
  });

  it("opens Add funds once for the user that just signed up", () => {
    privy.user = { id: "did:privy:new" };
    const { rerender } = render(<Console signup='did:privy:new' />);
    expect(isAddFundsOpen()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Close Add funds" }));
    rerender(<Console card={false} signup='did:privy:new' />);
    rerender(<Console signup='did:privy:new' />);
    expect(screen.getByRole("button", { name: "Add funds" })).toBeTruthy();
    expect(isAddFundsOpen()).toBe(false);
  });

  it.each([
    ["another user", { id: "did:privy:returning" }],
    ["a wallet with no Privy session", null],
  ])("drops a signup left behind when %s lands here", (_, user) => {
    privy.user = user;
    const { rerender } = render(<Console signup='did:privy:new' />);
    expect(isAddFundsOpen()).toBe(false);

    // Dropped, not deferred: the user who signed up arriving later is not interrupted either.
    privy.user = { id: "did:privy:new" };
    rerender(<Console card={false} signup='did:privy:new' />);
    rerender(<Console signup='did:privy:new' />);
    expect(isAddFundsOpen()).toBe(false);
  });
});
