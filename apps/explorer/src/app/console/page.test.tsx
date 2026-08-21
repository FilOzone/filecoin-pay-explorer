import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserConsole from "./page";

const wallet = vi.hoisted(() => ({
  address: "0x1111111111111111111111111111111111111111",
  chainId: 42161 as number | undefined,
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
  useConnection: () => wallet,
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
  AlertsBanner: () => null,
  BetaWarning: () => null,
  FundsSection: ({ accountId }: { accountId: string }) => <div data-account-id={accountId}>Funds</div>,
  OperatorApprovalsSection: () => <div>Approvals</div>,
  RailsSection: () => <div>Rails</div>,
  TopUpDialogController: ({
    accountId,
    children,
    showTrigger,
  }: {
    accountId: string;
    children?: (openTopUp: () => void) => React.ReactNode;
    showTrigger?: boolean;
  }) => (
    <div data-top-up-account-id={accountId}>
      {children?.(() => undefined)}
      {showTrigger ? "Fund with another token" : null}
    </div>
  ),
}));
vi.mock("@/hooks/useAccountDetails", () => ({
  useAccountDetails: () => accountState,
}));
vi.mock("@/hooks/useNotificationStatus", () => ({
  useNotificationStatus: () => ({ data: undefined, isError: false }),
}));

describe("UserConsole", () => {
  beforeEach(() => {
    wallet.chainId = 42161;
    accountState.data = { id: "0x1111111111111111111111111111111111111111" };
    accountState.error = null;
    accountState.isError = false;
    accountState.isLoading = false;
  });

  it("keeps a reachable funding trigger on a Squid source chain", () => {
    // The console itself only supports Filecoin, so the unsupported-network
    // banner is correct here — but the guided top-up needs the wallet parked
    // on a source chain (Base, Arbitrum, …) to sign, so a reachable trigger
    // is required or a lost/refreshed dialog strands the user off Filecoin
    // with no way back into the flow without a round trip that just repeats.
    const markup = renderToStaticMarkup(<UserConsole />);

    expect(markup).toContain("Unsupported network");
    expect(markup).toContain('data-top-up-account-id="0x1111111111111111111111111111111111111111"');
    expect(markup).toContain("Fund with another token");
    expect(markup).not.toContain("Funds");
    expect(markup).not.toContain("Filecoin balance");
    expect(markup).not.toContain("Approvals");
    expect(markup).not.toContain("Rails");
  });

  it("waits for the wallet network before choosing a console state", () => {
    wallet.chainId = undefined;
    const markup = renderToStaticMarkup(<UserConsole />);

    expect(markup).toContain("Loading your wallet network...");
    expect(markup).not.toContain("Unsupported network");
    expect(markup).not.toContain("Funds");
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

  it("keeps direct deposit funding on Calibration", () => {
    wallet.chainId = 314159;
    const markup = renderToStaticMarkup(<UserConsole />);

    expect(markup).toContain("Funds");
    expect(markup).not.toContain("data-top-up-account-id");
  });

  it("allows an unindexed account to start Squid funding", () => {
    accountState.data = null;
    wallet.chainId = 314;
    const filecoinMarkup = renderToStaticMarkup(<UserConsole />);

    expect(filecoinMarkup).toContain("Account not found");
    expect(filecoinMarkup).toContain("Fund with another token");
  });
});
