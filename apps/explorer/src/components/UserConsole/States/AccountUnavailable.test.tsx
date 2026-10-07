import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountUnavailable from "./AccountUnavailable";

const ACCOUNT = { address: "0x1111111111111111111111111111111111111111", walletClientType: "metamask" };

const mocks = vi.hoisted(() => ({
  authenticated: false,
  clearAccount: vi.fn(),
  connectWallet: vi.fn(),
  connectWalletOnSuccess: undefined as
    | ((params: { wallet: { address: string; walletClientType: string } }) => void)
    | undefined,
  logout: vi.fn<() => Promise<void>>(),
  selectAccount: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type='button' onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock("@filecoin-foundation/ui-filecoin/EmptyStateCard", () => ({
  EmptyStateCard: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));
vi.mock("@privy-io/react-auth", () => ({
  useConnectWallet: ({
    onSuccess,
  }: {
    onSuccess: (params: { wallet: { address: string; walletClientType: string } }) => void;
  }) => {
    mocks.connectWalletOnSuccess = onSuccess;
    return { connectWallet: mocks.connectWallet };
  },
  useLogout: () => ({ logout: mocks.logout }),
  usePrivy: () => ({ authenticated: mocks.authenticated }),
}));
vi.mock("wagmi", () => ({ useDisconnect: () => ({ mutateAsync: vi.fn(async () => undefined) }) }));
vi.mock("@/components/UserConsole/providers/ConsoleAccountContext", () => ({
  useConsoleAccount: () => ({
    account: ACCOUNT,
    clearAccount: mocks.clearAccount,
    selectAccount: mocks.selectAccount,
  }),
}));

const render = async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<AccountUnavailable />);
  });
  return renderer;
};

const clickButton = async (renderer: ReturnType<typeof create>, label: string) => {
  const button = renderer.root.findAllByType("button").find((candidate) => candidate.children.join("").includes(label));
  expect(button).toBeDefined();
  await act(async () => button?.props.onClick());
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticated = false;
  mocks.logout.mockResolvedValue(undefined);
});

describe("AccountUnavailable", () => {
  it("asks to unlock or reconnect when the extension exposes no account", async () => {
    const renderer = await render();

    expect(renderer.root.findByType("h2").children).toEqual(["Reconnect your wallet"]);
    await clickButton(renderer, "Connect a wallet");
    expect(mocks.connectWallet).toHaveBeenCalledOnce();

    await clickButton(renderer, "Disconnect");
    expect(mocks.clearAccount).toHaveBeenCalledOnce();
  });

  it("makes a different wallet picked here the console account", async () => {
    await render();

    const wallet = { address: "0x2222222222222222222222222222222222222222", walletClientType: "brave_wallet" };
    await act(async () => mocks.connectWalletOnSuccess?.({ wallet }));

    expect(mocks.selectAccount).toHaveBeenCalledWith(wallet);
  });
});
