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
  wallets: [] as { address: string; walletClientType?: string }[],
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
vi.mock("wagmi", () => ({
  useConnection: () => ({ address: mocks.address, isConnected: !!mocks.address }),
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
