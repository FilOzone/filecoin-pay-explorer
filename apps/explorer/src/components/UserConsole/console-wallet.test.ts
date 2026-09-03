import { describe, expect, it } from "vitest";
import { createConsoleWalletSelector, isPrivyEmbeddedWallet } from "./console-wallet";

const embedded = { address: "0x1111111111111111111111111111111111111111", walletClientType: "privy" };
const metamask = { address: "0x2222222222222222222222222222222222222222", walletClientType: "metamask" };
const coinbase = { address: "0x3333333333333333333333333333333333333333", walletClientType: "coinbase_wallet" };

describe("createConsoleWalletSelector", () => {
  it("keeps the selected Filecoin account when another wallet connects", () => {
    const select = createConsoleWalletSelector();
    expect(select({ wallets: [embedded], user: null })).toBe(embedded);
    expect(select({ wallets: [metamask, embedded], user: null })).toBe(embedded);
    expect(select({ wallets: [coinbase, metamask, embedded], user: null })).toBe(embedded);
  });

  it("uses the login wallet, then remembers a connect-only wallet across reloads", () => {
    const select = createConsoleWalletSelector();
    const user = { wallet: { address: metamask.address.toUpperCase() } } as never;
    expect(select({ wallets: [coinbase, metamask], user })).toBe(metamask);

    const items = new Map<string, string>();
    const storage = () => ({
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    });
    expect(createConsoleWalletSelector({ storage })({ wallets: [metamask], user: null })).toBe(metamask);
    expect(createConsoleWalletSelector({ storage })({ wallets: [coinbase, metamask], user: null })).toBe(metamask);
  });

  it("recognises embedded wallets by client type", () => {
    expect(isPrivyEmbeddedWallet(embedded)).toBe(true);
    expect(isPrivyEmbeddedWallet(metamask)).toBe(false);
  });
});
