// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  const { closeAddFunds, closeAddFundsForChainChange, isAddFundsOpen, openAddFunds, requestFundingAfterSignup } =
    useFundingLaunch();
  return (
    <>
      <button onClick={() => requestFundingAfterSignup("did:privy:new")} type='button'>
        Sign up
      </button>
      <button onClick={() => openAddFunds()} type='button'>
        Wallet menu Add funds
      </button>
      {isAddFundsOpen && (
        <>
          <button onClick={closeAddFunds} type='button'>
            Close Add funds
          </button>
          <button onClick={closeAddFundsForChainChange} type='button'>
            Change chain
          </button>
        </>
      )}
    </>
  );
}

function Console({ card = true }: { card?: boolean }) {
  return (
    <FundingLaunchProvider>
      {card && <AccountNotFound network='mainnet' />}
      <AddFundsHost />
    </FundingLaunchProvider>
  );
}

const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const isAddFundsOpen = () => screen.queryByRole("button", { name: "Close Add funds" }) !== null;

describe("AccountNotFound", () => {
  it("leads with Add funds and keeps adding a service secondary", () => {
    privy.user = { id: "did:privy:returning" };
    render(<Console />);
    expect(isAddFundsOpen()).toBe(false);

    const service = screen.getByRole("button", { name: "Add service" });
    expect(service.dataset.variant).toBe("ghost");
    fireEvent.click(service);
    expect(screen.getByText("Add a Service dialog")).toBeTruthy();

    const addFunds = screen.getByRole("button", { name: "Add funds" });
    expect(addFunds.dataset.variant).toBe("primary");
    fireEvent.click(addFunds);
    expect(isAddFundsOpen()).toBe(true);
  });

  it("opens Add funds for a new user until they close it", () => {
    privy.user = { id: "did:privy:new" };
    const { rerender } = render(<Console />);
    click("Sign up");
    expect(isAddFundsOpen()).toBe(true);

    click("Close Add funds");
    rerender(<Console card={false} />);
    rerender(<Console />);
    expect(screen.getByRole("button", { name: "Add funds" })).toBeTruthy();
    expect(isAddFundsOpen()).toBe(false);
  });

  it("opens Add funds again after a chain change closes it", () => {
    privy.user = { id: "did:privy:new" };
    render(<Console />);
    click("Sign up");
    click("Change chain");
    expect(isAddFundsOpen()).toBe(true);
  });

  it("keeps a signup made before Privy reports the new user", () => {
    privy.user = null;
    const { rerender } = render(<Console card={false} />);
    click("Sign up");
    privy.user = { id: "did:privy:new" };
    rerender(<Console card={false} />);
    rerender(<Console />);
    expect(isAddFundsOpen()).toBe(true);
  });

  it.each([
    ["the user logs out", null],
    ["another user signs in", { id: "did:privy:returning" }],
  ])("drops a signup made off the overview once %s", (_, user) => {
    privy.user = { id: "did:privy:new" };
    const { rerender } = render(<Console card={false} />);
    click("Sign up");
    privy.user = user;
    rerender(<Console card={false} />);

    // Dropped, not deferred: the user who signed up returning later is not interrupted.
    privy.user = { id: "did:privy:new" };
    rerender(<Console card={false} />);
    rerender(<Console />);
    expect(isAddFundsOpen()).toBe(false);
  });

  it("drops a signup once the user funds elsewhere before the deposit is indexed", () => {
    privy.user = { id: "did:privy:new" };
    const { rerender } = render(<Console card={false} />);
    click("Sign up");
    click("Wallet menu Add funds");
    click("Close Add funds");
    rerender(<Console />);
    expect(isAddFundsOpen()).toBe(false);
  });
});
