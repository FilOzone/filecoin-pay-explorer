import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserConsole from "./(console)/page";

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
  requestedAddress: "",
  requestedNetwork: "" as string,
}));
const topUpState = vi.hoisted(() => ({
  isTopUpActive: false,
}));
const sectionNetworks = vi.hoisted(() => ({
  approvals: "" as string,
  funds: "" as string,
  rails: "" as string,
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
vi.mock("@/components/UserConsole/TopUpActivityContext", () => ({
  useTopUpActivity: () => ({
    isTopUpActive: topUpState.isTopUpActive,
  }),
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
  FundsSection: ({ account, network }: { account: { id: string }; network: string }) => {
    sectionNetworks.funds = network;
    return <div data-account-id={account.id}>Funds</div>;
  },
  OperatorApprovalsSection: ({ network }: { network: string }) => {
    sectionNetworks.approvals = network;
    return <div>Approvals</div>;
  },
  RailsSection: ({ network }: { network: string }) => {
    sectionNetworks.rails = network;
    return <div>Rails</div>;
  },
}));
vi.mock("@/hooks/useAccountDetails", () => ({
  useAccountDetails: (address: string, options: { networkOverride: string }) => {
    accountState.requestedAddress = address;
    accountState.requestedNetwork = options.networkOverride;
    return accountState;
  },
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
    accountState.requestedAddress = "";
    accountState.requestedNetwork = "";
    topUpState.isTopUpActive = false;
    sectionNetworks.approvals = "";
    sectionNetworks.funds = "";
    sectionNetworks.rails = "";
  });

  it("keeps the unsupported-network console state on a Squid source chain", () => {
    const markup = renderToStaticMarkup(<UserConsole />);

    expect(markup).toContain("Unsupported network");
    expect(markup).not.toContain("Funds");
    expect(markup).not.toContain("Filecoin balance");
    expect(markup).not.toContain("Approvals");
    expect(markup).not.toContain("Rails");
  });

  it("keeps the full console on Filecoin", () => {
    wallet.chainId = 314;
    const markup = renderToStaticMarkup(<UserConsole />);

    expect(markup).toContain("Funds");
    expect(markup).toContain("Approvals");
    expect(markup).toContain("Rails");
  });

  it("keeps the default Filecoin console while the wallet chain resolves", () => {
    wallet.chainId = undefined;
    const markup = renderToStaticMarkup(<UserConsole />);

    expect(markup).toContain("Funds");
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
  });

  it("keeps Filecoin mainnet data visible on a Squid network while top-up is active", () => {
    topUpState.isTopUpActive = true;
    wallet.chainId = 8453;
    const sourceMarkup = renderToStaticMarkup(<UserConsole />);
    expect(sourceMarkup).toContain("Funds");
    expect(sourceMarkup).toContain("Approvals");
    expect(sourceMarkup).toContain("Rails");
    expect(sourceMarkup).not.toContain("Unsupported network");
    expect(accountState.requestedAddress).toBe(wallet.address);
    expect(accountState.requestedNetwork).toBe("mainnet");
    expect(sectionNetworks).toEqual({ approvals: "mainnet", funds: "mainnet", rails: "mainnet" });
  });

  it("does not let an active flag bypass an unrelated unsupported chain", () => {
    wallet.chainId = 12345;
    topUpState.isTopUpActive = true;

    const markup = renderToStaticMarkup(<UserConsole />);

    expect(markup).not.toContain("Funds");
    expect(accountState.requestedAddress).toBe("");
  });
});
