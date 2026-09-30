import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomConnectButton from ".";

type ConnectedWalletStub = { address: string; walletClientType: string };

const mocks = vi.hoisted(() => ({
  clearAccount: vi.fn(),
  connectWallet: vi.fn(),
  login: vi.fn(),
  logout: vi.fn<() => Promise<void>>(),
  privy: { authenticated: false, error: new Error("invalid app id") as Error | null, ready: false },
  selectAccount: vi.fn(),
  walletsReady: false,
  loginOnError: undefined as ((code: string) => void) | undefined,
  connectWalletOnSuccess: undefined as ((params: { wallet: ConnectedWalletStub }) => void) | undefined,
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
  useConnectWallet: ({ onSuccess }: { onSuccess: (params: { wallet: ConnectedWalletStub }) => void }) => {
    mocks.connectWalletOnSuccess = onSuccess;
    return { connectWallet: mocks.connectWallet };
  },
  useLogin: ({ onError }: { onError: (code: string) => void }) => {
    mocks.loginOnError = onError;
    return { login: mocks.login };
  },
  useLogout: () => ({ logout: mocks.logout }),
  usePrivy: () => mocks.privy,
  useWallets: () => ({ ready: mocks.walletsReady, wallets: [] }),
}));
vi.mock("@/components/UserConsole/ConsoleAccountContext", () => ({
  useConsoleAccount: () => ({ clearAccount: mocks.clearAccount, selectAccount: mocks.selectAccount }),
}));

const render = async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<CustomConnectButton />);
  });
  return renderer;
};

const findButton = (renderer: ReturnType<typeof create>, label: string) =>
  renderer.root.findAllByType("button").find((button) => button.children.includes(label));

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

  it("logs out a signed-in session whose wallet is still preparing", async () => {
    mocks.privy = { authenticated: true, error: null, ready: true };
    mocks.walletsReady = true;
    const renderer = await render();

    expect(findButton(renderer, "Reload")).toBeDefined();
    // The card around the button already says the wallet is preparing.
    expect(renderer.root.findAllByProps({ role: "status" })).toHaveLength(0);
    await act(async () => findButton(renderer, "Log out")?.props.onClick());

    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(mocks.clearAccount).toHaveBeenCalledOnce();
  });

  it("offers email or Google sign-in, and a wallet connection without sign-up", async () => {
    mocks.privy = { authenticated: false, error: null, ready: true };
    mocks.walletsReady = true;
    const renderer = await render();

    await act(async () => findButton(renderer, "Continue with email or Google")?.props.onClick());
    await act(async () => findButton(renderer, "Connect a wallet")?.props.onClick());

    // A wallet enters through "Connect a wallet" only, so there is one way in per kind of account.
    expect(mocks.login).toHaveBeenCalledWith({ loginMethods: ["email", "google"] });
    expect(mocks.connectWallet).toHaveBeenCalledOnce();
  });

  it("makes the wallet a connect-only flow just connected the console account", async () => {
    mocks.privy = { authenticated: false, error: null, ready: true };
    mocks.walletsReady = true;
    await render();

    const wallet = { address: "0xbbbb000000000000000000000000000000bbbb", walletClientType: "metamask" };
    await act(async () => mocks.connectWalletOnSuccess?.({ wallet }));

    expect(mocks.selectAccount).toHaveBeenCalledWith(wallet);
  });

  it("ignores a closed login modal but reports real login failures", async () => {
    mocks.privy = { authenticated: false, error: null, ready: true };
    mocks.walletsReady = true;
    await render();

    mocks.loginOnError?.("exited_auth_flow");
    expect(toast.error).not.toHaveBeenCalled();

    mocks.loginOnError?.("invalid_credentials");
    expect(toast.error).toHaveBeenCalledWith("Unable to log in", { description: "invalid_credentials" });
  });
});
