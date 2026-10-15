import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWalletExit } from "./useWalletExit";

const mocks = vi.hoisted(() => ({
  authenticated: false,
  clearAccount: vi.fn(),
  disconnectConnection: vi.fn(async () => undefined),
  logout: vi.fn<() => Promise<void>>(),
}));

vi.mock("@privy-io/react-auth", () => ({
  useLogout: () => ({ logout: mocks.logout }),
  usePrivy: () => ({ authenticated: mocks.authenticated }),
}));
vi.mock("wagmi", () => ({ useDisconnect: () => ({ mutateAsync: mocks.disconnectConnection }) }));
vi.mock("@/components/UserConsole/providers/ConsoleAccountContext", () => ({
  useConsoleAccount: () => ({ clearAccount: mocks.clearAccount }),
}));

const renderHook = async (wallet?: Parameters<typeof useWalletExit>[0]) => {
  let result!: ReturnType<typeof useWalletExit>;
  const Probe = () => {
    result = useWalletExit(wallet);
    return null;
  };
  await act(async () => {
    create(<Probe />);
  });
  return () => result;
};

describe("useWalletExit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticated = false;
    mocks.logout.mockResolvedValue(undefined);
  });

  it("logs out an authenticated session and clears the console account", async () => {
    mocks.authenticated = true;
    const disconnect = vi.fn();
    const current = await renderHook({ connectorType: "embedded", disconnect });

    expect(current().action).toBe("logout");
    await act(() => current().exit());

    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(disconnect).not.toHaveBeenCalled();
    expect(mocks.clearAccount).toHaveBeenCalledOnce();
  });

  it("disconnects a connect-only wallet", async () => {
    const disconnect = vi.fn();
    const current = await renderHook({ connectorType: "wallet_connect_v2", disconnect });

    expect(current().action).toBe("disconnect");
    await act(() => current().exit());

    expect(disconnect).toHaveBeenCalledOnce();
    expect(mocks.clearAccount).toHaveBeenCalledOnce();
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it("logs an extension wallet out of the console", async () => {
    const disconnect = vi.fn();
    const current = await renderHook({ connectorType: "injected", disconnect });

    expect(current().action).toBe("logout");
    await act(() => current().exit());

    expect(disconnect).toHaveBeenCalledOnce();
    // wagmi's disconnect asks the extension to revoke the site's access.
    expect(mocks.disconnectConnection).toHaveBeenCalledOnce();
    expect(mocks.clearAccount).toHaveBeenCalledOnce();
  });

  it("keeps the console account when the Privy logout fails", async () => {
    mocks.authenticated = true;
    mocks.logout.mockRejectedValue(new Error("logout failed"));
    const current = await renderHook();

    await expect(act(() => current().exit())).rejects.toThrow("logout failed");
    expect(mocks.clearAccount).not.toHaveBeenCalled();
  });
});
