import { describe, expect, it, vi } from "vitest";
import { exitWalletSession, getWalletEntryState, getWalletExitAction, isUserCancelledFlow } from "./state";

describe("getWalletEntryState", () => {
  it("waits for Privy before presenting login actions", () => {
    expect(getWalletEntryState({ ready: false, walletsReady: false, authenticated: false, isConnected: false })).toBe(
      "loading",
    );
    expect(getWalletEntryState({ ready: true, walletsReady: false, authenticated: false, isConnected: false })).toBe(
      "loading",
    );
    expect(getWalletEntryState({ ready: true, walletsReady: true, authenticated: false, isConnected: false })).toBe(
      "login",
    );
  });

  it("waits for an authenticated user's embedded wallet to reach wagmi", () => {
    expect(getWalletEntryState({ ready: true, walletsReady: true, authenticated: true, isConnected: false })).toBe(
      "preparing",
    );
    expect(getWalletEntryState({ ready: true, walletsReady: true, authenticated: true, isConnected: true })).toBe(
      "connected",
    );
  });

  it("accepts a connected-only external wallet without a Privy account", () => {
    expect(getWalletEntryState({ ready: true, walletsReady: true, authenticated: false, isConnected: true })).toBe(
      "connected",
    );
  });
});

describe("getWalletExitAction", () => {
  it("labels Privy sessions and extension wallets as logout, remote connect-only wallets as disconnect", () => {
    expect(getWalletExitAction(true)).toBe("logout");
    expect(getWalletExitAction(true, "injected")).toBe("logout");
    expect(getWalletExitAction(false, "injected")).toBe("logout");
    expect(getWalletExitAction(false)).toBe("disconnect");
    expect(getWalletExitAction(false, "wallet_connect_v2")).toBe("disconnect");
  });

  it("calls only the exit operation for the active session type, then always drops the wagmi connection", async () => {
    const logout = vi.fn(async () => undefined);
    const disconnect = vi.fn();
    const disconnectConnection = vi.fn(async () => undefined);

    await exitWalletSession({ authenticated: true, logout, disconnect, disconnectConnection });
    expect(logout).toHaveBeenCalledOnce();
    expect(disconnect).not.toHaveBeenCalled();
    expect(disconnectConnection).toHaveBeenCalledOnce();

    logout.mockClear();
    disconnectConnection.mockClear();
    await exitWalletSession({ authenticated: false, logout, disconnect, disconnectConnection });
    expect(logout).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(disconnectConnection).toHaveBeenCalledOnce();
    expect(disconnect.mock.invocationCallOrder[0]).toBeLessThan(disconnectConnection.mock.invocationCallOrder[0]);
  });

  it("does not drop the wagmi connection when a connect-only wallet has no disconnect callback", async () => {
    const disconnectConnection = vi.fn(async () => undefined);

    await expect(
      exitWalletSession({ authenticated: false, logout: async () => undefined, disconnectConnection }),
    ).rejects.toThrow("Connected wallet was not found");
    expect(disconnectConnection).not.toHaveBeenCalled();
  });

  it("does not drop the wagmi connection when logout fails", async () => {
    const error = new Error("logout failed");
    const disconnectConnection = vi.fn(async () => undefined);

    await expect(
      exitWalletSession({
        authenticated: true,
        logout: async () => {
          throw error;
        },
        disconnectConnection,
      }),
    ).rejects.toThrow(error);
    expect(disconnectConnection).not.toHaveBeenCalled();
  });
});

describe("isUserCancelledFlow", () => {
  it("treats a closed Privy modal as a cancellation rather than a failure", () => {
    expect(isUserCancelledFlow("exited_auth_flow")).toBe(true);
    expect(isUserCancelledFlow("exited_link_flow")).toBe(true);
    expect(isUserCancelledFlow("invalid_credentials")).toBe(false);
  });
});
