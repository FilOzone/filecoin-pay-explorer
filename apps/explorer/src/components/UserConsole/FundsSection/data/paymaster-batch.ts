import { type Address, encodeFunctionData, erc20Abi, type Hex, type PublicClient, parseAbi } from "viem";
import { CIRCLE_PAYMASTER_ADDRESS } from "./circle-paymaster";
import { ceilDiv, type SquidDepositTransaction } from "./squid-deposit-route";

/** Uniswap v3 SwapRouter02 on Base: swaps and unwraps in one multicall, with plain ERC-20 approvals. */
export const BASE_SWAP_ROUTER_ADDRESS: Address = "0x2626664c2603336E57B271c5C0b26F421741e481";
export const BASE_QUOTER_V2_ADDRESS: Address = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";
export const BASE_WETH_ADDRESS: Address = "0x4200000000000000000000000000000000000006";
/** The 0.05% USDC/WETH pool, Base's deepest for the pair. */
const BASE_USDC_WETH_POOL_FEE = 500;
/** The pool can move before inclusion; past this the swap reverts the whole operation instead of overpaying. */
const SWAP_INPUT_SLIPPAGE_BIPS = 100n;
// SwapRouter02's recipient marker for the router itself, so the WETH stays there for `unwrapWETH9`.
const ROUTER_ADDRESS_THIS: Address = "0x0000000000000000000000000000000000000002";

export const swapRouter02Abi = parseAbi([
  "struct ExactOutputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountOut; uint256 amountInMaximum; uint160 sqrtPriceLimitX96; }",
  "function exactOutputSingle(ExactOutputSingleParams params) payable returns (uint256 amountIn)",
  "function unwrapWETH9(uint256 amountMinimum, address recipient) payable",
  "function multicall(bytes[] data) payable returns (bytes[] results)",
]);

const quoterV2Abi = parseAbi([
  "struct QuoteExactOutputSingleParams { address tokenIn; address tokenOut; uint256 amount; uint24 fee; uint160 sqrtPriceLimitX96; }",
  "function quoteExactOutputSingle(QuoteExactOutputSingleParams params) returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

/** Most `sourceToken` the swap may spend to buy exactly `nativeFee` wei: the quoted input plus slippage. */
export async function quoteSwapInputCap(
  client: Pick<PublicClient, "simulateContract">,
  sourceToken: Address,
  nativeFee: bigint,
): Promise<bigint> {
  if (nativeFee === 0n) return 0n;
  // QuoterV2 runs the swap and reverts it internally, so its quotes are not `view` and must be simulated.
  const { result } = await client.simulateContract({
    abi: quoterV2Abi,
    address: BASE_QUOTER_V2_ADDRESS,
    args: [
      {
        amount: nativeFee,
        fee: BASE_USDC_WETH_POOL_FEE,
        sqrtPriceLimitX96: 0n,
        tokenIn: sourceToken,
        tokenOut: BASE_WETH_ADDRESS,
      },
    ],
    functionName: "quoteExactOutputSingle",
  });
  const [amountIn] = result;
  return amountIn + ceilDiv(amountIn * SWAP_INPUT_SLIPPAGE_BIPS, 10_000n);
}

export type BatchCall = { to: Address; data: Hex; value: bigint };

interface PaymasterDepositBatchInput {
  /** The delegated account; it receives the unwrapped ETH the route spends. */
  payer: Address;
  sourceToken: Address;
  sourceAmount: bigint;
  /** Its `value` is the bridge fee, bought exactly with at most `maxSwapInput` of the source token. */
  transaction: Pick<SquidDepositTransaction, "target" | "data" | "value" | "approvalSpender">;
  maxSwapInput: bigint;
}

/** The calls one user operation runs, in order; every allowance it grants ends at 0. */
export function buildPaymasterDepositCalls({
  maxSwapInput,
  payer,
  sourceAmount,
  sourceToken,
  transaction,
}: PaymasterDepositBatchInput): BatchCall[] {
  const approve = (spender: Address, amount: bigint): BatchCall => ({
    to: sourceToken,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }),
    value: 0n,
  });
  const routeCalls = [
    approve(transaction.approvalSpender ?? transaction.target, sourceAmount),
    { to: transaction.target, data: transaction.data, value: transaction.value },
    // The paymaster refunds by transfer rather than pulling, so the permit's leftover allowance would linger.
    approve(CIRCLE_PAYMASTER_ADDRESS, 0n),
  ];
  if (transaction.value === 0n) return routeCalls;

  const swap = encodeFunctionData({
    abi: swapRouter02Abi,
    functionName: "exactOutputSingle",
    args: [
      {
        tokenIn: sourceToken,
        tokenOut: BASE_WETH_ADDRESS,
        fee: BASE_USDC_WETH_POOL_FEE,
        recipient: ROUTER_ADDRESS_THIS,
        amountOut: transaction.value,
        amountInMaximum: maxSwapInput,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  const unwrap = encodeFunctionData({
    abi: swapRouter02Abi,
    functionName: "unwrapWETH9",
    args: [transaction.value, payer],
  });
  return [
    approve(BASE_SWAP_ROUTER_ADDRESS, maxSwapInput),
    {
      to: BASE_SWAP_ROUTER_ADDRESS,
      data: encodeFunctionData({ abi: swapRouter02Abi, functionName: "multicall", args: [[swap, unwrap]] }),
      value: 0n,
    },
    approve(BASE_SWAP_ROUTER_ADDRESS, 0n),
    ...routeCalls,
  ];
}
