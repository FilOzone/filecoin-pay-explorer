import { NATIVE_TOKEN_ADDRESS, SQUID_ROUTER_ADDRESS } from "@filecoin-project/squid-evm-funding";
import { decodeFunctionData } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  buildDepositPostHook,
  getDepositRequiredNativeBalance,
  getSourceNativeCosts,
  getUsdfcPerUsdc,
  isExecutableQuote,
  isUnfavorableRate,
  parseSquidDepositRoute,
  requestSquidDepositRoute,
  selectUsdcTokens,
  squidDepositAbi,
} from "./squid-deposit-route";

const OWNER = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const USDC = "0x3333333333333333333333333333333333333333";
const USDFC = "0x4444444444444444444444444444444444444444";
const PAYMENTS = "0x5555555555555555555555555555555555555555";
const FAR_FUTURE = "4102444800";

const request = {
  owner: OWNER,
  recipient: RECIPIENT,
  sourceChainId: 8453,
  sourceToken: USDC,
  sourceAmount: 100_000_000n,
  payments: PAYMENTS,
  usdfc: USDFC,
  slippage: 1,
} as const;

function fakeRoute(overrides: { quoteOnly?: boolean; params?: object; estimate?: object; transaction?: object } = {}) {
  const quoteOnly = overrides.quoteOnly ?? true;
  return {
    quoteId: "quote-1",
    params: {
      fromChain: "8453",
      toChain: "314",
      fromAmount: "100000000",
      slippage: 1,
      quoteOnly,
      fromToken: USDC,
      toToken: USDFC,
      fromAddress: OWNER,
      toAddress: RECIPIENT,
      ...overrides.params,
    },
    estimate: {
      toAmount: "93000000000000000000",
      toAmountMin: "92000000000000000000",
      fromAmountUSD: "99.97",
      toAmountUSD: "100.12",
      aggregatePriceImpact: "0.03",
      estimatedRouteDuration: 90,
      actions: [
        { type: "swap", fromChain: "8453", toChain: "8453" },
        { type: "bridge", fromChain: "8453", toChain: "314" },
        { type: "custom", fromChain: "314", toChain: "314" },
      ],
      feeCosts: [
        {
          name: "Gas receiver fee",
          amount: "5971701479908",
          amountUSD: "0.01",
          token: { address: NATIVE_TOKEN_ADDRESS, chainId: "8453", symbol: "ETH", decimals: 18 },
        },
      ],
      gasCosts: [
        {
          type: "executeCall",
          amount: "3596394000000",
          amountUSD: "0.01",
          token: { address: NATIVE_TOKEN_ADDRESS, chainId: 8453, symbol: "ETH", decimals: 18 },
        },
      ],
      ...overrides.estimate,
    },
    ...(quoteOnly
      ? {}
      : {
          transactionRequest: {
            target: SQUID_ROUTER_ADDRESS,
            data: "0xabcdef",
            value: "5971701479908",
            gasLimit: "599399",
            expiry: FAR_FUTURE,
            ...overrides.transaction,
          },
        }),
  };
}

const now = () => 1_700_000_000_000;

describe("buildDepositPostHook", () => {
  it("approves USDFC to Filecoin Pay and deposits the full arriving balance for the recipient", () => {
    const hook = buildDepositPostHook({ payments: PAYMENTS, usdfc: USDFC, recipient: RECIPIENT });

    expect(hook.calls.map((call) => ({ ...call, callData: undefined }))).toEqual([
      {
        chainType: "evm",
        callType: 1,
        target: USDFC,
        value: "0",
        callData: undefined,
        payload: { tokenAddress: USDFC, inputPos: 1 },
        estimatedGas: "15000000",
      },
      {
        chainType: "evm",
        callType: 1,
        target: PAYMENTS,
        value: "0",
        callData: undefined,
        payload: { tokenAddress: USDFC, inputPos: 2 },
        estimatedGas: "60000000",
      },
    ]);
    expect(decodeFunctionData({ abi: squidDepositAbi, data: hook.calls[0].callData })).toEqual({
      functionName: "approve",
      args: [PAYMENTS, 0n],
    });
    expect(decodeFunctionData({ abi: squidDepositAbi, data: hook.calls[1].callData })).toEqual({
      functionName: "deposit",
      args: [USDFC, RECIPIENT, 0n],
    });
  });
});

describe("selectUsdcTokens", () => {
  it("keeps USDC variants with plain USDC first and drops everything else", () => {
    const tokens = [
      { chainId: 314, token: USDFC, symbol: "USDFC", decimals: 18 },
      { chainId: 314, token: "0x6666666666666666666666666666666666666666", symbol: "ceUSDC", decimals: 6 },
      { chainId: 314, token: NATIVE_TOKEN_ADDRESS, symbol: "FIL", decimals: 18 },
      { chainId: 314, token: USDC, symbol: "USDC", decimals: 6 },
    ] as const;

    expect(selectUsdcTokens(tokens)).toEqual([tokens[3], tokens[1]]);
  });
});

describe("rate helpers", () => {
  it("computes USDFC per USDC and flags a haircut below the threshold", () => {
    const rate = getUsdfcPerUsdc({ sourceAmount: 100_000_000n, destinationAmount: 93_000_000_000_000_000_000n }, 6);
    expect(rate).toBeCloseTo(0.93, 5);
    expect(isUnfavorableRate(rate)).toBe(true);
    expect(isUnfavorableRate(0.98)).toBe(false);
    expect(getUsdfcPerUsdc({ sourceAmount: 0n, destinationAmount: 1n }, 6)).toBe(0);
  });

  it("sums source-network native costs and adds headroom for the approval and swap gas", () => {
    const quote = parseSquidDepositRoute(fakeRoute(), request, true, now);
    expect(getSourceNativeCosts(quote, 8453)).toEqual({ fees: 5_971_701_479_908n, gas: 3_596_394_000_000n });
    expect(getSourceNativeCosts(quote, 1)).toEqual({ fees: 0n, gas: 0n });
    expect(
      getDepositRequiredNativeBalance({ fees: quote.fees, gasCosts: quote.gasCosts }, 8453, 1_000_000_000_000n),
    ).toBe(5_971_701_479_908n + 4_596_394_000_000n + 2_298_197_000_000n);
  });
});

describe("parseSquidDepositRoute", () => {
  it("parses a price quote", () => {
    const quote = parseSquidDepositRoute(fakeRoute(), request, true, now);

    expect(quote).toEqual({
      quoteId: "quote-1",
      sourceChainId: 8453,
      sourceAmount: 100_000_000n,
      destinationAmount: 93_000_000_000_000_000_000n,
      minimumDestinationAmount: 92_000_000_000_000_000_000n,
      sourceAmountUsd: "99.97",
      destinationAmountUsd: "100.12",
      priceImpactPercent: "0.03",
      estimatedSeconds: 90,
      fees: [
        {
          name: "Gas receiver fee",
          amount: 5_971_701_479_908n,
          amountUsd: "0.01",
          token: { address: NATIVE_TOKEN_ADDRESS, chainId: 8453, symbol: "ETH", decimals: 18 },
        },
      ],
      gasCosts: [
        {
          name: "executeCall",
          amount: 3_596_394_000_000n,
          amountUsd: "0.01",
          token: { address: NATIVE_TOKEN_ADDRESS, chainId: 8453, symbol: "ETH", decimals: 18 },
        },
      ],
    });
    expect(isExecutableQuote(quote)).toBe(false);
  });

  it("parses an executable route against the trusted router", () => {
    const quote = parseSquidDepositRoute(fakeRoute({ quoteOnly: false }), request, false, now);

    expect(quote.transaction).toEqual({
      target: SQUID_ROUTER_ADDRESS,
      data: "0xabcdef",
      value: 5_971_701_479_908n,
      gasLimit: 599_399n,
      expiresAt: 4_102_444_800,
    });
    expect(isExecutableQuote(quote)).toBe(true);
  });

  it.each([
    ["a sender mismatch", fakeRoute({ params: { fromAddress: RECIPIENT } }), true, "request identity mismatch"],
    ["a recipient mismatch", fakeRoute({ params: { toAddress: OWNER } }), true, "request identity mismatch"],
    [
      "a route that dropped the deposit hook",
      fakeRoute({ estimate: { actions: [{ type: "bridge", fromChain: "8453", toChain: "314" }] } }),
      true,
      "missing the Filecoin Pay deposit step",
    ],
    [
      "an untrusted target",
      fakeRoute({ quoteOnly: false, transaction: { target: OWNER } }),
      false,
      "trusted target or spender checks",
    ],
    [
      "an untrusted approval spender",
      fakeRoute({ quoteOnly: false, transaction: { approvalSpender: OWNER } }),
      false,
      "trusted target or spender checks",
    ],
    ["an expired route", fakeRoute({ quoteOnly: false, transaction: { expiry: "1" } }), false, "expired route"],
    [
      "a missing transaction",
      { ...fakeRoute({ quoteOnly: false }), transactionRequest: undefined },
      false,
      "missing transaction request",
    ],
  ])("rejects %s", (_label, route, quoteOnly, message) => {
    expect(() => parseSquidDepositRoute(route, request, quoteOnly, now)).toThrow(message);
  });
});

describe("requestSquidDepositRoute", () => {
  it("posts the route request with the deposit hook and parses the response", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ route: fakeRoute() }), { status: 200 }));

    const quote = await requestSquidDepositRoute(
      request,
      { integratorId: "integrator", fetch, now },
      { quoteOnly: true },
    );

    expect(quote.quoteId).toBe("quote-1");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://v2.api.squidrouter.com/v2/route");
    expect(init.headers).toEqual({ "content-type": "application/json", "x-integrator-id": "integrator" });
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      fromAddress: OWNER,
      toAddress: RECIPIENT,
      fromChain: "8453",
      fromToken: USDC,
      fromAmount: "100000000",
      toChain: "314",
      toToken: USDFC,
      slippage: 1,
      quoteOnly: true,
      postHook: buildDepositPostHook(request),
    });
  });

  it("surfaces Squid's error message with the status", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ message: "amount too low" }), { status: 422 }));

    await expect(
      requestSquidDepositRoute(request, { integratorId: "integrator", fetch }, { quoteOnly: true }),
    ).rejects.toThrow("Squid quote failed (422): amount too low");
  });

  it("rejects a non-positive amount before calling Squid", async () => {
    const fetch = vi.fn();
    await expect(
      requestSquidDepositRoute(
        { ...request, sourceAmount: 0n },
        { integratorId: "integrator", fetch },
        { quoteOnly: true },
      ),
    ).rejects.toThrow("greater than zero");
    expect(fetch).not.toHaveBeenCalled();
  });
});
