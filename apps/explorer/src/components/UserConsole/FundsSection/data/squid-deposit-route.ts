import {
  NATIVE_TOKEN_ADDRESS,
  SQUID_ROUTER_ADDRESS,
  type SquidClientOptions,
} from "@filecoin-project/squid-evm-funding";
import { type Address, encodeFunctionData, type Hash, type Hex, parseAbi } from "viem";
import { applyNetworkFeeExecutionBuffer } from "./squid-execution";

export const isNativeToken = (address: string) => address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();

export const FILECOIN_CHAIN_ID = 314;
export const SQUID_API_BASE_URL = "https://v2.api.squidrouter.com/v2";
export const DEFAULT_SQUID_SLIPPAGE = 1;

// Squid multicall call type that overwrites the argument at `payload.inputPos`
// with the full token balance the multicall holds when the hook runs, so the
// deposit moves exactly the USDFC that arrived rather than a pre-computed amount.
const FULL_TOKEN_BALANCE_CALL_TYPE = 1;
// Filecoin EVM gas units run roughly 100x Ethereum's. Squid prices destination
// gas separately and these estimates did not change the quoted fee.
const APPROVE_ESTIMATED_GAS = "15000000";
const DEPOSIT_ESTIMATED_GAS = "60000000";
const FIL_SWAP_ESTIMATED_GAS = "250000000";

export const SUSHI_V3_SWAP_ROUTER_ADDRESS: Address = "0x0389879e0156033202C44BF784ac18fC02edeE4f";
export const WFIL_ADDRESS: Address = "0x60E1773636CF5E4A227d9AC24F20fEca034ee25A";
export const WFIL_USDFC_POOL_FEE = 500;
export const FIL_GAS_TOP_UP_AMOUNT = 250_000_000_000_000_000n;
const FIL_GAS_TOP_UP_SPEND_HEADROOM_PERCENT = 25n;
const FIL_GAS_TOP_UP_MAX_SHARE_PERCENT = 10n;
const FIL_GAS_TOP_UP_DEADLINE_SECONDS = 7n * 24n * 60n * 60n;

export const squidDepositAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function deposit(address token, address to, uint256 amount)",
  "function accounts(address token, address owner) view returns (uint256 funds, uint256 lockupCurrent, uint256 lockupRate, uint256 lockupLastSettledAt)",
]);

export const sushiSwapRouterAbi = parseAbi([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(ExactInputSingleParams params) payable returns (uint256 amountOut)",
  "function unwrapWETH9(uint256 amountMinimum, address recipient) payable",
  "function multicall(bytes[] data) payable returns (bytes[] results)",
]);

export interface SquidDepositTarget {
  payments: Address;
  usdfc: Address;
  /** Filecoin Pay account credited by the deposit; also Squid's fallback address. */
  recipient: Address;
}

export interface FilGasTopUp {
  spendUsdfc: bigint;
  minimumFil: bigint;
  deadline: bigint;
}

export interface SquidDepositRouteRequest extends SquidDepositTarget {
  /** Wallet that pays the source token and signs on the source network. */
  owner: Address;
  sourceChainId: number;
  sourceToken: Address;
  sourceAmount: bigint;
  slippage?: number;
  filGasTopUp?: FilGasTopUp;
}

export interface SquidDepositCost {
  name: string;
  amount: bigint;
  amountUsd?: string;
  token: { address: Address; chainId: number; symbol: string; decimals: number };
}

export interface SquidDepositTransaction {
  target: Address;
  data: Hex;
  value: bigint;
  approvalSpender?: Address;
  gasLimit: bigint;
  expiresAt?: number;
}

export interface SquidDepositQuote {
  quoteId: string;
  sourceChainId: number;
  sourceAmount: bigint;
  destinationAmount: bigint;
  minimumDestinationAmount: bigint;
  sourceAmountUsd?: string;
  destinationAmountUsd?: string;
  priceImpactPercent?: string;
  estimatedSeconds?: number;
  fees: SquidDepositCost[];
  gasCosts: SquidDepositCost[];
  filecoinSwap?: { wfil: bigint; usdfc: bigint };
  filGasTopUp?: FilGasTopUp;
  transaction?: SquidDepositTransaction;
}

export type ExecutableSquidDepositQuote = SquidDepositQuote & { transaction: SquidDepositTransaction };

export interface ReviewedSquidDepositCaps {
  sourceAmount: bigint;
  minimumDestinationAmount: bigint;
  maxTransactionValue: bigint;
  fees: Readonly<Record<string, bigint>>;
  gasCosts: Readonly<Record<string, bigint>>;
}

export type SquidClient = SquidClientOptions;

/** What identifies a broadcast route to Squid's status API and to a later resume. */
export interface SquidDepositRef {
  transactionHash: Hash;
  sourceChainId: number;
  quoteId: string;
}

function buildFilGasTopUpCalls({ usdfc, recipient }: SquidDepositTarget, topUp: FilGasTopUp) {
  if (topUp.spendUsdfc <= 0n || topUp.minimumFil !== FIL_GAS_TOP_UP_AMOUNT || topUp.deadline <= 0n) {
    throw new Error("Invalid FIL gas top-up");
  }
  const swap = encodeFunctionData({
    abi: sushiSwapRouterAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: usdfc,
        tokenOut: WFIL_ADDRESS,
        fee: WFIL_USDFC_POOL_FEE,
        recipient: SUSHI_V3_SWAP_ROUTER_ADDRESS,
        deadline: topUp.deadline,
        amountIn: topUp.spendUsdfc,
        amountOutMinimum: topUp.minimumFil,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  const unwrap = encodeFunctionData({
    abi: sushiSwapRouterAbi,
    functionName: "unwrapWETH9",
    args: [topUp.minimumFil, recipient],
  });
  return [
    {
      chainType: "evm",
      callType: 0,
      target: usdfc,
      value: "0",
      callData: encodeFunctionData({
        abi: squidDepositAbi,
        functionName: "approve",
        args: [SUSHI_V3_SWAP_ROUTER_ADDRESS, topUp.spendUsdfc],
      }),
      payload: { tokenAddress: usdfc, inputPos: 0 },
      estimatedGas: APPROVE_ESTIMATED_GAS,
    },
    {
      chainType: "evm",
      callType: 0,
      target: SUSHI_V3_SWAP_ROUTER_ADDRESS,
      value: "0",
      callData: encodeFunctionData({ abi: sushiSwapRouterAbi, functionName: "multicall", args: [[swap, unwrap]] }),
      payload: { tokenAddress: usdfc, inputPos: 0 },
      estimatedGas: FIL_SWAP_ESTIMATED_GAS,
    },
  ];
}

export function planFilGasTopUp(
  quote: Pick<SquidDepositQuote, "filecoinSwap" | "minimumDestinationAmount">,
  now: () => number,
): FilGasTopUp | undefined {
  const swap = quote.filecoinSwap;
  if (!swap || swap.wfil === 0n || swap.usdfc === 0n) return undefined;
  const usdfcAtQuote = (FIL_GAS_TOP_UP_AMOUNT * swap.usdfc + swap.wfil - 1n) / swap.wfil;
  const spendUsdfc = (usdfcAtQuote * (100n + FIL_GAS_TOP_UP_SPEND_HEADROOM_PERCENT) + 99n) / 100n;
  if (spendUsdfc * 100n > quote.minimumDestinationAmount * FIL_GAS_TOP_UP_MAX_SHARE_PERCENT) return undefined;
  return {
    spendUsdfc,
    minimumFil: FIL_GAS_TOP_UP_AMOUNT,
    deadline: BigInt(Math.floor(now() / 1000)) + FIL_GAS_TOP_UP_DEADLINE_SECONDS,
  };
}

export function buildDepositPostHook({ payments, usdfc, recipient }: SquidDepositTarget, filGasTopUp?: FilGasTopUp) {
  const target = { payments, usdfc, recipient };
  return {
    chainType: "evm",
    provider: "Filecoin Pay",
    description: filGasTopUp
      ? "Add FIL for transaction fees and deposit USDFC into Filecoin Pay"
      : "Deposit USDFC into Filecoin Pay",
    logoURI: "https://pay.filecoin.cloud/usdfc-logo.svg",
    calls: [
      ...(filGasTopUp ? buildFilGasTopUpCalls(target, filGasTopUp) : []),
      {
        chainType: "evm",
        callType: FULL_TOKEN_BALANCE_CALL_TYPE,
        target: usdfc,
        value: "0",
        callData: encodeFunctionData({ abi: squidDepositAbi, functionName: "approve", args: [payments, 0n] }),
        payload: { tokenAddress: usdfc, inputPos: 1 },
        estimatedGas: APPROVE_ESTIMATED_GAS,
      },
      {
        chainType: "evm",
        callType: FULL_TOKEN_BALANCE_CALL_TYPE,
        target: payments,
        value: "0",
        callData: encodeFunctionData({ abi: squidDepositAbi, functionName: "deposit", args: [usdfc, recipient, 0n] }),
        payload: { tokenAddress: usdfc, inputPos: 2 },
        estimatedGas: DEPOSIT_ESTIMATED_GAS,
      },
    ],
  };
}

/** Native-token gas and route fees the paying wallet owes on the source network. */
export function getSourceNativeCosts(
  quote: Pick<SquidDepositQuote, "fees" | "gasCosts">,
  sourceChainId: number,
): { fees: bigint; gas: bigint } {
  const isSourceNative = (cost: SquidDepositCost) =>
    cost.token.chainId === sourceChainId && isNativeToken(cost.token.address);
  return {
    fees: quote.fees.filter(isSourceNative).reduce((total, cost) => total + cost.amount, 0n),
    gas: quote.gasCosts.filter(isSourceNative).reduce((total, cost) => total + cost.amount, 0n),
  };
}

function costKey(cost: SquidDepositCost): string {
  return `${cost.token.chainId}:${cost.token.address.toLowerCase()}`;
}

function costCaps(costs: readonly SquidDepositCost[]): Record<string, bigint> {
  return costs.reduce<Record<string, bigint>>((caps, cost) => {
    const key = costKey(cost);
    caps[key] = (caps[key] ?? 0n) + cost.amount;
    return caps;
  }, {});
}

export function captureReviewedSquidDepositCaps(
  quote: SquidDepositQuote,
  sourceToken: Address,
): ReviewedSquidDepositCaps {
  const sourceNative = isNativeToken(sourceToken);
  return {
    sourceAmount: quote.sourceAmount,
    minimumDestinationAmount: quote.minimumDestinationAmount,
    maxTransactionValue:
      getSourceNativeCosts(quote, quote.sourceChainId).fees + (sourceNative ? quote.sourceAmount : 0n),
    fees: costCaps(quote.fees),
    gasCosts: costCaps(quote.gasCosts),
  };
}

export function assertExecutableQuoteWithinReview(
  quote: ExecutableSquidDepositQuote,
  reviewed: ReviewedSquidDepositCaps,
): void {
  if (quote.sourceAmount !== reviewed.sourceAmount) throw new Error("The source spend changed after review");
  if (quote.minimumDestinationAmount < reviewed.minimumDestinationAmount) {
    throw new Error("The minimum USDFC received fell below the reviewed amount");
  }
  if (quote.transaction.value > reviewed.maxTransactionValue) {
    throw new Error("The native route payment exceeded the reviewed maximum");
  }
  for (const [label, actual, maximum] of [
    ["route fee", costCaps(quote.fees), reviewed.fees],
    ["network gas", costCaps(quote.gasCosts), reviewed.gasCosts],
  ] as const) {
    for (const [key, amount] of Object.entries(actual)) {
      if (amount > (maximum[key] ?? 0n)) throw new Error(`The ${label} exceeded the reviewed maximum`);
    }
  }
}

/**
 * Native balance the wallet needs before executing: route fees plus gas for the
 * approval and the swap with 50% headroom, matching the funding package's
 * measured fee drift between quote and execution.
 */
export function getDepositRequiredNativeBalance(
  quote: Pick<SquidDepositQuote, "fees" | "gasCosts" | "sourceAmount">,
  sourceChainId: number,
  sourceToken: Address,
  maximumNetworkFee: bigint,
): bigint {
  return (
    getSourceNativeCosts(quote, sourceChainId).fees +
    maximumNetworkFee +
    (isNativeToken(sourceToken) ? quote.sourceAmount : 0n)
  );
}

/** Mirrors the existing guided flow: one buffered route estimate per transaction the wallet may sign. */
export function getDepositNetworkFeeMaximum(
  quote: Pick<SquidDepositQuote, "gasCosts" | "sourceAmount">,
  sourceChainId: number,
  sourceToken: Address,
  allowance: bigint,
): bigint {
  const routeFee = getSourceNativeCosts({ fees: [], gasCosts: quote.gasCosts }, sourceChainId).gas;
  const transactionCount =
    isNativeToken(sourceToken) || allowance === quote.sourceAmount ? 1n : allowance > 0n ? 3n : 2n;
  return applyNetworkFeeExecutionBuffer(sourceChainId, routeFee) * transactionCount;
}

export async function requestSquidDepositRoute(
  request: SquidDepositRouteRequest,
  client: SquidClient,
  options: { quoteOnly: boolean },
): Promise<SquidDepositQuote> {
  if (request.sourceAmount <= 0n) throw new Error("Enter a source amount greater than zero");
  if (client.integratorId.trim() === "") throw new Error("Squid integrator ID is required");
  const now = client.now ?? Date.now;
  if (request.filGasTopUp && request.filGasTopUp.deadline <= BigInt(Math.floor(now() / 1000))) {
    throw new Error("The FIL gas top-up quote expired. Review a new quote.");
  }
  const slippage = request.slippage ?? DEFAULT_SQUID_SLIPPAGE;
  const fetcher = client.fetch ?? globalThis.fetch.bind(globalThis);
  const response = await fetcher(`${client.baseUrl ?? SQUID_API_BASE_URL}/route`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-integrator-id": client.integratorId },
    body: JSON.stringify({
      fromAddress: request.owner,
      toAddress: request.recipient,
      fromChain: String(request.sourceChainId),
      fromToken: request.sourceToken,
      fromAmount: request.sourceAmount.toString(),
      toChain: String(FILECOIN_CHAIN_ID),
      toToken: request.usdfc,
      slippage,
      quoteOnly: options.quoteOnly,
      postHook: buildDepositPostHook(request, request.filGasTopUp),
    }),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(`Squid quote failed (${response.status})${message ? `: ${message}` : ""}`);
  }
  const payload = (await response.json()) as { route?: unknown };
  return parseSquidDepositRoute(payload.route, { ...request, slippage }, options.quoteOnly, now);
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object";
}

function sameAddress(actual: unknown, expected: string): boolean {
  return typeof actual === "string" && actual.toLowerCase() === expected.toLowerCase();
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function parseAddress(value: unknown, label: string): Address {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`Invalid Squid route: ${label}`);
  return value as Address;
}

function parseAmount(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new Error(`Invalid Squid route: ${label}`);
  return BigInt(value);
}

function parseCosts(value: unknown, label: string): SquidDepositCost[] {
  if (!Array.isArray(value)) throw new Error(`Invalid Squid route: ${label}`);
  return value.map((item, index) => {
    if (!isRecord(item) || !isRecord(item.token)) throw new Error(`Invalid Squid route: ${label} ${index + 1}`);
    const name = label === "fee costs" ? item.name : item.type;
    const decimals = Number(item.token.decimals);
    if (!Number.isSafeInteger(decimals)) throw new Error(`Invalid Squid route: ${label} ${index + 1} decimals`);
    return {
      name: typeof name === "string" ? name : label,
      amount: parseAmount(item.amount, `${label} ${index + 1} amount`),
      ...(typeof item.amountUSD === "string" ? { amountUsd: item.amountUSD } : {}),
      token: {
        address: parseAddress(item.token.address, `${label} ${index + 1} token`),
        chainId: Number(item.token.chainId),
        symbol: typeof item.token.symbol === "string" ? item.token.symbol : "",
        decimals,
      },
    };
  });
}

function findFilecoinSwap(actions: unknown[], usdfc: Address): { wfil: bigint; usdfc: bigint } | undefined {
  for (const action of actions) {
    if (
      !isRecord(action) ||
      action.type !== "swap" ||
      action.toChain !== String(FILECOIN_CHAIN_ID) ||
      !isRecord(action.fromToken) ||
      !isRecord(action.toToken) ||
      !sameAddress(action.fromToken.address, WFIL_ADDRESS) ||
      !sameAddress(action.toToken.address, usdfc) ||
      typeof action.fromAmount !== "string" ||
      typeof action.toAmount !== "string" ||
      !/^\d+$/.test(action.fromAmount) ||
      !/^\d+$/.test(action.toAmount)
    ) {
      continue;
    }
    return { wfil: BigInt(action.fromAmount), usdfc: BigInt(action.toAmount) };
  }
  return undefined;
}

/**
 * Validates Squid's response against the request and the trusted router, and
 * requires the deposit hook to survive as the route's final step.
 */
export function parseSquidDepositRoute(
  route: unknown,
  request: SquidDepositRouteRequest & { slippage: number },
  quoteOnly: boolean,
  now: () => number,
): SquidDepositQuote {
  if (!isRecord(route) || !isRecord(route.params) || !isRecord(route.estimate)) {
    throw new Error("Invalid Squid route: missing route fields");
  }
  if (typeof route.quoteId !== "string" || route.quoteId.trim() === "") {
    throw new Error("Invalid Squid route: missing quote ID");
  }
  const { params, estimate } = route;
  const expectedPostHook = buildDepositPostHook(request, request.filGasTopUp);
  if (
    params.fromChain !== String(request.sourceChainId) ||
    params.toChain !== String(FILECOIN_CHAIN_ID) ||
    params.fromAmount !== request.sourceAmount.toString() ||
    params.slippage !== request.slippage ||
    params.quoteOnly !== quoteOnly ||
    !sameAddress(params.fromToken, request.sourceToken) ||
    !sameAddress(params.toToken, request.usdfc) ||
    !sameAddress(params.fromAddress, request.owner) ||
    !sameAddress(params.toAddress, request.recipient) ||
    canonicalJson(params.postHook) !== canonicalJson(expectedPostHook)
  ) {
    throw new Error("Invalid Squid route: request identity mismatch");
  }
  const actions = Array.isArray(estimate.actions) ? estimate.actions : [];
  const lastAction: unknown = actions.at(-1);
  if (
    !isRecord(lastAction) ||
    lastAction.type !== "custom" ||
    lastAction.toChain !== String(FILECOIN_CHAIN_ID) ||
    lastAction.provider !== expectedPostHook.provider
  ) {
    throw new Error("Squid route is missing the Filecoin Pay deposit step");
  }

  const rawDestinationAmount = parsePositiveAmount(estimate.toAmount, "destination amount");
  const rawMinimumDestinationAmount = parsePositiveAmount(estimate.toAmountMin, "minimum destination amount");
  const filecoinSwap = findFilecoinSwap(actions, request.usdfc);
  const topUpSpend = request.filGasTopUp?.spendUsdfc ?? 0n;
  const destinationAmount = rawDestinationAmount - topUpSpend;
  const minimumDestinationAmount = rawMinimumDestinationAmount - topUpSpend;
  if (destinationAmount <= 0n || minimumDestinationAmount <= 0n) {
    throw new Error("Invalid Squid route: FIL top-up exceeds destination amount");
  }
  if (topUpSpend * 100n > rawMinimumDestinationAmount * FIL_GAS_TOP_UP_MAX_SHARE_PERCENT) {
    throw new Error("Invalid Squid route: FIL top-up exceeds safety limit");
  }

  const quote: SquidDepositQuote = {
    quoteId: route.quoteId,
    sourceChainId: request.sourceChainId,
    sourceAmount: request.sourceAmount,
    destinationAmount,
    minimumDestinationAmount,
    ...(typeof estimate.fromAmountUSD === "string" ? { sourceAmountUsd: estimate.fromAmountUSD } : {}),
    ...(typeof estimate.toAmountUSD === "string" ? { destinationAmountUsd: estimate.toAmountUSD } : {}),
    ...(typeof estimate.aggregatePriceImpact === "string" ? { priceImpactPercent: estimate.aggregatePriceImpact } : {}),
    ...(typeof estimate.estimatedRouteDuration === "number"
      ? { estimatedSeconds: estimate.estimatedRouteDuration }
      : {}),
    fees: parseCosts(estimate.feeCosts, "fee costs"),
    gasCosts: parseCosts(estimate.gasCosts, "gas costs"),
    ...(filecoinSwap ? { filecoinSwap } : {}),
    ...(request.filGasTopUp ? { filGasTopUp: request.filGasTopUp } : {}),
  };
  if (quoteOnly) return quote;

  const transaction = route.transactionRequest;
  if (!isRecord(transaction)) throw new Error("Invalid Squid route: missing transaction request");
  const target = parseAddress(transaction.target, "target");
  const approvalSpender =
    transaction.approvalSpender == null ? undefined : parseAddress(transaction.approvalSpender, "approval spender");
  if (
    !sameAddress(target, SQUID_ROUTER_ADDRESS) ||
    (approvalSpender !== undefined && !sameAddress(approvalSpender, SQUID_ROUTER_ADDRESS))
  ) {
    throw new Error("Squid route failed trusted target or spender checks");
  }
  if (typeof transaction.data !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(transaction.data)) {
    throw new Error("Invalid Squid route: calldata");
  }
  const expiresAt = transaction.expiry == null ? undefined : Number(transaction.expiry);
  if (expiresAt !== undefined && (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now() / 1000))) {
    throw new Error("Invalid Squid route: expired route");
  }
  return {
    ...quote,
    transaction: {
      target,
      data: transaction.data as Hex,
      value: parseAmount(transaction.value ?? "0", "value"),
      ...(approvalSpender === undefined ? {} : { approvalSpender }),
      gasLimit: parsePositiveAmount(transaction.gasLimit, "gas limit"),
      ...(expiresAt === undefined ? {} : { expiresAt }),
    },
  };
}

function parsePositiveAmount(value: unknown, label: string): bigint {
  const amount = parseAmount(String(value ?? ""), label);
  if (amount === 0n) throw new Error(`Invalid Squid route: ${label}`);
  return amount;
}

async function readErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    try {
      const body: unknown = JSON.parse(text);
      if (isRecord(body)) {
        for (const key of ["message", "detail", "error"]) {
          const value = body[key];
          if (typeof value === "string") return value;
          if (isRecord(value) && typeof value.message === "string") return value.message;
        }
      }
    } catch {
      return text.trim() === "" ? undefined : text;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function isExecutableQuote(quote: SquidDepositQuote): quote is ExecutableSquidDepositQuote {
  return quote.transaction !== undefined;
}
