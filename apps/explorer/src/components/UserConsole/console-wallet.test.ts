import { describe, expect, it } from "vitest";
import { createConsoleWalletSelector, isPrivyEmbeddedWallet } from "./console-wallet";

const embedded = { address: "0x1111111111111111111111111111111111111111", walletClientType: "privy" };
const metamask = { address: "0x2222222222222222222222222222222222222222", walletClientType: "metamask" };
const coinbase = { address: "0x3333333333333333333333333333333333333333", walletClientType: "coinbase_wallet" };

describe("createConsoleWalletSelector", () => {
  it("keeps the embedded wallet active when external wallets connect afterwards", () => {
    const select = createConsoleWalletSelector();
    expect(select({ wallets: [embedded], user: null })).toBe(embedded);
    expect(select({ wallets: [metamask, embedded], user: null })).toBe(embedded);
    expect(select({ wallets: [coinbase, metamask, embedded], user: null })).toBe(embedded);
  });

  it("keeps the login wallet active for wallet-based logins", () => {
    const select = createConsoleWalletSelector();
    const user = { wallet: { address: metamask.address.toUpperCase() } } as never;
    expect(select({ wallets: [metamask], user })).toBe(metamask);
    expect(select({ wallets: [coinbase, metamask], user })).toBe(metamask);
  });

  it("sticks to the previous choice for connect-only sessions and falls back to the first wallet", () => {
    const select = createConsoleWalletSelector();
    expect(select({ wallets: [metamask], user: null })).toBe(metamask);
    expect(select({ wallets: [coinbase, metamask], user: null })).toBe(metamask);
    expect(select({ wallets: [coinbase], user: null })).toBe(coinbase);
    expect(select({ wallets: [], user: null })).toBeUndefined();
  });

  it("remembers a connect-only choice across reloads through storage", () => {
    const items = new Map<string, string>();
    const storage = () => ({
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    });
    const firstSession = createConsoleWalletSelector({ storage });
    expect(firstSession({ wallets: [metamask], user: null })).toBe(metamask);
    expect(firstSession({ wallets: [coinbase, metamask], user: null })).toBe(metamask);

    // A reload builds a fresh selector; the stored choice wins over wallet order.
    const secondSession = createConsoleWalletSelector({ storage });
    expect(secondSession({ wallets: [coinbase, metamask], user: null })).toBe(metamask);
    expect([...items.entries()]).toEqual([["filecoin-pay:console-wallet:v1", metamask.address]]);
  });

  it("falls back to session memory when storage is unavailable", () => {
    const storage = () => {
      throw new Error("blocked");
    };
    const select = createConsoleWalletSelector({ storage });
    expect(select({ wallets: [metamask], user: null })).toBe(metamask);
    expect(select({ wallets: [coinbase, metamask], user: null })).toBe(metamask);
  });

  it("recognises the embedded wallet by its client type", () => {
    expect(isPrivyEmbeddedWallet(embedded)).toBe(true);
    expect(isPrivyEmbeddedWallet(metamask)).toBe(false);
  });
});
