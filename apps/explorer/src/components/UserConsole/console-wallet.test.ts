import type { User } from "@privy-io/react-auth";
import { describe, expect, it } from "vitest";
import { isLinkedWallet, isPrivyEmbeddedWallet } from "./console-wallet";

describe("isPrivyEmbeddedWallet", () => {
  it("recognises embedded wallets by client type", () => {
    expect(isPrivyEmbeddedWallet({ walletClientType: "privy" })).toBe(true);
    expect(isPrivyEmbeddedWallet({ walletClientType: "metamask" })).toBe(false);
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
