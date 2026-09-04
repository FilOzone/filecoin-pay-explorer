import { describe, expect, it, vi } from "vitest";
import { exitWalletSession, getWalletEntryState, getWalletExitAction } from "./state";

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
  it("labels Privy sessions as logout and connection-only wallets as disconnect", () => {
    expect(getWalletExitAction(true)).toBe("logout");
    expect(getWalletExitAction(false)).toBe("disconnect");
    expect(getWalletExitAction(false, "injected")).toBe("manual-disconnect");
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
    await exitWalletSession({ authenticated: false, logout, disconnect });
    expect(logout).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledOnce();
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
