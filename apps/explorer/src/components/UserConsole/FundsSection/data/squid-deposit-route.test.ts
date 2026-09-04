import { NATIVE_TOKEN_ADDRESS, SQUID_ROUTER_ADDRESS } from "@filecoin-project/squid-evm-funding";
import { decodeFunctionData } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  assertExecutableQuoteWithinReview,
  buildDepositPostHook,
  captureReviewedSquidDepositCaps,
  FIL_GAS_TOP_UP_AMOUNT,
  getDepositNetworkFeeMaximum,
  getDepositRequiredNativeBalance,
  getSourceNativeCosts,
  isExecutableQuote,
  isNativeToken,
  parseSquidDepositRoute,
  planFilGasTopUp,
  requestSquidDepositRoute,
  SUSHI_V3_SWAP_ROUTER_ADDRESS,
  squidDepositAbi,
  sushiSwapRouterAbi,
  WFIL_ADDRESS,
  WFIL_USDFC_POOL_FEE,
} from "./squid-deposit-route";

const OWNER = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const USDC = "0x3333333333333333333333333333333333333333";
const USDFC = "0x4444444444444444444444444444444444444444";
const PAYMENTS = "0x5555555555555555555555555555555555555555";
const FAR_FUTURE = "4102444800";
const topUp = {
  deadline: 1_700_604_800n,
  minimumFil: 250_000_000_000_000_000n,
  spendUsdfc: 625_000_000_000_000_000n,
};

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
      postHook: buildDepositPostHook(request),
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
        { type: "custom", fromChain: "314", toChain: "314", provider: "Filecoin Pay" },
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

  it("swaps a fixed USDFC slice to at least 0.25 FIL before depositing the rest", () => {
    const hook = buildDepositPostHook({ payments: PAYMENTS, usdfc: USDFC, recipient: RECIPIENT }, topUp);

    expect(hook.calls.map((call) => [call.callType, call.target, call.payload.tokenAddress])).toEqual([
      [0, USDFC, USDFC],
      [0, SUSHI_V3_SWAP_ROUTER_ADDRESS, USDFC],
      [1, USDFC, USDFC],
      [1, PAYMENTS, USDFC],
    ]);
    expect(decodeFunctionData({ abi: squidDepositAbi, data: hook.calls[0].callData })).toEqual({
      functionName: "approve",
      args: [SUSHI_V3_SWAP_ROUTER_ADDRESS, topUp.spendUsdfc],
    });
    const multicall = decodeFunctionData({ abi: sushiSwapRouterAbi, data: hook.calls[1].callData });
    expect(multicall.functionName).toBe("multicall");
    const [swap, unwrap] = (multicall.args as [readonly `0x${string}`[]])[0];
    expect(decodeFunctionData({ abi: sushiSwapRouterAbi, data: swap })).toEqual({
      functionName: "exactInputSingle",
      args: [
        {
          amountIn: topUp.spendUsdfc,
          amountOutMinimum: FIL_GAS_TOP_UP_AMOUNT,
          deadline: topUp.deadline,
          fee: WFIL_USDFC_POOL_FEE,
          recipient: SUSHI_V3_SWAP_ROUTER_ADDRESS,
          sqrtPriceLimitX96: 0n,
          tokenIn: USDFC,
          tokenOut: WFIL_ADDRESS,
        },
      ],
    });
    expect(decodeFunctionData({ abi: sushiSwapRouterAbi, data: unwrap })).toEqual({
      functionName: "unwrapWETH9",
      args: [FIL_GAS_TOP_UP_AMOUNT, RECIPIENT],
    });
  });

  it("rejects a top-up that does not guarantee the fixed 0.25 FIL", () => {
    expect(() => buildDepositPostHook(request, { ...topUp, minimumFil: topUp.minimumFil - 1n })).toThrow(
      "Invalid FIL gas top-up",
    );
  });
});

describe("planFilGasTopUp", () => {
  const filecoinSwap = { wfil: 1_000_000_000_000_000_000n, usdfc: 2_000_000_000_000_000_000n };

  it("prices enough USDFC to guarantee 0.25 FIL with headroom", () => {
    expect(planFilGasTopUp({ filecoinSwap, minimumDestinationAmount: 10n ** 19n }, now)).toEqual(topUp);
    expect(FIL_GAS_TOP_UP_AMOUNT).toBe(250_000_000_000_000_000n);
  });

  it("fails closed when the swap cannot be priced or would exceed a tenth of the deposit", () => {
    expect(planFilGasTopUp({ minimumDestinationAmount: 10n ** 19n }, now)).toBeUndefined();
    expect(
      planFilGasTopUp({ filecoinSwap: { wfil: 0n, usdfc: 1n }, minimumDestinationAmount: 10n ** 19n }, now),
    ).toBeUndefined();
    expect(
      planFilGasTopUp({ filecoinSwap: { wfil: 1n, usdfc: 0n }, minimumDestinationAmount: 10n ** 19n }, now),
    ).toBeUndefined();
    expect(planFilGasTopUp({ filecoinSwap, minimumDestinationAmount: 6n * 10n ** 18n }, now)).toBeUndefined();
  });
});

describe("source-native accounting", () => {
  it("sums source-network native costs and the reviewed network-fee maximum", () => {
    const quote = parseSquidDepositRoute(fakeRoute(), request, true, now);
    expect(getSourceNativeCosts(quote, 8453)).toEqual({ fees: 5_971_701_479_908n, gas: 3_596_394_000_000n });
    expect(getSourceNativeCosts(quote, 1)).toEqual({ fees: 0n, gas: 0n });
    const maximumNetworkFee = getDepositNetworkFeeMaximum(quote, 8453, USDC, 0n);
    expect(maximumNetworkFee).toBe(8_631_345_600_000n);
    expect(getDepositNetworkFeeMaximum(quote, 8453, USDC, 1n)).toBe(12_947_018_400_000n);
    expect(getDepositRequiredNativeBalance(quote, 8453, USDC, maximumNetworkFee)).toBe(
      5_971_701_479_908n + 8_631_345_600_000n,
    );
    expect(getDepositNetworkFeeMaximum(quote, 1, USDC, request.sourceAmount)).toBe(0n);
  });

  it("includes the source spend in native-token requirements and allows only one transaction", () => {
    const quote = parseSquidDepositRoute(fakeRoute(), request, true, now);
    const maximumNetworkFee = getDepositNetworkFeeMaximum(quote, 8453, NATIVE_TOKEN_ADDRESS, 0n);
    expect(maximumNetworkFee).toBe(4_315_672_800_000n);
    expect(getDepositRequiredNativeBalance(quote, 8453, NATIVE_TOKEN_ADDRESS, maximumNetworkFee)).toBe(
      request.sourceAmount + 5_971_701_479_908n + maximumNetworkFee,
    );
    expect(captureReviewedSquidDepositCaps(quote, NATIVE_TOKEN_ADDRESS).maxTransactionValue).toBe(
      request.sourceAmount + 5_971_701_479_908n,
    );
    expect(isNativeToken(NATIVE_TOKEN_ADDRESS)).toBe(true);
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

  it("prices the Filecoin swap leg and reports the USDFC left after a FIL top-up", () => {
    const topUpRequest = { ...request, filGasTopUp: topUp };
    const quote = parseSquidDepositRoute(
      fakeRoute({
        params: { postHook: buildDepositPostHook(request, topUp) },
        estimate: {
          actions: [
            {
              type: "swap",
              toChain: "314",
              fromAmount: "1000000000000000000",
              toAmount: "2000000000000000000",
              fromToken: { address: WFIL_ADDRESS },
              toToken: { address: USDFC },
            },
            { type: "custom", fromChain: "314", toChain: "314", provider: "Filecoin Pay" },
          ],
        },
      }),
      topUpRequest,
      true,
      now,
    );

    expect(quote.filecoinSwap).toEqual({ wfil: 10n ** 18n, usdfc: 2n * 10n ** 18n });
    expect(quote.destinationAmount).toBe(93_000_000_000_000_000_000n - topUp.spendUsdfc);
    expect(quote.minimumDestinationAmount).toBe(92_000_000_000_000_000_000n - topUp.spendUsdfc);
    expect(quote.filGasTopUp).toEqual(topUp);
  });

  it("rejects a FIL top-up that consumes the minimum destination amount", () => {
    const consumingTopUp = { ...topUp, spendUsdfc: 92_000_000_000_000_000_000n };
    expect(() =>
      parseSquidDepositRoute(
        fakeRoute({ params: { postHook: buildDepositPostHook(request, consumingTopUp) } }),
        { ...request, filGasTopUp: consumingTopUp },
        true,
        now,
      ),
    ).toThrow("FIL top-up exceeds destination amount");
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

  it("rejects executable spend, fee and minimum-output drift beyond the reviewed quote", () => {
    const reviewed = captureReviewedSquidDepositCaps(parseSquidDepositRoute(fakeRoute(), request, true, now), USDC);
    const executable = parseSquidDepositRoute(fakeRoute({ quoteOnly: false }), request, false, now);
    if (!isExecutableQuote(executable)) throw new Error("expected executable quote");
    expect(() => assertExecutableQuoteWithinReview(executable, reviewed)).not.toThrow();
    expect(() =>
      assertExecutableQuoteWithinReview(
        { ...executable, minimumDestinationAmount: reviewed.minimumDestinationAmount - 1n },
        reviewed,
      ),
    ).toThrow("minimum USDFC");
    expect(() =>
      assertExecutableQuoteWithinReview(
        { ...executable, fees: [{ ...executable.fees[0], amount: executable.fees[0].amount + 1n }] },
        reviewed,
      ),
    ).toThrow("route fee");
    expect(() =>
      assertExecutableQuoteWithinReview(
        { ...executable, transaction: { ...executable.transaction, value: reviewed.maxTransactionValue + 1n } },
        reviewed,
      ),
    ).toThrow("native route payment");
  });

  it.each([
    ["a sender mismatch", fakeRoute({ params: { fromAddress: RECIPIENT } }), true, "request identity mismatch"],
    ["a recipient mismatch", fakeRoute({ params: { toAddress: OWNER } }), true, "request identity mismatch"],
    ["a replaced post-hook", fakeRoute({ params: { postHook: { calls: [] } } }), true, "request identity mismatch"],
    [
      "a mislabelled custom action",
      fakeRoute({ estimate: { actions: [{ type: "custom", toChain: "314", provider: "Other" }] } }),
      true,
      "missing the Filecoin Pay deposit step",
    ],
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
    ["a zero minimum destination", fakeRoute({ estimate: { toAmountMin: "0" } }), true, "minimum destination amount"],
    ["a missing gas limit", fakeRoute({ quoteOnly: false, transaction: { gasLimit: null } }), false, "gas limit"],
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

  it("posts and validates the reviewed FIL top-up hook", async () => {
    const topUpRequest = { ...request, filGasTopUp: topUp };
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ route: fakeRoute({ params: { postHook: buildDepositPostHook(request, topUp) } }) }),
          { status: 200 },
        ),
    );

    await requestSquidDepositRoute(topUpRequest, { integratorId: "integrator", fetch, now }, { quoteOnly: true });

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.postHook).toEqual(JSON.parse(JSON.stringify(buildDepositPostHook(request, topUp))));
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

  it("rejects an expired FIL top-up before calling Squid", async () => {
    const fetch = vi.fn();
    await expect(
      requestSquidDepositRoute(
        { ...request, filGasTopUp: { ...topUp, deadline: 1n } },
        { integratorId: "integrator", fetch, now },
        { quoteOnly: false },
      ),
    ).rejects.toThrow("top-up quote expired");
    expect(fetch).not.toHaveBeenCalled();
  });
});
