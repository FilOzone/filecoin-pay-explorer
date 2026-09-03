import { describe, expect, it } from "vitest";
import { describeWallet, formatTokenAmount, pickDefaultWallet } from "./wallets";

const EMBEDDED = { address: "0x1111111111111111111111111111111111111111", walletClientType: "privy" };
const EXTERNAL = { address: "0x3333333333333333333333333333333333333333", walletClientType: "coinbase_wallet" };

describe("wallet helpers", () => {
  it("labels wallets, prefers the embedded wallet as payer, and trims token amounts", () => {
    expect(describeWallet(EMBEDDED)).toBe("Privy wallet (0x1111...1111)");
    expect(describeWallet(EXTERNAL)).toBe("Coinbase Wallet (0x3333...3333)");
    expect(pickDefaultWallet([EXTERNAL, EMBEDDED] as never)).toBe(EMBEDDED);
    expect(pickDefaultWallet([EXTERNAL] as never)).toBe(EXTERNAL);
    expect(pickDefaultWallet([])).toBeUndefined();
    expect([
      formatTokenAmount(12_500_000n, 6),
      formatTokenAmount(10n ** 18n, 18),
      formatTokenAmount(123_456n, 9, 4),
    ]).toEqual(["12.5", "1", "0.0001"]);
  });
});
