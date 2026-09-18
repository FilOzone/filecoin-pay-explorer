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

  it("calls only the exit operation for the active session type", async () => {
    const logout = vi.fn(async () => undefined);
    const disconnect = vi.fn();
    const pauseSelection = vi.fn();

    await exitWalletSession({ authenticated: true, logout, disconnect, pauseSelection });
    expect(pauseSelection).toHaveBeenCalledOnce();
    expect(logout).toHaveBeenCalledOnce();
    expect(disconnect).not.toHaveBeenCalled();

    logout.mockClear();
    pauseSelection.mockClear();
    const disconnectConnection = vi.fn(async () => undefined);
    await exitWalletSession({ authenticated: false, logout, disconnect, disconnectConnection, pauseSelection });
    expect(logout).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(disconnectConnection).toHaveBeenCalledOnce();
    expect(pauseSelection).toHaveBeenCalledOnce();
    expect(pauseSelection.mock.invocationCallOrder[0]).toBeLessThan(disconnect.mock.invocationCallOrder[0]);
    expect(disconnect.mock.invocationCallOrder[0]).toBeLessThan(disconnectConnection.mock.invocationCallOrder[0]);
  });

  it("restores wallet selection when a connect-only wallet cannot be disconnected", async () => {
    const resumeSelection = vi.fn();

    await expect(
      exitWalletSession({
        authenticated: false,
        logout: async () => undefined,
        pauseSelection: vi.fn(),
        resumeSelection,
      }),
    ).rejects.toThrow("Connected wallet was not found");
    expect(resumeSelection).toHaveBeenCalledOnce();
  });

  it("restores wallet selection when logout fails", async () => {
    const error = new Error("logout failed");
    const resumeSelection = vi.fn();

    await expect(
      exitWalletSession({
        authenticated: true,
        logout: async () => {
          throw error;
        },
        pauseSelection: vi.fn(),
        resumeSelection,
      }),
    ).rejects.toThrow(error);
    expect(resumeSelection).toHaveBeenCalledOnce();
  });
});

describe("isUserCancelledFlow", () => {
  it("treats a closed Privy modal as a cancellation rather than a failure", () => {
    expect(isUserCancelledFlow("exited_auth_flow")).toBe(true);
    expect(isUserCancelledFlow("exited_link_flow")).toBe(true);
    expect(isUserCancelledFlow("invalid_credentials")).toBe(false);
  });
});
