import { describe, expect, it } from "vitest";
import { getSquidReviewBlocker } from "./squid-review-blocker";

const ready = {
  amount: "100",
  balances: { native: 10n, token: 100n },
  balancesFailed: false,
  feesFailed: false,
  isNativeSource: false,
  nativeSymbol: "ETH",
  parsedAmount: 100n,
  payerLabel: "0x1111...1111",
  quoteFailed: false,
  quoteReady: true,
  requiredNative: 10n,
  sourceSymbol: "USDC",
};

describe("getSquidReviewBlocker", () => {
  it("allows Review once every requirement is met", () => {
    expect(getSquidReviewBlocker(ready)).toBeNull();
  });

  it.each([
    ["no token", { sourceSymbol: undefined }, { kind: "missing", message: "Choose a source token." }],
    ["no amount", { amount: " ", parsedAmount: null }, { kind: "missing", message: "Enter an amount." }],
    ["an invalid amount", { amount: "abc", parsedAmount: null }, { kind: "missing", message: "Enter a valid amount." }],
    [
      "a failed balance read",
      { balances: undefined, balancesFailed: true },
      { kind: "failed", message: "The USDC balance could not be loaded." },
    ],
    ["a loading balance", { balances: undefined }, { kind: "waiting", message: "Checking the USDC balance…" }],
    [
      "too little of the token",
      { balances: { native: 10n, token: 99n }, quoteReady: false },
      { kind: "funds", message: "0x1111...1111 doesn't have enough USDC." },
    ],
    ["a failed quote", { quoteFailed: true }, { kind: "failed", message: "Squid could not quote this amount." }],
    ["a loading quote", { quoteReady: false }, { kind: "waiting", message: "Getting a quote…" }],
    ["failed fees", { feesFailed: true }, { kind: "failed", message: "Network fees could not be estimated." }],
    ["loading fees", { requiredNative: null }, { kind: "waiting", message: "Estimating network fees…" }],
    [
      "too little gas",
      { balances: { native: 9n, token: 100n } },
      { kind: "funds", message: "0x1111...1111 doesn't have enough ETH for network fees." },
    ],
    [
      "too little of a native source for the payment and gas",
      { balances: { native: 9n, token: 100n }, isNativeSource: true },
      { kind: "funds", message: "0x1111...1111 doesn't have enough ETH for the payment and network fees." },
    ],
  ])("explains %s", (_case, override, expected) => {
    expect(getSquidReviewBlocker({ ...ready, ...override })).toEqual(expected);
  });
});
