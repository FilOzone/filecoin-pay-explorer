import { act, create } from "react-test-renderer";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountUnavailable from "./AccountUnavailable";

const ACCOUNT = { address: "0x1111111111111111111111111111111111111111", walletClientType: "metamask" };
const SWITCHED_TO = {
  address: "0x2222222222222222222222222222222222222222",
  walletClientType: "metamask",
  connectorType: "injected",
  disconnect: vi.fn(),
};

const mocks = vi.hoisted(() => ({
  authenticated: false,
  clearAccount: vi.fn(),
  connectWallet: vi.fn(),
  logout: vi.fn<() => Promise<void>>(),
  selectAccount: vi.fn(),
  wallets: [] as object[],
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
  useConnectWallet: () => ({ connectWallet: mocks.connectWallet }),
  useLogout: () => ({ logout: mocks.logout }),
  usePrivy: () => ({ authenticated: mocks.authenticated }),
  useWallets: () => ({ wallets: mocks.wallets }),
}));
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
  mocks.wallets = [];
});

describe("AccountUnavailable", () => {
  it("offers the extension's new account without switching to it", async () => {
    mocks.wallets = [SWITCHED_TO];
    const renderer = await render();

    expect(renderer.root.findByType("h2").children).toEqual(["Your wallet switched accounts"]);
    expect(mocks.selectAccount).not.toHaveBeenCalled();

    await clickButton(renderer, "Continue as 0x2222...2222");
    expect(mocks.selectAccount).toHaveBeenCalledWith(SWITCHED_TO);
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it("ends the previous account's Privy login after continuing as the new account", async () => {
    mocks.authenticated = true;
    mocks.wallets = [SWITCHED_TO];
    const renderer = await render();

    await clickButton(renderer, "Continue as");

    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(mocks.selectAccount).toHaveBeenCalledWith(SWITCHED_TO);
    expect(mocks.logout.mock.invocationCallOrder[0]).toBeLessThan(mocks.selectAccount.mock.invocationCallOrder[0]);
    expect(mocks.clearAccount).not.toHaveBeenCalled();
  });

  it("keeps the previous account when its Privy login fails to end", async () => {
    mocks.authenticated = true;
    mocks.logout.mockRejectedValue(new Error("logout failed"));
    mocks.wallets = [SWITCHED_TO];
    const renderer = await render();

    await clickButton(renderer, "Continue as");

    // Selecting the new account here would let it buy by card on the previous account's login.
    expect(mocks.selectAccount).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Unable to log out", { description: "logout failed" });
  });

  it("logs out from the switched wallet and forgets the account", async () => {
    mocks.wallets = [SWITCHED_TO];
    const renderer = await render();

    await clickButton(renderer, "Log out");

    expect(SWITCHED_TO.disconnect).toHaveBeenCalledOnce();
    expect(mocks.clearAccount).toHaveBeenCalledOnce();
  });

  it("asks to unlock or reconnect when the extension exposes no account", async () => {
    mocks.wallets = [{ address: "0x3333333333333333333333333333333333333333", walletClientType: "privy" }];
    const renderer = await render();

    expect(renderer.root.findByType("h2").children).toEqual(["Your wallet is locked or disconnected"]);
    await clickButton(renderer, "Reconnect");
    expect(mocks.connectWallet).toHaveBeenCalledOnce();

    await clickButton(renderer, "Log out");
    expect(mocks.clearAccount).toHaveBeenCalledOnce();
  });
});
