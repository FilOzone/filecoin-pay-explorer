import { describe, expect, it, vi } from "vitest";
import { exitWalletSession, getWalletEntryState, getWalletExitAction, isUserCancelledFlow } from "./state";

describe("getWalletEntryState", () => {
  it("waits for Privy before presenting login actions", () => {
    expect(getWalletEntryState({ ready: false, walletsReady: false, authenticated: false })).toBe("loading");
    expect(getWalletEntryState({ ready: true, walletsReady: false, authenticated: false })).toBe("loading");
    expect(getWalletEntryState({ ready: true, walletsReady: true, authenticated: false })).toBe("login");
  });

  it("offers only the exits while a signed-in user's wallet is still being prepared", () => {
    expect(getWalletEntryState({ ready: true, walletsReady: true, authenticated: true })).toBe("preparing");
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

  it("ends only the active session type, then clears the console account", async () => {
    const logout = vi.fn(async () => undefined);
    const disconnect = vi.fn();
    const disconnectConnection = vi.fn(async () => undefined);
    const clearAccount = vi.fn();

    await exitWalletSession({ authenticated: true, logout, disconnect, disconnectConnection, clearAccount });
    expect(logout).toHaveBeenCalledOnce();
    expect(disconnect).not.toHaveBeenCalled();
    expect(clearAccount).toHaveBeenCalledOnce();
    expect(logout.mock.invocationCallOrder[0]).toBeLessThan(clearAccount.mock.invocationCallOrder[0]);

    logout.mockClear();
    clearAccount.mockClear();
    await exitWalletSession({ authenticated: false, logout, disconnect, disconnectConnection, clearAccount });
    expect(logout).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(clearAccount).toHaveBeenCalledOnce();
  });

  it("disconnects wagmi before the account is cleared, so an extension can revoke the site's access", async () => {
    const logout = vi.fn(async () => undefined);
    const disconnectConnection = vi.fn(async () => undefined);
    const clearAccount = vi.fn();

    await exitWalletSession({ authenticated: true, logout, disconnectConnection, clearAccount });

    expect(disconnectConnection).toHaveBeenCalledOnce();
    expect(disconnectConnection.mock.invocationCallOrder[0]).toBeLessThan(logout.mock.invocationCallOrder[0]);
    expect(disconnectConnection.mock.invocationCallOrder[0]).toBeLessThan(clearAccount.mock.invocationCallOrder[0]);
  });

  it("clears the console account when its wallet is already gone", async () => {
    const clearAccount = vi.fn();

    await exitWalletSession({
      authenticated: false,
      logout: async () => undefined,
      disconnectConnection: async () => undefined,
      clearAccount,
    });

    expect(clearAccount).toHaveBeenCalledOnce();
  });

  it("still ends the session and clears the account when wagmi's disconnect fails", async () => {
    const logout = vi.fn(async () => undefined);
    const clearAccount = vi.fn();

    await exitWalletSession({
      authenticated: true,
      logout,
      disconnectConnection: async () => {
        throw new Error("provider unavailable");
      },
      clearAccount,
    });

    expect(logout).toHaveBeenCalledOnce();
    expect(clearAccount).toHaveBeenCalledOnce();
  });

  it("keeps the console account when logout fails", async () => {
    const error = new Error("logout failed");
    const clearAccount = vi.fn();

    await expect(
      exitWalletSession({
        authenticated: true,
        logout: async () => {
          throw error;
        },
        disconnectConnection: async () => undefined,
        clearAccount,
      }),
    ).rejects.toThrow(error);
    expect(clearAccount).not.toHaveBeenCalled();
  });
});

describe("isUserCancelledFlow", () => {
  it("treats a closed Privy modal as a cancellation rather than a failure", () => {
    expect(isUserCancelledFlow("exited_auth_flow")).toBe(true);
    expect(isUserCancelledFlow("exited_link_flow")).toBe(true);
    expect(isUserCancelledFlow("invalid_credentials")).toBe(false);
  });
});
