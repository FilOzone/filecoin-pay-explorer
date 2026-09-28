import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomConnectButton from ".";

type LoginAccount = { type: string; address?: string; walletClientType?: string };
type LoginOnComplete = (params: {
  user: { linkedAccounts: LoginAccount[] };
  loginAccount: LoginAccount | null;
}) => void;

const mocks = vi.hoisted(() => ({
  address: undefined as string | undefined,
  confirmActive: vi.fn(),
  connectors: [] as unknown[],
  connectWallet: vi.fn(),
  isExiting: false,
  login: vi.fn(),
  logout: vi.fn<() => Promise<void>>(),
  privy: { authenticated: false, error: new Error("invalid app id") as Error | null, ready: false },
  setActiveWallet: vi.fn(async () => undefined),
  wallets: [] as { address: string }[],
  walletsReady: false,
  loginOnComplete: undefined as LoginOnComplete | undefined,
  loginOnError: undefined as ((code: string) => void) | undefined,
  connectWalletOnSuccess: undefined as ((params: { wallet: { address: string } }) => void) | undefined,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type='button' onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock("@privy-io/react-auth", () => ({
  useConnectWallet: ({ onSuccess }: { onSuccess: (params: { wallet: { address: string } }) => void }) => {
    mocks.connectWalletOnSuccess = onSuccess;
    return { connectWallet: mocks.connectWallet };
  },
  useLogin: ({ onComplete, onError }: { onComplete: LoginOnComplete; onError: (code: string) => void }) => {
    mocks.loginOnComplete = onComplete;
    mocks.loginOnError = onError;
    return { login: mocks.login };
  },
  useLogout: () => ({ logout: mocks.logout }),
  usePrivy: () => mocks.privy,
  useWallets: () => ({ ready: mocks.walletsReady, wallets: mocks.wallets }),
}));
vi.mock("@privy-io/wagmi", () => ({
  useSetActiveWallet: () => ({ setActiveWallet: mocks.setActiveWallet }),
}));
vi.mock("@/components/UserConsole/ActiveWalletGuardContext", () => ({
  useActiveWalletGuard: () => ({ confirmActive: mocks.confirmActive, isExiting: mocks.isExiting }),
}));
vi.mock("wagmi", () => ({
  useConnection: () => ({ address: mocks.address, isConnected: false }),
  useConnectors: () => mocks.connectors,
  useDisconnect: () => ({ mutateAsync: vi.fn(async () => undefined) }),
}));

describe("CustomConnectButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.address = undefined;
    mocks.connectors = [];
    mocks.isExiting = false;
    mocks.logout.mockResolvedValue(undefined);
    mocks.privy = { authenticated: false, error: new Error("invalid app id"), ready: false };
    mocks.wallets = [];
    mocks.walletsReady = false;
  });

  it("shows an actionable Privy initialization error instead of loading forever", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const markup = renderToStaticMarkup(<CustomConnectButton />);

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Wallet login is temporarily unavailable");
    expect(markup).not.toContain("Privy configuration");
    expect(markup).not.toContain("Loading wallet");
    expect(consoleError).toHaveBeenCalledWith("Privy failed to initialize", mocks.privy.error);
  });

  it("logs out an authenticated session that is still preparing", async () => {
    mocks.privy = { authenticated: true, error: null, ready: true };
    mocks.walletsReady = true;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<CustomConnectButton />);
    });

    const buttons = renderer.root.findAllByType("button");
    expect(buttons.some((button) => button.children.includes("Reload"))).toBe(true);
    // The card around the button already says the wallet is preparing.
    expect(renderer.root.findAllByProps({ role: "status" })).toHaveLength(0);
    const logoutButton = buttons.find((button) => button.children.includes("Log out"));
    expect(logoutButton).toBeDefined();
    await act(async () => {
      logoutButton?.props.onClick();
    });

    expect(mocks.logout).toHaveBeenCalledOnce();
  });

  it("shows the loading state, not preparing, while a forced exit is settling", async () => {
    mocks.privy = { authenticated: true, error: null, ready: true };
    mocks.walletsReady = true;
    mocks.isExiting = true;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<CustomConnectButton />);
    });

    expect(renderer.root.findAllByProps({ role: "status" })).toHaveLength(1);
    expect(renderer.root.findAllByType("button")).toHaveLength(0);
  });

  it("opens the login and connect-only flows directly", async () => {
    mocks.privy = { authenticated: false, error: null, ready: true };
    mocks.walletsReady = true;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<CustomConnectButton />);
    });

    const [loginButton, connectButton] = renderer.root.findAllByType("button");
    await act(async () => loginButton.props.onClick());
    await act(async () => connectButton.props.onClick());

    expect(mocks.login).toHaveBeenCalledOnce();
    expect(mocks.connectWallet).toHaveBeenCalledOnce();
  });

  it("activates the wallet a wallet-based login just used, instead of Privy's own sticky selection", async () => {
    mocks.privy = { authenticated: false, error: null, ready: true };
    mocks.walletsReady = true;
    mocks.wallets = [{ address: "0xAAAA000000000000000000000000000000AAAA" }];
    await act(async () => {
      create(<CustomConnectButton />);
    });

    await act(async () => {
      mocks.loginOnComplete?.({
        user: { linkedAccounts: [] },
        loginAccount: { type: "wallet", address: "0xaaaa000000000000000000000000000000aaaa" },
      });
    });

    expect(mocks.confirmActive).toHaveBeenCalledWith("0xaaaa000000000000000000000000000000aaaa");
    expect(mocks.setActiveWallet).toHaveBeenCalledWith({ address: "0xAAAA000000000000000000000000000000AAAA" });
  });

  it("activates the embedded wallet Privy attached to an email or social login", async () => {
    mocks.privy = { authenticated: false, error: null, ready: true };
    mocks.walletsReady = true;
    mocks.wallets = [{ address: "0xCCCC000000000000000000000000000000CCCC" }];
    await act(async () => {
      create(<CustomConnectButton />);
    });

    await act(async () => {
      mocks.loginOnComplete?.({
        user: {
          linkedAccounts: [
            { type: "email" },
            { type: "wallet", walletClientType: "privy", address: "0xcccc000000000000000000000000000000cccc" },
          ],
        },
        loginAccount: { type: "email" },
      });
    });

    expect(mocks.confirmActive).toHaveBeenCalledWith("0xcccc000000000000000000000000000000cccc");
    expect(mocks.setActiveWallet).toHaveBeenCalledWith({ address: "0xCCCC000000000000000000000000000000CCCC" });
  });

  it("does not try to activate a wallet for a login with no linked wallet yet", async () => {
    mocks.privy = { authenticated: false, error: null, ready: true };
    mocks.walletsReady = true;
    await act(async () => {
      create(<CustomConnectButton />);
    });

    await act(async () => {
      mocks.loginOnComplete?.({ user: { linkedAccounts: [{ type: "email" }] }, loginAccount: { type: "email" } });
    });

    expect(mocks.confirmActive).not.toHaveBeenCalled();
    expect(mocks.setActiveWallet).not.toHaveBeenCalled();
  });

  it("activates the wallet a connect-only flow just connected", async () => {
    mocks.privy = { authenticated: false, error: null, ready: true };
    mocks.walletsReady = true;
    mocks.wallets = [{ address: "0xBBBB000000000000000000000000000000BBBB" }];
    await act(async () => {
      create(<CustomConnectButton />);
    });

    await act(async () => {
      mocks.connectWalletOnSuccess?.({ wallet: { address: "0xbbbb000000000000000000000000000000bbbb" } });
    });

    expect(mocks.confirmActive).toHaveBeenCalledWith("0xbbbb000000000000000000000000000000bbbb");
    expect(mocks.setActiveWallet).toHaveBeenCalledWith({ address: "0xBBBB000000000000000000000000000000BBBB" });
  });

  it("keeps retrying activation until Privy reports the wallet, instead of losing the race", async () => {
    mocks.privy = { authenticated: false, error: null, ready: true };
    mocks.walletsReady = true;
    mocks.wallets = [];
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<CustomConnectButton />);
    });

    await act(async () => {
      mocks.loginOnComplete?.({
        user: {
          linkedAccounts: [
            { type: "wallet", walletClientType: "privy", address: "0xdddd000000000000000000000000000000dddd" },
          ],
        },
        loginAccount: { type: "email" },
      });
    });
    expect(mocks.setActiveWallet).not.toHaveBeenCalled();
    expect(mocks.confirmActive).toHaveBeenCalledWith("0xdddd000000000000000000000000000000dddd");

    mocks.wallets = [{ address: "0xDDDD000000000000000000000000000000DDDD" }];
    await act(async () => {
      renderer.update(<CustomConnectButton />);
    });

    expect(mocks.setActiveWallet).toHaveBeenCalledWith({ address: "0xDDDD000000000000000000000000000000DDDD" });
  });

  it("retries setActiveWallet as wagmi connectors register, since it can silently no-op before its connector exists", async () => {
    mocks.privy = { authenticated: false, error: null, ready: true };
    mocks.walletsReady = true;
    mocks.wallets = [{ address: "0xEEEE000000000000000000000000000000EEEE" }];
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<CustomConnectButton />);
    });

    await act(async () => {
      mocks.loginOnComplete?.({
        user: { linkedAccounts: [] },
        loginAccount: { type: "wallet", address: "0xeeee000000000000000000000000000000eeee" },
      });
    });
    expect(mocks.setActiveWallet).toHaveBeenCalledTimes(1);

    mocks.connectors = [{}];
    await act(async () => {
      renderer.update(<CustomConnectButton />);
    });
    expect(mocks.setActiveWallet).toHaveBeenCalledTimes(2);

    mocks.address = "0xEEEE000000000000000000000000000000EEEE";
    await act(async () => {
      renderer.update(<CustomConnectButton />);
    });
    mocks.connectors = [{}, {}];
    await act(async () => {
      renderer.update(<CustomConnectButton />);
    });
    expect(mocks.setActiveWallet).toHaveBeenCalledTimes(2);
  });

  it("confirms the wallet synchronously, before any deferred activation, so a concurrent Privy reconnect cannot be mistaken for unconfirmed drift", async () => {
    mocks.privy = { authenticated: false, error: null, ready: true };
    mocks.walletsReady = true;
    mocks.wallets = [{ address: "0xFFFF000000000000000000000000000000FFFF" }];
    await act(async () => {
      create(<CustomConnectButton />);
    });

    mocks.loginOnComplete?.({
      user: { linkedAccounts: [] },
      loginAccount: { type: "wallet", address: "0xffff000000000000000000000000000000ffff" },
    });

    expect(mocks.confirmActive).toHaveBeenCalledWith("0xffff000000000000000000000000000000ffff");
  });
});

describe("CustomConnectButton login errors", () => {
  it("ignores a closed login modal but reports real login failures", () => {
    mocks.privy = { authenticated: false, error: null, ready: true };
    mocks.walletsReady = true;
    renderToStaticMarkup(<CustomConnectButton />);

    mocks.loginOnError?.("exited_auth_flow");
    expect(toast.error).not.toHaveBeenCalled();

    mocks.loginOnError?.("invalid_credentials");
    expect(toast.error).toHaveBeenCalledWith("Unable to log in", { description: "invalid_credentials" });
  });
});
