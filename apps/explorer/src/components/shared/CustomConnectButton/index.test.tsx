import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomConnectButton from ".";

const mocks = vi.hoisted(() => ({
  logout: vi.fn<() => Promise<void>>(),
  pause: vi.fn(),
  privy: { authenticated: false, error: new Error("invalid app id") as Error | null, ready: false },
  resume: vi.fn(),
  walletsReady: false,
}));

vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button type='button'>{children}</button>,
}));
vi.mock("@privy-io/react-auth", () => ({
  useConnectWallet: () => ({ connectWallet: vi.fn() }),
  useLogin: () => ({ login: vi.fn() }),
  useLogout: () => ({ logout: mocks.logout }),
  usePrivy: () => mocks.privy,
  useWallets: () => ({ ready: mocks.walletsReady }),
}));
vi.mock("@/components/UserConsole/console-wallet", () => ({
  consoleWalletSelector: { pause: mocks.pause, resume: mocks.resume },
}));
vi.mock("wagmi", () => ({ useConnection: () => ({ isConnected: false }) }));

describe("CustomConnectButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.logout.mockResolvedValue(undefined);
    mocks.privy = { authenticated: false, error: new Error("invalid app id"), ready: false };
    mocks.walletsReady = false;
  });

  it("shows an actionable Privy initialization error instead of loading forever", () => {
    const markup = renderToStaticMarkup(<CustomConnectButton />);

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Wallet login could not start");
    expect(markup).not.toContain("Loading wallet");
  });

  it("pauses wallet auto-selection before leaving an authenticated session that is still preparing", async () => {
    mocks.privy = { authenticated: true, error: null, ready: true };
    mocks.walletsReady = true;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<CustomConnectButton />);
    });

    await act(async () => {
      renderer.root.findByType("button").props.onClick();
    });

    expect(mocks.pause).toHaveBeenCalledOnce();
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(mocks.pause.mock.invocationCallOrder[0]).toBeLessThan(mocks.logout.mock.invocationCallOrder[0]);
    expect(mocks.resume).not.toHaveBeenCalled();
  });
});
