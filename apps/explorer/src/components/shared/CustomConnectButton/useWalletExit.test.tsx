import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWalletExit } from "./useWalletExit";

const mocks = vi.hoisted(() => ({
  authenticated: false,
  logout: vi.fn<() => Promise<void>>(),
  pause: vi.fn(),
  resume: vi.fn(),
}));

vi.mock("@privy-io/react-auth", () => ({
  useLogout: () => ({ logout: mocks.logout }),
  usePrivy: () => ({ authenticated: mocks.authenticated }),
}));
vi.mock("@/components/UserConsole/console-wallet", () => ({
  consoleWalletSelector: { pause: mocks.pause, resume: mocks.resume },
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

  it("logs out an authenticated session after pausing wallet selection", async () => {
    mocks.authenticated = true;
    const disconnect = vi.fn();
    const current = await renderHook({ connectorType: "embedded", disconnect });

    expect(current().action).toBe("logout");
    await act(() => current().exit());

    expect(mocks.pause).toHaveBeenCalledOnce();
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(disconnect).not.toHaveBeenCalled();
    expect(mocks.resume).not.toHaveBeenCalled();
  });

  it("disconnects a connect-only wallet and keeps it unselected", async () => {
    const disconnect = vi.fn();
    const current = await renderHook({ connectorType: "wallet_connect_v2", disconnect });

    expect(current().action).toBe("disconnect");
    await act(() => current().exit());

    expect(mocks.pause).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it("pauses selection for an injected wallet so a reload does not reconnect it", async () => {
    const disconnect = vi.fn();
    const current = await renderHook({ connectorType: "injected", disconnect });

    expect(current().action).toBe("manual-disconnect");
    await act(() => current().exit());

    expect(mocks.pause).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("resumes selection when the exit fails", async () => {
    mocks.authenticated = true;
    mocks.logout.mockRejectedValue(new Error("logout failed"));
    const current = await renderHook();

    await expect(act(() => current().exit())).rejects.toThrow("logout failed");
    expect(mocks.resume).toHaveBeenCalledOnce();
  });
});
