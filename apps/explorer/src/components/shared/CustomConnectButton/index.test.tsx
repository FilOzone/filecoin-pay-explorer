import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import CustomConnectButton from ".";

vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button type='button'>{children}</button>,
}));
vi.mock("@privy-io/react-auth", () => ({
  useConnectWallet: () => ({ connectWallet: vi.fn() }),
  useLogin: () => ({ login: vi.fn() }),
  useLogout: () => ({ logout: vi.fn() }),
  usePrivy: () => ({ authenticated: false, error: new Error("invalid app id"), ready: false }),
  useWallets: () => ({ ready: false }),
}));
vi.mock("wagmi", () => ({ useConnection: () => ({ isConnected: false }) }));

describe("CustomConnectButton", () => {
  it("shows an actionable Privy initialization error instead of loading forever", () => {
    const markup = renderToStaticMarkup(<CustomConnectButton />);

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Wallet login could not start");
    expect(markup).not.toContain("Loading wallet");
  });
});
