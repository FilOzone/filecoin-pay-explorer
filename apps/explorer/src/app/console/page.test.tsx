import { useEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
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
  close: undefined as (() => void) | undefined,
  isTopUpActive: false,
  mounts: 0,
  unmounts: 0,
}));
const sectionNetworks = vi.hoisted(() => ({
  approvals: "" as string,
  funds: "" as string,
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
    setTopUpActive: (active: boolean) => {
      topUpState.isTopUpActive = active;
    },
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
  FundsSection: ({
    account,
    network,
    onGuidedTopUp,
  }: {
    account: { id: string };
    network: string;
    onGuidedTopUp?: () => void;
  }) => {
    sectionNetworks.funds = network;
    return (
      <div data-account-id={account.id}>
        Funds
        {onGuidedTopUp ? (
          <button data-open-top-up onClick={onGuidedTopUp} type='button'>
            Open top-up
          </button>
        ) : null}
      </div>
    );
  },
  ServicesRollup: () => null,
  OperatorApprovalsSection: ({ network }: { network: string }) => {
    sectionNetworks.approvals = network;
    return <div>Approvals</div>;
  },
  TopUpDialogController: ({
    accountId,
    children,
    showTrigger,
  }: {
    accountId: string;
    children?: (openTopUp: () => void, isOpen: boolean) => React.ReactNode;
    showTrigger?: boolean;
  }) => (
    <MockTopUpDialogController accountId={accountId} showTrigger={showTrigger}>
      {children}
    </MockTopUpDialogController>
  ),
}));
vi.mock("@/hooks/useAccountDetails", () => ({
  useAccountDetails: (address: string, options: { networkOverride: string }) => {
    accountState.requestedAddress = address;
    accountState.requestedNetwork = options.networkOverride;
    return accountState;
  },
}));

function MockTopUpDialogController({
  accountId,
  children,
  showTrigger,
}: {
  accountId: string;
  children?: (openTopUp: () => void, isOpen: boolean) => React.ReactNode;
  showTrigger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    topUpState.mounts += 1;
    return () => {
      topUpState.unmounts += 1;
    };
  }, []);
  const openTopUp = () => {
    topUpState.isTopUpActive = true;
    setOpen(true);
  };
  topUpState.close = () => {
    topUpState.isTopUpActive = false;
    setOpen(false);
  };

  return (
    <div data-top-up-account-id={accountId} data-top-up-open={open}>
      {children?.(openTopUp, open)}
      {showTrigger ? (
        <button data-open-top-up onClick={openTopUp} type='button'>
          Fund with another token
        </button>
      ) : null}
    </div>
  );
}
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
    topUpState.close = undefined;
    topUpState.isTopUpActive = false;
    topUpState.mounts = 0;
    topUpState.unmounts = 0;
    sectionNetworks.approvals = "";
    sectionNetworks.funds = "";
  });

  it("keeps the unsupported-network console state on a Squid source chain", () => {
    const markup = renderToStaticMarkup(<UserConsole />);

    expect(markup).toContain("Unsupported network");
    expect(markup).toContain('data-top-up-account-id="0x1111111111111111111111111111111111111111"');
    expect(markup).not.toContain("Fund with another token");
    expect(markup).not.toContain("Funds");
    expect(markup).not.toContain("Filecoin balance");
    expect(markup).not.toContain("Approvals");
  });

  it("keeps the full console on Filecoin", () => {
    wallet.chainId = 314;
    const markup = renderToStaticMarkup(<UserConsole />);

    expect(markup).toContain("Funds");
    expect(markup).toContain('data-top-up-account-id="0x1111111111111111111111111111111111111111"');
    expect(markup).toContain("Approvals");
    expect(markup).not.toContain("Rails");
  });

  it("keeps the default Filecoin console while the wallet chain resolves", () => {
    wallet.chainId = undefined;
    const markup = renderToStaticMarkup(<UserConsole />);

    expect(markup).toContain("Funds");
    expect(markup).toContain('data-top-up-account-id="0x1111111111111111111111111111111111111111"');
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

  it("keeps one open controller and Filecoin mainnet data mounted across a Squid network switch", () => {
    wallet.chainId = 314;
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<UserConsole />);
    });
    const openButton = renderer.root.findByProps({ "data-open-top-up": true });
    act(() => openButton.props.onClick());

    wallet.chainId = 8453;
    act(() => {
      renderer.update(<UserConsole />);
    });
    const sourceMarkup = JSON.stringify(renderer.toJSON());
    expect(topUpState.mounts).toBe(1);
    expect(topUpState.unmounts).toBe(0);
    expect(sourceMarkup).toContain("Funds");
    expect(sourceMarkup).toContain("Approvals");
    expect(sourceMarkup).not.toContain("Unsupported network");
    expect(accountState.requestedAddress).toBe(wallet.address);
    expect(accountState.requestedNetwork).toBe("mainnet");
    expect(sectionNetworks).toEqual({ approvals: "mainnet", funds: "mainnet" });

    act(() => topUpState.close?.());
    act(() => {
      renderer.update(<UserConsole />);
    });
    const closedMarkup = JSON.stringify(renderer.toJSON());
    expect(closedMarkup).toContain("Unsupported network");
    expect(closedMarkup).not.toContain("Funds");
  });

  it("does not let an active flag bypass an unrelated unsupported chain", () => {
    wallet.chainId = 12345;
    topUpState.isTopUpActive = true;

    const markup = renderToStaticMarkup(<UserConsole />);

    expect(markup).not.toContain("Funds");
    expect(markup).not.toContain("data-top-up-account-id");
    expect(accountState.requestedAddress).toBe("");
  });
});
