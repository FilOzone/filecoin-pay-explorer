import { type SourceToken, SQUID_ROUTER_ADDRESS, type SquidClientOptions } from "@filecoin-project/squid-evm-funding";
import { type Address, encodeFunctionData, type Hash, type Hex, parseAbi } from "viem";
import { isNativeToken } from "./guided-top-up";

export const FILECOIN_CHAIN_ID = 314;
export const SQUID_API_BASE_URL = "https://v2.api.squidrouter.com/v2";
export const DEFAULT_SQUID_SLIPPAGE = 1;
// Below this many USDFC per USDC the quote is flagged so the haircut is visible.
export const UNFAVORABLE_RATE_THRESHOLD = 0.97;

// Squid multicall call type that overwrites the argument at `payload.inputPos`
// with the full token balance the multicall holds when the hook runs, so the
// deposit moves exactly the USDFC that arrived rather than a pre-computed amount.
const FULL_TOKEN_BALANCE_CALL_TYPE = 1;
// Filecoin EVM gas units run roughly 100x Ethereum's. Squid prices destination
// gas separately and these estimates did not change the quoted fee.
const APPROVE_ESTIMATED_GAS = "15000000";
const DEPOSIT_ESTIMATED_GAS = "60000000";
const FIL_SWAP_ESTIMATED_GAS = "250000000";

// SushiSwap V3 on Filecoin, the venue Squid's own route already swaps through.
// The router is the Uniswap-style SwapRouter (WETH9 = WFIL), so one multicall
// can swap USDFC to WFIL and unwrap it straight to the wallet.
export const SUSHI_V3_SWAP_ROUTER_ADDRESS: Address = "0x0389879e0156033202C44BF784ac18fC02edeE4f";
export const WFIL_ADDRESS: Address = "0x60E1773636CF5E4A227d9AC24F20fEca034ee25A";
export const WFIL_USDFC_POOL_FEE = 500;
/** Native FIL a deposit sets aside for the recipient's future gas. */
export const FIL_GAS_TOP_UP_AMOUNT = 10n ** 17n;
// The top-up only needs to land in the right ballpark: spend a quarter more USDFC
// than the quoted rate implies, and accept getting 30% less FIL than aimed for,
// so a price move between quote and settlement does not fail the whole deposit.
const FIL_GAS_TOP_UP_SPEND_HEADROOM_PERCENT = 25n;
const FIL_GAS_TOP_UP_MINIMUM_PERCENT = 70n;
// Never let the gas top-up eat more than this share of the arriving USDFC.
const FIL_GAS_TOP_UP_MAX_SHARE_PERCENT = 10n;
// Axelar can hold a route for a long time; the swap deadline must outlive it.
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

/** A slice of the arriving USDFC swapped to native FIL for the recipient's gas. */
export interface FilGasTopUp {
  /** USDFC taken out of the deposit and sold for FIL. */
  spendUsdfc: bigint;
  /** Least FIL the swap may return before it reverts. */
  minimumFil: bigint;
  /** Unix seconds after which the swap reverts. */
  deadline: bigint;
}

export interface SquidDepositRouteRequest extends SquidDepositTarget {
  /** Wallet that pays the USDC and signs on the source network. */
  owner: Address;
  sourceChainId: number;
  sourceToken: Address;
  sourceAmount: bigint;
  slippage?: number;
  /** When set, the post-hook sends this much FIL to the recipient before depositing the rest. */
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
  gasLimit?: bigint;
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
  /** The route's WFIL to USDFC leg on Filecoin, which prices the FIL gas top-up. */
  filecoinSwap?: { wfil: bigint; usdfc: bigint };
  transaction?: SquidDepositTransaction;
}

export type ExecutableSquidDepositQuote = SquidDepositQuote & { transaction: SquidDepositTransaction };

export type SquidClient = SquidClientOptions;

/** What identifies a broadcast route to Squid's status API and to a later resume. */
export interface SquidDepositRef {
  transactionHash: Hash;
  sourceChainId: number;
  quoteId: string;
}

/**
 * Sells `spendUsdfc` for WFIL on SushiSwap and unwraps it to the recipient in
 * one router multicall, so the multicall never holds native FIL itself.
 */
function buildFilGasTopUpCalls({ usdfc, recipient }: SquidDepositTarget, topUp: FilGasTopUp) {
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

/**
 * Sizes the FIL top-up from the quote's own WFIL to USDFC leg. Skipped when the
 * quote has no such leg to price it from, or when it would take more than a
 * small share of the deposit.
 */
export function planFilGasTopUp(
  quote: Pick<SquidDepositQuote, "filecoinSwap" | "minimumDestinationAmount">,
  now: () => number,
): FilGasTopUp | undefined {
  const swap = quote.filecoinSwap;
  if (!swap || swap.wfil === 0n) return undefined;
  const usdfcAtQuote = (FIL_GAS_TOP_UP_AMOUNT * swap.usdfc + swap.wfil - 1n) / swap.wfil;
  const spendUsdfc = (usdfcAtQuote * (100n + FIL_GAS_TOP_UP_SPEND_HEADROOM_PERCENT)) / 100n;
  if (spendUsdfc * 100n > quote.minimumDestinationAmount * FIL_GAS_TOP_UP_MAX_SHARE_PERCENT) return undefined;
  return {
    spendUsdfc,
    minimumFil: (FIL_GAS_TOP_UP_AMOUNT * FIL_GAS_TOP_UP_MINIMUM_PERCENT) / 100n,
    deadline: BigInt(Math.floor(now() / 1000)) + FIL_GAS_TOP_UP_DEADLINE_SECONDS,
  };
}

/** USDFC left for the deposit once the FIL top-up has taken its share. */
export function getDepositAfterFilGasTopUp(amount: bigint, topUp: FilGasTopUp | undefined): bigint {
  if (!topUp) return amount;
  return amount > topUp.spendUsdfc ? amount - topUp.spendUsdfc : 0n;
}

export function buildDepositPostHook(target: SquidDepositTarget, filGasTopUp?: FilGasTopUp) {
  const { payments, usdfc, recipient } = target;
  return {
    chainType: "evm",
    provider: "Filecoin Pay",
    description: filGasTopUp
      ? "Set aside FIL for gas, deposit USDFC into Filecoin Pay"
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

export function isUsdcLikeSymbol(symbol: string): boolean {
  return /usdb?c/i.test(symbol);
}

/** USDC variants Squid lists for a network, plain USDC first. */
export function selectUsdcTokens<T extends SourceToken>(tokens: readonly T[]): T[] {
  return tokens
    .filter((token) => isUsdcLikeSymbol(token.symbol) && !isNativeToken(token.token))
    .sort((a, b) => Number(b.symbol.toUpperCase() === "USDC") - Number(a.symbol.toUpperCase() === "USDC"));
}

export function getUsdfcPerSourceUnit(
  quote: Pick<SquidDepositQuote, "sourceAmount" | "destinationAmount">,
  sourceDecimals: number,
): number {
  if (quote.sourceAmount === 0n) return 0;
  const usdc = Number(quote.sourceAmount) / 10 ** sourceDecimals;
  const usdfc = Number(quote.destinationAmount) / 1e18;
  return usdfc / usdc;
}

export function isUnfavorableRate(rate: number): boolean {
  return rate < UNFAVORABLE_RATE_THRESHOLD;
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

/**
 * Native balance the wallet needs before executing: route fees plus gas for the
 * approval and the swap with 50% headroom, matching the funding package's
 * measured fee drift between quote and execution.
 */
export function getDepositRequiredNativeBalance(
  quote: Pick<SquidDepositQuote, "fees" | "gasCosts">,
  sourceChainId: number,
  approvalGasFee: bigint,
): bigint {
  const { fees, gas } = getSourceNativeCosts(quote, sourceChainId);
  const gasWithApproval = gas + approvalGasFee;
  return fees + gasWithApproval + gasWithApproval / 2n;
}

export async function requestSquidDepositRoute(
  request: SquidDepositRouteRequest,
  client: SquidClient,
  options: { quoteOnly: boolean },
): Promise<SquidDepositQuote> {
  if (request.sourceAmount <= 0n) throw new Error("Enter an amount greater than zero");
  if (client.integratorId.trim() === "") throw new Error("Squid integrator ID is required");
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
  return parseSquidDepositRoute(payload.route, { ...request, slippage }, options.quoteOnly, client.now ?? Date.now);
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object";
}

function sameAddress(actual: unknown, expected: string): boolean {
  return typeof actual === "string" && actual.toLowerCase() === expected.toLowerCase();
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

/** The swap leg that turns WFIL into USDFC on Filecoin, if the route has one. */
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
  if (
    params.fromChain !== String(request.sourceChainId) ||
    params.toChain !== String(FILECOIN_CHAIN_ID) ||
    params.fromAmount !== request.sourceAmount.toString() ||
    params.slippage !== request.slippage ||
    params.quoteOnly !== quoteOnly ||
    !sameAddress(params.fromToken, request.sourceToken) ||
    !sameAddress(params.toToken, request.usdfc) ||
    !sameAddress(params.fromAddress, request.owner) ||
    !sameAddress(params.toAddress, request.recipient)
  ) {
    throw new Error("Invalid Squid route: request identity mismatch");
  }
  const actions = Array.isArray(estimate.actions) ? estimate.actions : [];
  const lastAction: unknown = actions.at(-1);
  if (!isRecord(lastAction) || lastAction.type !== "custom" || lastAction.toChain !== String(FILECOIN_CHAIN_ID)) {
    throw new Error("Squid route is missing the Filecoin Pay deposit step");
  }
  const filecoinSwap = findFilecoinSwap(actions, request.usdfc);

  const quote: SquidDepositQuote = {
    quoteId: route.quoteId,
    sourceChainId: request.sourceChainId,
    sourceAmount: request.sourceAmount,
    destinationAmount: parseAmount(estimate.toAmount, "destination amount"),
    minimumDestinationAmount: parseAmount(estimate.toAmountMin, "minimum destination amount"),
    ...(typeof estimate.fromAmountUSD === "string" ? { sourceAmountUsd: estimate.fromAmountUSD } : {}),
    ...(typeof estimate.toAmountUSD === "string" ? { destinationAmountUsd: estimate.toAmountUSD } : {}),
    ...(typeof estimate.aggregatePriceImpact === "string" ? { priceImpactPercent: estimate.aggregatePriceImpact } : {}),
    ...(typeof estimate.estimatedRouteDuration === "number"
      ? { estimatedSeconds: estimate.estimatedRouteDuration }
      : {}),
    fees: parseCosts(estimate.feeCosts, "fee costs"),
    gasCosts: parseCosts(estimate.gasCosts, "gas costs"),
    ...(filecoinSwap === undefined ? {} : { filecoinSwap }),
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
      ...(transaction.gasLimit == null ? {} : { gasLimit: parseAmount(String(transaction.gasLimit), "gas limit") }),
      ...(expiresAt === undefined ? {} : { expiresAt }),
    },
  };
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
