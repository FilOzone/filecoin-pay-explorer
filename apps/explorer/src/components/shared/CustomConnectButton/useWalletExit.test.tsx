import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWalletExit } from "./useWalletExit";

const mocks = vi.hoisted(() => ({
  authenticated: false,
  disconnectConnection: vi.fn<() => Promise<void>>(),
  logout: vi.fn<() => Promise<void>>(),
}));

vi.mock("@privy-io/react-auth", () => ({
  useLogout: () => ({ logout: mocks.logout }),
  usePrivy: () => ({ authenticated: mocks.authenticated }),
}));
vi.mock("wagmi", () => ({ useDisconnect: () => ({ mutateAsync: mocks.disconnectConnection }) }));

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
    mocks.disconnectConnection.mockResolvedValue(undefined);
    mocks.logout.mockResolvedValue(undefined);
  });

  it("logs out an authenticated session and drops the wagmi connection", async () => {
    mocks.authenticated = true;
    const disconnect = vi.fn();
    const current = await renderHook({ connectorType: "embedded", disconnect });

    expect(current().action).toBe("logout");
    await act(() => current().exit());

    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(disconnect).not.toHaveBeenCalled();
    expect(mocks.disconnectConnection).toHaveBeenCalledOnce();
  });

  it("disconnects a connect-only wallet", async () => {
    const disconnect = vi.fn();
    const current = await renderHook({ connectorType: "wallet_connect_v2", disconnect });

    expect(current().action).toBe("disconnect");
    await act(() => current().exit());

    expect(disconnect).toHaveBeenCalledOnce();
    expect(mocks.disconnectConnection).toHaveBeenCalledOnce();
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it("logs an extension wallet out of the console and drops its wagmi connection", async () => {
    const disconnect = vi.fn();
    const current = await renderHook({ connectorType: "injected", disconnect });

    expect(current().action).toBe("logout");
    await act(() => current().exit());

    expect(disconnect).toHaveBeenCalledOnce();
    expect(mocks.disconnectConnection).toHaveBeenCalledOnce();
  });

  it("propagates a failure to drop the wagmi connection", async () => {
    mocks.disconnectConnection.mockRejectedValue(new Error("disconnect failed"));
    const current = await renderHook({ connectorType: "injected", disconnect: vi.fn() });

    await expect(act(() => current().exit())).rejects.toThrow("disconnect failed");
  });

  it("never touches the wagmi connection when the Privy-level exit fails", async () => {
    mocks.authenticated = true;
    mocks.logout.mockRejectedValue(new Error("logout failed"));
    const current = await renderHook();

    await expect(act(() => current().exit())).rejects.toThrow("logout failed");
    expect(mocks.disconnectConnection).not.toHaveBeenCalled();
  });
});
