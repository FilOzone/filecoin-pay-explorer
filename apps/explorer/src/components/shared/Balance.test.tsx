import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FundingLaunchProvider, useFundingLaunch } from "@/components/UserConsole/FundingLaunchContext";
import Balance from "./Balance";

vi.mock("@filecoin-pay/ui/components/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button type='button'>{children}</button>,
}));
vi.mock("@filecoin-pay/ui/components/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button data-menu-item onClick={onClick} type='button'>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
const privy = vi.hoisted(() => ({
  authenticated: false,
  exportWallet: vi.fn(async () => undefined),
  wallets: [] as { address: string; connectorType: string; walletClientType: string; disconnect: () => void }[],
}));

vi.mock("@privy-io/react-auth", () => ({
  useExportWallet: () => ({ exportWallet: privy.exportWallet }),
  useLogout: () => ({ logout: vi.fn() }),
  usePrivy: () => ({ authenticated: privy.authenticated }),
  useWallets: () => ({ wallets: privy.wallets }),
}));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0x1111111111111111111111111111111111111111" }),
  useDisconnect: () => ({ disconnectAsync: vi.fn(async () => undefined) }),
  useBalance: () => ({ data: { value: 0n }, isLoading: false }),
  useReadContract: () => ({ data: 0n, isLoading: false }),
  useWalletClient: () => ({ data: undefined }),
}));
vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({ constants: { contracts: { usdfc: "0x2222222222222222222222222222222222222222" } } }),
}));
vi.mock("@/assests/FilecoinLogo", () => ({ default: () => null }));
vi.mock("@/assests/USDFCLogo", () => ({ default: () => null }));

function LaunchState() {
  const { isAddFundsOpen } = useFundingLaunch();
  return <output data-open={isAddFundsOpen} />;
}

const ADDRESS = "0x1111111111111111111111111111111111111111";

function render() {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <FundingLaunchProvider>
        <Balance />
        <LaunchState />
      </FundingLaunchProvider>,
    );
  });
  return renderer;
}

function menuItem(renderer: ReturnType<typeof create>, label: string) {
  return renderer.root
    .findAllByProps({ "data-menu-item": true })
    .find((item) => item.findAllByType("span").some((span) => span.children.includes(label)));
}

describe("Balance", () => {
  beforeEach(() => {
    privy.authenticated = false;
    privy.exportWallet.mockClear();
    privy.wallets = [];
  });

  it("offers the key export only for a Privy embedded wallet, and asks Privy for that wallet's key", async () => {
    privy.authenticated = true;
    privy.wallets = [{ address: ADDRESS, connectorType: "embedded", walletClientType: "privy", disconnect: vi.fn() }];
    const renderer = render();

    const exportItem = menuItem(renderer, "Export key");
    expect(exportItem).toBeDefined();
    await act(async () => exportItem?.props.onClick());
    expect(privy.exportWallet).toHaveBeenCalledWith({ address: ADDRESS });
    expect(menuItem(renderer, "Log out")).toBeDefined();
  });

  it("hides the key export for an external wallet", () => {
    privy.wallets = [
      { address: ADDRESS, connectorType: "injected", walletClientType: "metamask", disconnect: vi.fn() },
    ];
    const renderer = render();

    expect(menuItem(renderer, "Export key")).toBeUndefined();
    expect(menuItem(renderer, "Log out")).toBeDefined();
  });

  it("opens the shared funding host from the wallet menu", () => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <FundingLaunchProvider>
          <Balance />
          <LaunchState />
        </FundingLaunchProvider>,
      );
    });

    const addFunds = renderer.root
      .findAllByProps({ "data-menu-item": true })
      .find((item) => item.findAllByType("span").some((span) => span.children.includes("Add funds")));
    expect(addFunds).toBeDefined();
    act(() => addFunds?.props.onClick());
    expect(renderer.root.findByType("output").props["data-open"]).toBe(true);
  });
});
