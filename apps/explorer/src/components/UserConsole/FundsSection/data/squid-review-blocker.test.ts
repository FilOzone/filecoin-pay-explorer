import { describe, expect, it } from "vitest";
import { getSquidReviewBlocker } from "./squid-review-blocker";
import { FEE_RESERVE_USDC } from "./usdc-gas-payer";

const ready = {
  amount: "100",
  balances: { native: 10n, token: 100n },
  balancesFailed: false,
  feesFailed: false,
  feesLoading: false,
  filBalanceLoading: false,
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
  // An embedded wallet with no ETH and 10 USDC, depositing 9.5 of it.
  const usdcGasReady = {
    ...ready,
    amount: "9.5",
    balances: { native: 0n, token: 10_000_000n },
    parsedAmount: 9_500_000n,
    requiredNative: null,
    usdcGas: { payer: "ready", failed: false },
  } as const;
  const shortOfReserve = {
    kind: "funds",
    message: "0x1111...1111 needs up to 0.5 USDC on top of the deposit for network fees.",
  };

  it.each([
    [
      "a payer check in flight",
      { payer: undefined, failed: false },
      { kind: "waiting", message: "Checking USDC network fees…" },
    ],
    [
      "a failed payer check",
      { payer: undefined, failed: true },
      { kind: "failed", message: "USDC network fees could not be estimated." },
    ],
    [
      "a payer delegated elsewhere",
      { payer: "conflict", failed: false },
      {
        kind: "funds",
        message: "0x1111...1111 is set up with another smart account, so its network fees can't be paid in USDC.",
      },
    ],
    ["a ready payer", { payer: "ready", failed: false }, null],
  ] as const)("lets USDC gas with %s stand in for the ETH fee checks", (_label, usdcGas, expected) => {
    expect(getSquidReviewBlocker({ ...usdcGasReady, usdcGas })).toEqual(expected);
  });

  it.each([
    ["covers the deposit and the reserve", 10_000_000n - FEE_RESERVE_USDC, null],
    ["covers the deposit but not the reserve", 10_000_000n - FEE_RESERVE_USDC + 1n, shortOfReserve],
  ] as const)("holds the USDC fee reserve on top when the balance %s", (_label, parsedAmount, expected) => {
    expect(getSquidReviewBlocker({ ...usdcGasReady, parsedAmount })).toEqual(expected);
  });

  it("still waits for the quote when USDC gas is ready", () => {
    expect(getSquidReviewBlocker({ ...usdcGasReady, quoteReady: false, quoteLoading: true })).toEqual({
      kind: "waiting",
      message: "Getting a quote…",
    });
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
    [
      "a loading FIL balance",
      { filBalanceLoading: true, quoteReady: false },
      { kind: "waiting", message: "Checking your FIL balance…" },
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
