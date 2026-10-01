import type { ConnectedWallet, User } from "@privy-io/react-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isLinkedWallet, isPrivyEmbeddedWallet, selectConsoleWallet, setConsoleExited } from "./console-wallet";

const wallet = (address: string, walletClientType: string) => ({ address, walletClientType }) as ConnectedWallet;
const EMBEDDED = wallet("0xAAA", "privy");
const EXTENSION = wallet("0xBBB", "metamask");

describe("isPrivyEmbeddedWallet", () => {
  it("recognises embedded wallets by client type", () => {
    expect(isPrivyEmbeddedWallet({ walletClientType: "privy" })).toBe(true);
    expect(isPrivyEmbeddedWallet({ walletClientType: "metamask" })).toBe(false);
  });
});

describe("selectConsoleWallet", () => {
  const stored = new Map<string, string>();
  beforeEach(() => {
    stored.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
        removeItem: (key: string) => stored.delete(key),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the login's embedded wallet when an extension connects after it", () => {
    expect(selectConsoleWallet({ wallets: [EXTENSION, EMBEDDED] })).toBe(EMBEDDED);
  });

  it("follows the extension when there is no embedded wallet", () => {
    expect(selectConsoleWallet({ wallets: [EXTENSION] })).toBe(EXTENSION);
  });

  it("selects nothing after an exit until the user comes back", () => {
    setConsoleExited(true);
    expect(selectConsoleWallet({ wallets: [EXTENSION] })).toBeUndefined();
    setConsoleExited(false);
    expect(selectConsoleWallet({ wallets: [EXTENSION] })).toBe(EXTENSION);
  });
});

describe("isLinkedWallet", () => {
  const user = { linkedAccounts: [{ type: "email" }, { type: "wallet", address: "0xAbC" }] } as unknown as User;

  it("matches the user's own wallets regardless of case", () => {
    expect(isLinkedWallet(user, "0xabc")).toBe(true);
  });

  it("rejects other accounts, a missing user, and a missing address", () => {
    expect(isLinkedWallet(user, "0xdef")).toBe(false);
    expect(isLinkedWallet(null, "0xabc")).toBe(false);
    expect(isLinkedWallet(user, undefined)).toBe(false);
  });
});
