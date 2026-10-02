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
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} type='button' onClick={onClick}>
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

    expect(renderer.root.findByType("h2").children).toEqual(["Your wallet is using a different account"]);
    expect(mocks.selectAccount).not.toHaveBeenCalled();

    await clickButton(renderer, "Use 0x2222...2222");
    expect(mocks.selectAccount).toHaveBeenCalledWith(SWITCHED_TO);
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it("ends the previous account's Privy login before using the new account", async () => {
    mocks.authenticated = true;
    mocks.wallets = [SWITCHED_TO];
    const renderer = await render();

    await clickButton(renderer, "Use 0x2222...2222");

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

    await clickButton(renderer, "Use 0x2222...2222");

    // Selecting the new account here would let it buy by card on the previous account's login.
    expect(mocks.selectAccount).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Unable to log out", { description: "logout failed" });
  });

  it("does not select a replacement the extension switched away from during logout", async () => {
    mocks.authenticated = true;
    let finishLogout!: () => void;
    mocks.logout.mockReturnValue(new Promise<void>((resolve) => (finishLogout = resolve)));
    mocks.wallets = [SWITCHED_TO];
    const renderer = await render();

    await clickButton(renderer, "Use 0x2222...2222");
    const third = { ...SWITCHED_TO, address: "0x4444444444444444444444444444444444444444" };
    mocks.wallets = [third];
    await act(async () => {
      renderer.update(<AccountUnavailable />);
    });
    await act(async () => finishLogout());

    expect(mocks.selectAccount).not.toHaveBeenCalled();
    // The prompt for the new replacement starts fresh, not stuck on "Switching account…".
    const useThird = renderer.root
      .findAllByType("button")
      .find((candidate) => candidate.children.join("").includes("Use 0x4444...4444"));
    expect(useThird?.props.disabled).toBeFalsy();
  });

  it("logs out from the switched wallet and forgets the account", async () => {
    mocks.wallets = [SWITCHED_TO];
    const renderer = await render();

    // Same label as the header menu for this session: an extension wallet logs out.
    await clickButton(renderer, "Log out");

    expect(SWITCHED_TO.disconnect).toHaveBeenCalledOnce();
    expect(mocks.clearAccount).toHaveBeenCalledOnce();
  });

  it("asks to unlock or reconnect when the extension exposes no account", async () => {
    mocks.wallets = [{ address: "0x3333333333333333333333333333333333333333", walletClientType: "privy" }];
    const renderer = await render();

    expect(renderer.root.findByType("h2").children).toEqual(["Reconnect your wallet"]);
    await clickButton(renderer, "Reconnect wallet");
    expect(mocks.connectWallet).toHaveBeenCalledOnce();

    await clickButton(renderer, "Disconnect");
    expect(mocks.clearAccount).toHaveBeenCalledOnce();
  });
});
