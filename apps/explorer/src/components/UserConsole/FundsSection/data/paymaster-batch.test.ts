import { decodeFunctionData, erc20Abi, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { CIRCLE_PAYMASTER_ADDRESS } from "./circle-paymaster";
import {
  BASE_QUOTER_V2_ADDRESS,
  BASE_SWAP_ROUTER_ADDRESS,
  BASE_WETH_ADDRESS,
  type BatchCall,
  buildPaymasterDepositCalls,
  quoteSwapInputCap,
  swapRouter02Abi,
} from "./paymaster-batch";

const payer = "0x1111111111111111111111111111111111111111" as const;
const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const squidRouter = "0xce16F69375520ab01377ce7B88f5BA8C48F8D666" as const;
const squidSpender = "0x3333333333333333333333333333333333333333" as const;
const routeData: Hex = "0xdeadbeef";
const nativeFee = 300_000_000_000_000n;

/** Each call as its target, function and arguments, with the router multicall opened up. */
function describeCall({ data, to, value }: BatchCall) {
  if (to === squidRouter) return { to, data, value };
  if (to === BASE_SWAP_ROUTER_ADDRESS) {
    const { args } = decodeFunctionData({ abi: swapRouter02Abi, data });
    const [inner] = args as readonly [readonly Hex[]];
    return {
      to,
      functionName: "multicall",
      calls: inner.map((call) => {
        const decoded = decodeFunctionData({ abi: swapRouter02Abi, data: call });
        return { functionName: decoded.functionName, args: decoded.args };
      }),
      value,
    };
  }
  const { args, functionName } = decodeFunctionData({ abi: erc20Abi, data });
  return { to, functionName, args, value };
}

describe("buildPaymasterDepositCalls", () => {
  it("buys the exact bridge fee, sends the route with it, and leaves no allowance behind", () => {
    const calls = buildPaymasterDepositCalls({
      maxSwapInput: 731_894n,
      payer,
      sourceAmount: 9_000_000n,
      sourceToken: usdc,
      transaction: { approvalSpender: squidSpender, data: routeData, target: squidRouter, value: nativeFee },
    });

    expect(calls.map(describeCall)).toEqual([
      { to: usdc, functionName: "approve", args: [BASE_SWAP_ROUTER_ADDRESS, 731_894n], value: 0n },
      {
        to: BASE_SWAP_ROUTER_ADDRESS,
        functionName: "multicall",
        calls: [
          {
            functionName: "exactOutputSingle",
            args: [
              {
                tokenIn: usdc,
                tokenOut: BASE_WETH_ADDRESS,
                fee: 500,
                recipient: "0x0000000000000000000000000000000000000002",
                amountOut: nativeFee,
                amountInMaximum: 731_894n,
                sqrtPriceLimitX96: 0n,
              },
            ],
          },
          { functionName: "unwrapWETH9", args: [nativeFee, payer] },
        ],
        value: 0n,
      },
      { to: usdc, functionName: "approve", args: [BASE_SWAP_ROUTER_ADDRESS, 0n], value: 0n },
      { to: usdc, functionName: "approve", args: [squidSpender, 9_000_000n], value: 0n },
      { to: squidRouter, data: routeData, value: nativeFee },
      { to: usdc, functionName: "approve", args: [CIRCLE_PAYMASTER_ADDRESS, 0n], value: 0n },
    ]);
  });

  it("skips the swap when the route carries no native fee, and approves the route target without a spender", () => {
    const calls = buildPaymasterDepositCalls({
      maxSwapInput: 0n,
      payer,
      sourceAmount: 9_000_000n,
      sourceToken: usdc,
      transaction: { data: routeData, target: squidRouter, value: 0n },
    });

    expect(calls.map(describeCall)).toEqual([
      { to: usdc, functionName: "approve", args: [squidRouter, 9_000_000n], value: 0n },
      { to: squidRouter, data: routeData, value: 0n },
      { to: usdc, functionName: "approve", args: [CIRCLE_PAYMASTER_ADDRESS, 0n], value: 0n },
    ]);
  });
});

describe("quoteSwapInputCap", () => {
  const clientQuoting = (amountIn: bigint) => ({
    simulateContract: vi.fn().mockResolvedValue({ result: [amountIn, 0n, 0, 0n] }),
  });

  it("quotes the exact-output swap on the USDC/WETH pool and adds 1% slippage", async () => {
    const client = clientQuoting(724_648n);

    await expect(quoteSwapInputCap(client, usdc, nativeFee)).resolves.toBe(724_648n + 7_247n);
    expect(client.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: BASE_QUOTER_V2_ADDRESS,
        functionName: "quoteExactOutputSingle",
        args: [{ amount: nativeFee, fee: 500, sqrtPriceLimitX96: 0n, tokenIn: usdc, tokenOut: BASE_WETH_ADDRESS }],
      }),
    );
  });

  it("reserves nothing without quoting when the route carries no native fee", async () => {
    const client = clientQuoting(724_648n);

    await expect(quoteSwapInputCap(client, usdc, 0n)).resolves.toBe(0n);
    expect(client.simulateContract).not.toHaveBeenCalled();
  });

  it("rounds the slippage up so a tiny quote still gets headroom", async () => {
    await expect(quoteSwapInputCap(clientQuoting(1n), usdc, 1n)).resolves.toBe(2n);
  });
});
