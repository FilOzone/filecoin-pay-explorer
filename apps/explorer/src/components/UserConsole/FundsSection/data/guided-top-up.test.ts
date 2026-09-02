import { NATIVE_TOKEN_ADDRESS, type SquidFundingPlan } from "@filecoin-project/squid-evm-funding";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  getBridgeNativeFee,
  getMaximumBridgeNativeFee,
  getPlanBridgeNativeFees,
  getPlanNetworkGas,
  getRequiredNativeBalance,
  invalidateTopUpQueries,
  parseTopUpAmount,
  shouldBlockOnSeparateNativeBalance,
} from "./guided-top-up";

const owner = "0x1111111111111111111111111111111111111111" as const;
const token = "0x2222222222222222222222222222222222222222" as const;

function plan(sourceToken: SquidFundingPlan["source"]["token"] = token, sourceChainId = 8453): SquidFundingPlan {
  return {
    maxSourceAmount: 100n,
    owner,
    quotes: [
      {
        actions: [],
        costs: [
          {
            amount: 10n,
            kind: "gas",
            name: "Source gas",
            token: { address: NATIVE_TOKEN_ADDRESS, chainId: sourceChainId, decimals: 18, symbol: "ETH" },
          },
          {
            amount: 5n,
            kind: "fee",
            name: "Bridge fee",
            token: { address: NATIVE_TOKEN_ADDRESS, chainId: sourceChainId, decimals: 18, symbol: "ETH" },
          },
          {
            amount: 99n,
            kind: "gas",
            name: "Destination gas",
            token: { address: NATIVE_TOKEN_ADDRESS, chainId: 314, decimals: 18, symbol: "FIL" },
          },
          {
            amount: 77n,
            kind: "fee",
            name: "ERC-20 fee",
            token: { address: token, chainId: sourceChainId, decimals: 6, symbol: "USDC" },
          },
        ],
        destinationAmount: 1n,
        id: "quote",
        requirement: { amount: 1n, chainId: 314, id: "requirement", recipient: owner, token },
        sourceAmount: 100n,
      },
    ],
    slippage: 1,
    source: { chainId: sourceChainId, decimals: 18, symbol: "ETH", token: sourceToken },
  };
}

describe("guided top-up", () => {
  it("parses an editable 18-decimal USDFC amount", () => {
    expect(parseTopUpAmount("1.25")).toBe(1_250_000_000_000_000_000n);
    expect(parseTopUpAmount("0")).toBeNull();
    expect(parseTopUpAmount("not-a-number")).toBeNull();
  });

  it("invalidates account and balance data after a top-up", async () => {
    const queryClient = new QueryClient();
    const accountId = "indexed-account";
    const accountOwner = "0x1111111111111111111111111111111111111111";
    const affectedKeys = [
      ["account", accountOwner, "mainnet"],
      ["account", accountId, "tokens", 1, "mainnet"],
      ["payments", "account-summary", 314, accountOwner],
      ["balance", accountOwner],
      ["readContract", "payments"],
    ] as const;
    const unaffectedKey = ["account", "another-owner", "mainnet"] as const;

    for (const queryKey of [...affectedKeys, unaffectedKey]) queryClient.setQueryData(queryKey, "cached");

    await invalidateTopUpQueries(queryClient, accountId, accountOwner);

    expect(affectedKeys.map((queryKey) => queryClient.getQueryState(queryKey)?.isInvalidated)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(queryClient.getQueryState(unaffectedKey)?.isInvalidated).toBe(false);
  });

  it("derives the reviewed gas cap from source type and the current allowance", () => {
    expect(getPlanNetworkGas(plan(NATIVE_TOKEN_ADDRESS))).toEqual({
      estimated: 10n,
      maximum: 12n,
      transactionCount: 1,
    });
    expect(getPlanNetworkGas(plan(), 100n)).toEqual({ estimated: 10n, maximum: 12n, transactionCount: 1 });
    expect(getPlanNetworkGas(plan(), 0n)).toEqual({ estimated: 10n, maximum: 24n, transactionCount: 2 });
    expect(getPlanNetworkGas(plan(), 1n)).toEqual({ estimated: 10n, maximum: 36n, transactionCount: 3 });
    expect(getPlanNetworkGas(plan(token, 1), 1n)).toEqual({
      estimated: 10n,
      maximum: 30n,
      transactionCount: 3,
    });
  });

  it("buffers each modeled OP Stack transaction before summing", () => {
    const lowValuePlan = plan();
    const sourceGas = lowValuePlan.quotes[0].costs[0];
    if (sourceGas) sourceGas.amount = 3n;

    expect(getPlanNetworkGas(lowValuePlan, 1n)).toEqual({ estimated: 3n, maximum: 12n, transactionCount: 3 });
  });

  it("waits for the ERC-20 allowance before publishing a hard gas maximum", () => {
    expect(getPlanNetworkGas(plan())).toEqual({ estimated: 10n, maximum: null, transactionCount: null });
  });

  it("models an exact allowance as consumed before a later route", () => {
    const fundingPlan = plan();
    const firstQuote = fundingPlan.quotes[0];
    if (!firstQuote) throw new Error("Expected a quote fixture");
    fundingPlan.quotes = [firstQuote, { ...firstQuote, id: "second", sourceAmount: 50n }];

    expect(getPlanNetworkGas(fundingPlan, 100n)).toEqual({
      estimated: 20n,
      maximum: 36n,
      transactionCount: 3,
    });
  });

  it("includes bridge headroom and the exact reviewed gas cap in the native balance requirement", () => {
    const erc20Plan = plan();
    const nativePlan = plan(NATIVE_TOKEN_ADDRESS);

    expect(getPlanBridgeNativeFees(erc20Plan)).toEqual({ estimated: 5n, maximum: 8n });
    expect(getRequiredNativeBalance(erc20Plan, 36n)).toBe(44n);
    expect(getRequiredNativeBalance(nativePlan, 36n)).toBe(144n);
  });

  it("includes a caller-selected native balance floor", () => {
    const nativePlan = plan(NATIVE_TOKEN_ADDRESS);

    expect(getRequiredNativeBalance(nativePlan, 36n, 7n)).toBe(151n);
  });

  it("uses the dependency's rounded-up 50% bridge execution headroom", () => {
    expect(getMaximumBridgeNativeFee(0n)).toBe(0n);
    expect(getMaximumBridgeNativeFee(1n)).toBe(2n);
    expect(getMaximumBridgeNativeFee(5_780_000_000_000n)).toBe(8_670_000_000_000n);
  });

  it("sums only source-chain native bridge fees", () => {
    const fundingPlan = plan();
    const costs = fundingPlan.quotes[0]?.costs ?? [];

    expect(getBridgeNativeFee(costs, fundingPlan.source.chainId)).toBe(5n);
  });

  it("sums each route's rounded reviewed maximum for the cumulative execution cap", () => {
    const fundingPlan = plan(token, 1);
    const firstQuote = fundingPlan.quotes[0];
    if (!firstQuote) throw new Error("Expected a quote fixture");
    const nativeFee = (amount: bigint) => ({
      amount,
      kind: "fee" as const,
      name: "Bridge fee",
      token: { address: NATIVE_TOKEN_ADDRESS, chainId: 1, decimals: 18, symbol: "ETH" },
    });
    fundingPlan.quotes = [
      { ...firstQuote, costs: [nativeFee(1n)], id: "one" },
      { ...firstQuote, costs: [nativeFee(3n)], id: "two" },
    ];

    expect(getPlanBridgeNativeFees(fundingPlan)).toEqual({ estimated: 4n, maximum: 7n });
  });

  it("ignores cached separate-native errors after selecting the native token", () => {
    expect(shouldBlockOnSeparateNativeBalance(true, true, false)).toBe(false);
    expect(shouldBlockOnSeparateNativeBalance(true, false, true)).toBe(false);
    expect(shouldBlockOnSeparateNativeBalance(false, true, false)).toBe(true);
    expect(shouldBlockOnSeparateNativeBalance(false, false, true)).toBe(true);
  });
});
