import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomConnectButton from ".";

const mocks = vi.hoisted(() => ({
  connectWallet: vi.fn(),
  login: vi.fn(),
  logout: vi.fn<() => Promise<void>>(),
  pause: vi.fn(),
  privy: { authenticated: false, error: new Error("invalid app id") as Error | null, ready: false },
  resume: vi.fn(),
  walletsReady: false,
  loginOnError: undefined as ((code: string) => void) | undefined,
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
  useConnectWallet: () => ({ connectWallet: mocks.connectWallet }),
  useLogin: ({ onError }: { onError: (code: string) => void }) => {
    mocks.loginOnError = onError;
    return { login: mocks.login };
  },
  useLogout: () => ({ logout: mocks.logout }),
  usePrivy: () => mocks.privy,
  useWallets: () => ({ ready: mocks.walletsReady }),
}));
vi.mock("@/components/UserConsole/console-wallet", () => ({
  consoleWalletSelector: { pause: mocks.pause, resume: mocks.resume },
}));
vi.mock("wagmi", () => ({
  useConnection: () => ({ isConnected: false }),
  useDisconnect: () => ({ disconnectAsync: vi.fn(async () => undefined) }),
}));

describe("CustomConnectButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.logout.mockResolvedValue(undefined);
    mocks.privy = { authenticated: false, error: new Error("invalid app id"), ready: false };
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

  it("pauses wallet auto-selection before leaving an authenticated session that is still preparing", async () => {
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

    expect(mocks.pause).toHaveBeenCalledOnce();
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(mocks.pause.mock.invocationCallOrder[0]).toBeLessThan(mocks.logout.mock.invocationCallOrder[0]);
    expect(mocks.resume).not.toHaveBeenCalled();
  });

  it("resumes wallet auto-selection before opening either wallet flow", async () => {
    mocks.privy = { authenticated: false, error: null, ready: true };
    mocks.walletsReady = true;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<CustomConnectButton />);
    });

    const [loginButton, connectButton] = renderer.root.findAllByType("button");
    await act(async () => loginButton.props.onClick());
    await act(async () => connectButton.props.onClick());

    expect(mocks.resume).toHaveBeenCalledTimes(2);
    expect(mocks.resume.mock.invocationCallOrder[0]).toBeLessThan(mocks.login.mock.invocationCallOrder[0]);
    expect(mocks.resume.mock.invocationCallOrder[1]).toBeLessThan(mocks.connectWallet.mock.invocationCallOrder[0]);
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
