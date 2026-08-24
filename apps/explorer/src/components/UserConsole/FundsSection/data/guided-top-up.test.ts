import { NATIVE_TOKEN_ADDRESS, type SquidFundingPlan } from "@filecoin-project/squid-evm-funding";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
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

  it("derives a reviewed gas cap from source-chain gas and the OP Stack execution buffer", () => {
    expect(getPlanNetworkGas(plan())).toEqual({ estimated: 10n, maximum: 36n });
    expect(getPlanNetworkGas(plan(token, 1))).toEqual({ estimated: 10n, maximum: 30n });
  });

  it("buffers each modeled OP Stack transaction before summing", () => {
    const lowValuePlan = plan();
    const sourceGas = lowValuePlan.quotes[0].costs[0];
    if (sourceGas) sourceGas.amount = 3n;

    expect(getPlanNetworkGas(lowValuePlan)).toEqual({ estimated: 3n, maximum: 12n });
  });

  it("includes bridge headroom and the exact reviewed gas cap in the native balance requirement", () => {
    const erc20Plan = plan();
    const nativePlan = plan(NATIVE_TOKEN_ADDRESS);

    expect(getPlanBridgeNativeFees(erc20Plan)).toEqual({ estimated: 5n, maximum: 6n });
    expect(getRequiredNativeBalance(erc20Plan, 36n)).toBe(42n);
    expect(getRequiredNativeBalance(nativePlan, 36n)).toBe(142n);
  });

  it("ignores cached separate-native errors after selecting the native token", () => {
    expect(shouldBlockOnSeparateNativeBalance(true, true, false)).toBe(false);
    expect(shouldBlockOnSeparateNativeBalance(true, false, true)).toBe(false);
    expect(shouldBlockOnSeparateNativeBalance(false, true, false)).toBe(true);
    expect(shouldBlockOnSeparateNativeBalance(false, false, true)).toBe(true);
  });
});
