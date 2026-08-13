import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserConsole from "./page";

const wallet = vi.hoisted(() => ({
  address: "0x1111111111111111111111111111111111111111",
  chainId: 42161,
  isConnected: true,
}));
const accountState = vi.hoisted(() => ({
  data: { id: "0x1111111111111111111111111111111111111111" } as { id: string } | null,
  error: null,
  isError: false,
  isLoading: false,
}));

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useAccount: () => wallet,
}));
vi.mock("@/components/shared", () => ({
  Balance: () => <div>Filecoin balance</div>,
  ChainSwitcher: () => <div>Filecoin network</div>,
}));
vi.mock("@/components/UserConsole/ConsoleProviders", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/UserConsole/States", () => ({
  AccountNotFound: () => <div>Account not found</div>,
  ErrorState: () => <div>Account error</div>,
  NotConnected: () => <div>Not connected</div>,
  UnsupportedChain: () => <div>Unsupported network</div>,
}));
vi.mock("@/components/UserConsole", () => ({
  BetaWarning: () => null,
  FundsSection: ({ accountId, topUpOnly }: { accountId: string; topUpOnly?: boolean }) => (
    <div data-account-id={accountId}>{topUpOnly ? "Fund with another token" : "Funds"}</div>
  ),
  OperatorApprovalsSection: () => <div>Approvals</div>,
  RailsSection: () => <div>Rails</div>,
}));
vi.mock("@/hooks/useAccountDetails", () => ({
  useAccountDetails: () => accountState,
}));

describe("UserConsole", () => {
  beforeEach(() => {
    wallet.chainId = 42161;
    accountState.data = { id: "0x1111111111111111111111111111111111111111" };
    accountState.error = null;
    accountState.isError = false;
    accountState.isLoading = false;
  });

  it("shows the external funding entry but hides Filecoin-only dashboard sections on a Squid source chain", () => {
    const markup = renderToStaticMarkup(<UserConsole />);

    expect(markup).toContain("Fund with another token");
    expect(markup).toContain("Arbitrum");
    expect(markup).toContain("0x1111...1111");
    expect(markup).not.toContain("Unsupported network");
    expect(markup).not.toContain("Filecoin balance");
    expect(markup).not.toContain("Approvals");
    expect(markup).not.toContain("Rails");
  });

  it("keeps the full console on Filecoin", () => {
    wallet.chainId = 314;
    const markup = renderToStaticMarkup(<UserConsole />);

    expect(markup).toContain("Funds");
    expect(markup).toContain("Filecoin balance");
    expect(markup).toContain("Filecoin network");
    expect(markup).toContain("Approvals");
    expect(markup).toContain("Rails");
  });

  it("allows an unindexed account to start Squid funding", () => {
    accountState.data = null;
    const sourceChainMarkup = renderToStaticMarkup(<UserConsole />);

    expect(sourceChainMarkup).toContain("Fund with another token");
    expect(sourceChainMarkup).not.toContain("Account not found");

    wallet.chainId = 314;
    const filecoinMarkup = renderToStaticMarkup(<UserConsole />);

    expect(filecoinMarkup).toContain("Account not found");
    expect(filecoinMarkup).toContain("Fund with another token");
  });
});
