import { describe, expect, it } from "vitest";
import { getSquidReviewBlocker } from "./squid-review-blocker";

const ready = {
  amount: "100",
  balances: { native: 10n, token: 100n },
  balancesFailed: false,
  feesFailed: false,
  feesLoading: false,
  isNativeSource: false,
  nativeSymbol: "ETH",
  parsedAmount: 100n,
  payerLabel: "0x1111...1111",
  quoteFailed: false,
  quoteLoading: false,
  quoteReady: true,
  requiredNative: 10n,
  sourceSymbol: "USDC",
};

describe("getSquidReviewBlocker", () => {
  it.each([
    [{ status: "planning" }, { kind: "waiting", message: "Setting aside USDC for network fees…" }],
    [{ status: "failed" }, { kind: "failed", message: "USDC network fees could not be estimated." }],
    [
      { status: "insufficient", reserved: 760_000n },
      {
        kind: "funds",
        message: "0x1111...1111 doesn't have enough USDC for the deposit and its fees, which need up to 0.76 USDC.",
      },
    ],
    [
      { status: "conflict" },
      {
        kind: "funds",
        message:
          "0x1111...1111 is set up with another smart account, so its network fees can't be paid in USDC. Add ETH to pay them.",
      },
    ],
    [{ status: "ready" }, null],
  ] as const)("lets a USDC-gas plan in state %o stand in for the ETH balance", (usdcGas, expected) => {
    expect(getSquidReviewBlocker({ ...ready, balances: { native: 0n, token: 100n }, usdcGas })).toEqual(expected);
  });

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
    ["a loading quote", { quoteReady: false, quoteLoading: true }, { kind: "waiting", message: "Getting a quote…" }],
    [
      "a quote that is not being fetched",
      { quoteReady: false },
      { kind: "missing", message: "No quote is available yet." },
    ],
    ["failed fees", { feesFailed: true }, { kind: "failed", message: "Network fees could not be estimated." }],
    [
      "loading fees",
      { requiredNative: null, feesLoading: true },
      { kind: "waiting", message: "Estimating network fees…" },
    ],
    [
      "fees that are not being estimated",
      { requiredNative: null },
      { kind: "missing", message: "Network fees are not available yet." },
    ],
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
