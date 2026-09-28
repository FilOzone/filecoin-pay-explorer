import { describe, expect, it } from "vitest";
import { isPrivyEmbeddedWallet } from "./console-wallet";

describe("isPrivyEmbeddedWallet", () => {
  it("recognises embedded wallets by client type", () => {
    expect(isPrivyEmbeddedWallet({ walletClientType: "privy" })).toBe(true);
    expect(isPrivyEmbeddedWallet({ walletClientType: "metamask" })).toBe(false);
  });
});
