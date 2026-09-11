import { NATIVE_TOKEN_ADDRESS, SQUID_ROUTER_ADDRESS } from "@filecoin-project/squid-evm-funding";
import { decodeFunctionData, encodeFunctionData, erc20Abi } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  assertExecutableQuoteWithinReview,
  buildDepositPostHook,
  captureReviewedSquidDepositCaps,
  estimateDepositNetworkFeeMaximum,
  FIL_GAS_TOP_UP_AMOUNT,
  getDepositRequiredNativeBalance,
  getDepositTransactionKinds,
  getSourceNativeCosts,
  isExecutableQuote,
  isNativeToken,
  NETWORK_FEE_REVIEW_HEADROOM_BPS,
  parseSquidDepositRoute,
  planFilGasTopUp,
  requestSquidDepositRoute,
  type SquidDepositFeeClient,
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
  minimumFil: 50_000_000_000_000_000n,
  spendUsdfc: 125_000_000_000_000_000n,
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

  it("swaps a fixed USDFC slice to at least 0.05 FIL before depositing the rest", () => {
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

  it("rejects a top-up that does not guarantee the fixed 0.05 FIL", () => {
    expect(() => buildDepositPostHook(request, { ...topUp, minimumFil: topUp.minimumFil - 1n })).toThrow(
      "FIL gas top-up must guarantee exactly 0.05 FIL",
    );
    expect(() => buildDepositPostHook(request, { ...topUp, spendUsdfc: 0n })).toThrow(
      "FIL gas top-up must spend a positive USDFC amount",
    );
    expect(() => buildDepositPostHook(request, { ...topUp, deadline: 0n })).toThrow(
      "FIL gas top-up deadline must be in the future",
    );
  });
});

describe("planFilGasTopUp", () => {
  const filecoinSwap = { wfil: 1_000_000_000_000_000_000n, usdfc: 2_000_000_000_000_000_000n };

  it("prices enough USDFC to guarantee 0.05 FIL with headroom", () => {
    expect(planFilGasTopUp({ filecoinSwap, minimumDestinationAmount: 10n ** 19n }, now)).toEqual(topUp);
    expect(FIL_GAS_TOP_UP_AMOUNT).toBe(50_000_000_000_000_000n);
  });

  it("fails closed when the swap cannot be priced or would exceed a tenth of the deposit", () => {
    expect(planFilGasTopUp({ minimumDestinationAmount: 10n ** 19n }, now)).toBeUndefined();
    expect(
      planFilGasTopUp({ filecoinSwap: { wfil: 0n, usdfc: 1n }, minimumDestinationAmount: 10n ** 19n }, now),
    ).toBeUndefined();
    expect(
      planFilGasTopUp({ filecoinSwap: { wfil: 1n, usdfc: 0n }, minimumDestinationAmount: 10n ** 19n }, now),
    ).toBeUndefined();
    expect(planFilGasTopUp({ filecoinSwap, minimumDestinationAmount: 10n ** 18n }, now)).toBeUndefined();
  });
});

describe("source-native accounting", () => {
  it("sums source-network native costs and the native balance a review requires", () => {
    const quote = parseSquidDepositRoute(fakeRoute(), request, true, now);
    expect(getSourceNativeCosts(quote, 8453)).toEqual({ fees: 5_971_701_479_908n, gas: 3_596_394_000_000n });
    expect(getSourceNativeCosts(quote, 1)).toEqual({ fees: 0n, gas: 0n });
    // The route's native fee carries the 50% drift headroom in both the requirement and the caps.
    expect(getDepositRequiredNativeBalance(quote, 8453, USDC, 8_631_345_600_000n)).toBe(
      8_957_552_219_862n + 8_631_345_600_000n,
    );
    expect(getDepositRequiredNativeBalance(quote, 8453, NATIVE_TOKEN_ADDRESS, 4_315_672_800_000n)).toBe(
      request.sourceAmount + 8_957_552_219_862n + 4_315_672_800_000n,
    );
    expect(captureReviewedSquidDepositCaps(quote, NATIVE_TOKEN_ADDRESS)).toEqual({
      sourceAmount: request.sourceAmount,
      minimumDestinationAmount: 92_000_000_000_000_000_000n,
      maxTransactionValue: request.sourceAmount + 8_957_552_219_862n,
      fees: { [`8453:${NATIVE_TOKEN_ADDRESS.toLowerCase()}`]: 8_957_552_219_862n },
      gasCosts: { [`8453:${NATIVE_TOKEN_ADDRESS.toLowerCase()}`]: 5_394_591_000_000n },
    });
    expect(isNativeToken(NATIVE_TOKEN_ADDRESS)).toBe(true);
  });

  it("lists the transactions the wallet will sign for the current allowance", () => {
    expect(getDepositTransactionKinds(USDC, request.sourceAmount, 0n)).toEqual(["approve", "route"]);
    expect(getDepositTransactionKinds(USDC, request.sourceAmount, 1n)).toEqual(["reset", "approve", "route"]);
    expect(getDepositTransactionKinds(USDC, request.sourceAmount, request.sourceAmount + 1n)).toEqual([
      "reset",
      "approve",
      "route",
    ]);
    expect(getDepositTransactionKinds(USDC, request.sourceAmount, request.sourceAmount)).toEqual(["route"]);
    expect(getDepositTransactionKinds(NATIVE_TOKEN_ADDRESS, request.sourceAmount, 0n)).toEqual(["route"]);
  });
});

describe("estimateDepositNetworkFeeMaximum", () => {
  const GWEI = 1_000_000_000n;
  const withHeadroom = (fee: bigint) => (fee * NETWORK_FEE_REVIEW_HEADROOM_BPS + 9_999n) / 10_000n;
  const approveData = (amount: bigint) =>
    encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [SQUID_ROUTER_ADDRESS, amount] });
  const ethereumRequest = { ...request, sourceChainId: 1 };
  const ethereumGasCost = (gasLimit?: string) => ({
    type: "executeCall",
    amount: "3596394000000",
    ...(gasLimit === undefined ? {} : { gasLimit }),
    token: { address: NATIVE_TOKEN_ADDRESS, chainId: 1, symbol: "ETH", decimals: 18 },
  });

  function fakeFeeClient({
    approveGas = 46_000n,
    feePerGas = 2n * GWEI,
    gasPrice = 3n * GWEI,
    legacy = false,
    resetGas = 30_000n,
    revertApproveWhileAllowed = true,
    totalFee,
  }: {
    approveGas?: bigint;
    feePerGas?: bigint;
    gasPrice?: bigint;
    legacy?: boolean;
    resetGas?: bigint;
    revertApproveWhileAllowed?: boolean;
    totalFee?: bigint;
  } = {}) {
    let allowanceStands = false;
    const client = {
      estimateFeesPerGas: vi.fn(async () => {
        if (legacy) throw new Error("EIP-1559 fees not supported");
        return { maxFeePerGas: feePerGas, maxPriorityFeePerGas: GWEI };
      }),
      estimateGas: vi.fn(async ({ data }: { data: string }) => {
        if (data === approveData(0n)) {
          allowanceStands = true;
          return resetGas;
        }
        if (allowanceStands && revertApproveWhileAllowed) throw new Error("execution reverted");
        return approveGas;
      }),
      getGasPrice: vi.fn(async () => gasPrice),
      ...(totalFee === undefined ? {} : { estimateTotalFee: vi.fn(async () => totalFee) }),
    };
    return client as unknown as SquidDepositFeeClient & {
      estimateGas: ReturnType<typeof vi.fn>;
      estimateTotalFee?: ReturnType<typeof vi.fn>;
    };
  }

  const gasLimitRoute = () =>
    parseSquidDepositRoute(
      fakeRoute({ params: { fromChain: "1" }, estimate: { gasCosts: [ethereumGasCost("599399")] } }),
      ethereumRequest,
      true,
      now,
    );

  const estimate = (
    client: SquidDepositFeeClient,
    allowance: bigint,
    overrides: { quote?: unknown; sourceChainId?: number; sourceToken?: `0x${string}` } = {},
  ) =>
    estimateDepositNetworkFeeMaximum({
      allowance,
      client,
      owner: OWNER,
      quote: (overrides.quote as ReturnType<typeof gasLimitRoute>) ?? gasLimitRoute(),
      sourceAmount: request.sourceAmount,
      sourceChainId: overrides.sourceChainId ?? 1,
      sourceToken: overrides.sourceToken ?? USDC,
      spender: SQUID_ROUTER_ADDRESS,
    });

  it("prices a simulated approval and the route's gas limit at the live fee, each with headroom", async () => {
    const client = fakeFeeClient();
    const approveFee = 46_000n * 2n * GWEI;
    const routeFee = 599_399n * 2n * GWEI;

    await expect(estimate(client, 0n)).resolves.toEqual({
      maximum: withHeadroom(approveFee) + withHeadroom(routeFee),
      transactions: [
        { kind: "approve", fee: withHeadroom(approveFee) },
        { kind: "route", fee: withHeadroom(routeFee) },
      ],
    });
    expect(client.estimateGas).toHaveBeenCalledWith({
      account: OWNER,
      to: USDC,
      data: approveData(request.sourceAmount),
      value: 0n,
    });
  });

  it("falls back to a fixed approval gas when the approval cannot be simulated behind a reset", async () => {
    const client = fakeFeeClient();
    const resetFee = 30_000n * 2n * GWEI;
    const approveFee = 65_000n * 2n * GWEI;
    const routeFee = 599_399n * 2n * GWEI;

    await expect(estimate(client, 1n)).resolves.toEqual({
      maximum: withHeadroom(resetFee) + withHeadroom(approveFee) + withHeadroom(routeFee),
      transactions: [
        { kind: "reset", fee: withHeadroom(resetFee) },
        { kind: "approve", fee: withHeadroom(approveFee) },
        { kind: "route", fee: withHeadroom(routeFee) },
      ],
    });
  });

  it("falls back to the fixed approval gas when the node refuses the simulation, as it does for a sender without gas money", async () => {
    const client = fakeFeeClient();
    client.estimateGas.mockRejectedValue(new Error("insufficient funds for gas * price + value"));
    const { transactions } = await estimate(client, 0n);
    expect(transactions[0]).toEqual({ kind: "approve", fee: withHeadroom(65_000n * 2n * GWEI) });
  });

  it("keeps Squid's route figure when the OP Stack total fee cannot be read", async () => {
    const client = fakeFeeClient({ totalFee: 500_000_000_000_000n });
    client.estimateTotalFee?.mockRejectedValue(new Error("oracle unavailable"));
    const baseRoute = parseSquidDepositRoute(
      fakeRoute({
        estimate: {
          gasCosts: [{ ...ethereumGasCost("599399"), token: { ...ethereumGasCost().token, chainId: 8453 } }],
        },
      }),
      request,
      true,
      now,
    );
    await expect(estimate(client, request.sourceAmount, { quote: baseRoute, sourceChainId: 8453 })).resolves.toEqual({
      maximum: withHeadroom(3_596_394_000_000n),
      transactions: [{ kind: "route", fee: withHeadroom(3_596_394_000_000n) }],
    });
  });

  it("keeps a simulated approval estimate behind a reset when the token allows it", async () => {
    const client = fakeFeeClient({ revertApproveWhileAllowed: false });
    const { transactions } = await estimate(client, 1n);
    expect(transactions[1]).toEqual({ kind: "approve", fee: withHeadroom(46_000n * 2n * GWEI) });
  });

  it("uses Squid's own estimate when it is higher or when no gas limit is reported", async () => {
    const lowFeeClient = fakeFeeClient({ feePerGas: 1n });
    const { transactions } = await estimate(lowFeeClient, request.sourceAmount);
    expect(transactions).toEqual([{ kind: "route", fee: withHeadroom(3_596_394_000_000n) }]);

    const withoutLimit = parseSquidDepositRoute(
      fakeRoute({ params: { fromChain: "1" }, estimate: { gasCosts: [ethereumGasCost()] } }),
      ethereumRequest,
      true,
      now,
    );
    await expect(estimate(fakeFeeClient(), request.sourceAmount, { quote: withoutLimit })).resolves.toEqual({
      maximum: withHeadroom(3_596_394_000_000n),
      transactions: [{ kind: "route", fee: withHeadroom(3_596_394_000_000n) }],
    });
  });

  it("falls back to the legacy gas price on chains without EIP-1559 fees", async () => {
    const client = fakeFeeClient({ legacy: true });
    const { transactions } = await estimate(client, 0n);
    expect(transactions).toEqual([
      { kind: "approve", fee: withHeadroom(46_000n * 3n * GWEI) },
      { kind: "route", fee: withHeadroom(599_399n * 3n * GWEI) },
    ]);
  });

  it("prices OP Stack transactions with the buffered total fee, as execution will", async () => {
    const client = fakeFeeClient({ totalFee: 500_000_000_000_000n });
    const baseRoute = parseSquidDepositRoute(
      fakeRoute({
        estimate: {
          gasCosts: [{ ...ethereumGasCost("599399"), token: { ...ethereumGasCost().token, chainId: 8453 } }],
        },
      }),
      request,
      true,
      now,
    );
    const { transactions } = await estimate(client, 0n, { quote: baseRoute, sourceChainId: 8453 });
    expect(transactions).toEqual([
      { kind: "approve", fee: withHeadroom(600_000_000_000_000n) },
      { kind: "route", fee: withHeadroom(600_000_000_000_000n) },
    ]);
    expect(client.estimateTotalFee).toHaveBeenCalledWith({
      account: OWNER,
      to: USDC,
      data: approveData(request.sourceAmount),
      value: 0n,
      gas: 46_000n,
      maxFeePerGas: 2n * GWEI,
      maxPriorityFeePerGas: GWEI,
    });
    expect(client.estimateTotalFee).toHaveBeenCalledWith(
      expect.objectContaining({ to: SQUID_ROUTER_ADDRESS, data: "0x", gas: 599_399n }),
    );
    await expect(estimate(fakeFeeClient(), 0n, { quote: baseRoute, sourceChainId: 8453 })).rejects.toThrow(
      "OP Stack total-fee accounting is unavailable",
    );
  });

  it("budgets only the route for a native source", async () => {
    const client = fakeFeeClient();
    await expect(estimate(client, 0n, { sourceToken: NATIVE_TOKEN_ADDRESS })).resolves.toEqual({
      maximum: withHeadroom(599_399n * 2n * GWEI),
      transactions: [{ kind: "route", fee: withHeadroom(599_399n * 2n * GWEI) }],
    });
    expect(client.estimateGas).not.toHaveBeenCalled();
  });

  it("fails closed without live fee data", async () => {
    const client = fakeFeeClient({ legacy: true, gasPrice: 0n });
    await expect(estimate(client, 0n)).rejects.toThrow("Live network fee data is unavailable");
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

  it("rechecks the FIL top-up safety limit against every returned route", () => {
    expect(() =>
      parseSquidDepositRoute(
        fakeRoute({
          params: { postHook: buildDepositPostHook(request, topUp) },
          estimate: { toAmount: "1000000000000000000", toAmountMin: "1000000000000000000" },
        }),
        { ...request, filGasTopUp: topUp },
        true,
        now,
      ),
    ).toThrow("FIL top-up exceeds safety limit");
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

  it("tolerates fee drift within the headroom and rejects spend, fee and minimum-output drift beyond it", () => {
    const reviewed = captureReviewedSquidDepositCaps(parseSquidDepositRoute(fakeRoute(), request, true, now), USDC);
    const executable = parseSquidDepositRoute(fakeRoute({ quoteOnly: false }), request, false, now);
    if (!isExecutableQuote(executable)) throw new Error("expected executable quote");
    expect(() => assertExecutableQuoteWithinReview(executable, reviewed)).not.toThrow();
    const feeCap = 8_957_552_219_862n;
    expect(() =>
      assertExecutableQuoteWithinReview(
        {
          ...executable,
          fees: [{ ...executable.fees[0], amount: feeCap }],
          transaction: { ...executable.transaction, value: feeCap },
        },
        reviewed,
      ),
    ).not.toThrow();
    expect(() =>
      assertExecutableQuoteWithinReview(
        { ...executable, minimumDestinationAmount: reviewed.minimumDestinationAmount - 1n },
        reviewed,
      ),
    ).toThrow("minimum USDFC");
    expect(() =>
      assertExecutableQuoteWithinReview(
        { ...executable, fees: [{ ...executable.fees[0], amount: feeCap + 1n }] },
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
