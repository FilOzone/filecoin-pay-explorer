import {
  type Account,
  type Address,
  encodeFunctionData,
  erc20Abi,
  type Hash,
  type Hex,
  isHash,
  type PublicClient,
  parseEventLogs,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { formatAddress } from "@/utils/formatter";
import { readSourceTokenState } from "./source-token-balances";
import {
  type ExecutableSquidDepositQuote,
  FILECOIN_CHAIN_ID,
  isNativeToken,
  SQUID_API_BASE_URL,
  type SquidClient,
  type SquidDepositRef,
  type SquidDepositRouteRequest,
  type SquidDepositTarget,
  squidDepositAbi,
} from "./squid-deposit-route";
import { applyNetworkFeeExecutionBuffer, isOpStackChain } from "./squid-execution";

export type SquidDepositStage = "approving" | "swap-requested" | "swap-broadcast" | "bridging" | "verifying";
export type SquidDepositStatus = "pending" | "success" | "failed" | "hook-failed" | "needs-gas";
export type SquidDepositFailure = "failed" | "hook-failed" | "needs-gas" | "reverted" | "timeout";

export class SquidDepositError extends Error {
  readonly reason: SquidDepositFailure;
  readonly transactionHash?: Hash;

  constructor(message: string, reason: SquidDepositFailure, transactionHash?: Hash) {
    super(message);
    this.name = "SquidDepositError";
    this.reason = reason;
    this.transactionHash = transactionHash;
  }
}

export type SquidDepositWalletClient = Pick<
  WalletClient,
  "getChainId" | "prepareTransactionRequest" | "sendTransaction"
> & {
  account: Account;
};

export type SquidDepositSourceClient = Pick<
  PublicClient,
  "getBalance" | "getChainId" | "multicall" | "readContract" | "waitForTransactionReceipt"
> & {
  estimateTotalFee?: (request: {
    account: Address;
    to: Address;
    data: Hex;
    value: bigint;
    nonce: number;
    gas: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    gasPrice?: bigint;
  }) => Promise<bigint>;
};
export type SquidDepositDestinationClient = Pick<PublicClient, "readContract" | "waitForTransactionReceipt">;

export interface SquidDepositResult {
  transactionHash: Hash;
  destinationTransactionHash: Hash;
  depositedAmount: bigint;
}

interface PollingOptions {
  sleep?: (milliseconds: number) => Promise<void>;
  pollIntervalMs?: number;
  /** Bound on one status request; a request that never settles counts as a failed attempt. */
  statusRequestTimeoutMs?: number;
  /** Squid status polls before giving up; the route itself is quoted at ~90s. */
  maxStatusAttempts?: number;
  /** Consecutive failed status requests tolerated before the outage is reported. */
  maxStatusFailures?: number;
  /** Filecoin receipt wait periods after Squid reports success. */
  maxVerifyAttempts?: number;
}

export interface ExecuteSquidDepositInput extends PollingOptions {
  quote: ExecutableSquidDepositQuote;
  request: SquidDepositRouteRequest;
  walletClient: SquidDepositWalletClient;
  sourceClient: SquidDepositSourceClient;
  destinationClient: SquidDepositDestinationClient;
  squid: SquidClient;
  /** Whether the reviewed allowance required an approval transaction. */
  approvalRequired: boolean;
  /** Whether the reviewed allowance required a zero-reset before approval. */
  approvalResetRequired: boolean;
  /** Maximum cumulative source-network transaction fee the user reviewed. */
  maxNativeFee: bigint;
  /** Reads the provider/UI account immediately before every signature. */
  getCurrentOwner(): Promise<Address | undefined>;
  /** Fails when recipient, source wallet, chain or token no longer match the reviewed screen. */
  assertCurrentContext(): void;
  onStage?: (stage: SquidDepositStage, transactionHash?: Hash) => void;
  /** Persists a durable marker synchronously before asking the wallet to submit the route. */
  onSwapAttempt?: (fundsBefore: bigint) => void;
  /** Fires once the route is broadcast, with what a resume needs to finish it. */
  onBroadcast?: (broadcast: { transactionHash: Hash; fundsBefore: bigint }) => void;
}

function assertSignerUnchanged(
  providerOwner: Address | undefined,
  walletChainId: number,
  request: Pick<SquidDepositRouteRequest, "owner" | "sourceChainId">,
  rpcChainId = request.sourceChainId,
): void {
  if (!providerOwner || providerOwner.toLowerCase() !== request.owner.toLowerCase()) {
    throw new Error("Wallet account changed before signing");
  }
  if (walletChainId !== request.sourceChainId || rpcChainId !== request.sourceChainId) {
    throw new Error("Source network changed before signing");
  }
}

async function assertFreshSigningState({
  assertCurrentContext,
  getCurrentOwner,
  quote,
  request,
  requireAllowance,
  sourceClient,
  walletClient,
}: Pick<
  ExecuteSquidDepositInput,
  "assertCurrentContext" | "getCurrentOwner" | "quote" | "request" | "sourceClient" | "walletClient"
> & {
  requireAllowance: boolean;
}): Promise<{ allowance: bigint; nativeBalance: bigint }> {
  assertCurrentContext();
  const isNativeSource = isNativeToken(request.sourceToken);
  const [providerOwner, walletChainId, rpcChainId, state] = await Promise.all([
    getCurrentOwner(),
    walletClient.getChainId(),
    sourceClient.getChainId(),
    readSourceTokenState(
      sourceClient,
      request.owner,
      request.sourceToken,
      quote.transaction.approvalSpender ?? quote.transaction.target,
    ),
  ]);
  const { native: nativeBalance, token: tokenBalance } = state;
  // A native payment needs no approval, so it counts as already allowed.
  const allowance = isNativeSource ? request.sourceAmount : state.allowance;
  assertCurrentContext();
  assertSignerUnchanged(providerOwner, walletChainId, request, rpcChainId);
  if (tokenBalance < request.sourceAmount) throw new Error("Source-token balance no longer covers the reviewed spend");
  if (requireAllowance && allowance !== request.sourceAmount)
    throw new Error("Source-token allowance does not match the reviewed spend after approval");
  return { allowance, nativeBalance };
}

async function assertCurrentWallet({
  assertCurrentContext,
  getCurrentOwner,
  request,
  walletClient,
}: Pick<ExecuteSquidDepositInput, "assertCurrentContext" | "getCurrentOwner" | "request" | "walletClient">) {
  assertCurrentContext();
  const [providerOwner, walletChainId] = await Promise.all([getCurrentOwner(), walletClient.getChainId()]);
  assertCurrentContext();
  assertSignerUnchanged(providerOwner, walletChainId, request);
}

async function prepareTransaction(
  sourceClient: SquidDepositSourceClient,
  walletClient: SquidDepositWalletClient,
  sourceChainId: number,
  transaction: { to: Address; data: Hex; value: bigint },
) {
  const request = await walletClient.prepareTransactionRequest({
    account: walletClient.account,
    chain: undefined,
    ...transaction,
  });
  const { gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas, nonce } = request;
  const hasLegacyFee = gasPrice !== undefined && gasPrice > 0n;
  const hasEip1559Fee =
    maxFeePerGas !== undefined &&
    maxPriorityFeePerGas !== undefined &&
    maxFeePerGas > 0n &&
    maxPriorityFeePerGas >= 0n &&
    maxPriorityFeePerGas <= maxFeePerGas;
  if (gas === undefined || gas <= 0n || (!hasLegacyFee && !hasEip1559Fee)) {
    throw new Error("Complete execution fee is unavailable");
  }
  if (!isOpStackChain(sourceChainId)) {
    return { fee: gas * (hasLegacyFee ? gasPrice : (maxFeePerGas as bigint)), request };
  }
  if (!sourceClient.estimateTotalFee || !Number.isSafeInteger(nonce)) {
    throw new Error("OP Stack total-fee accounting is unavailable");
  }
  const totalFee = await sourceClient.estimateTotalFee({
    account: walletClient.account.address,
    to: transaction.to,
    data: transaction.data,
    value: transaction.value,
    nonce,
    gas,
    ...(gasPrice === undefined ? {} : { gasPrice }),
    ...(maxFeePerGas === undefined ? {} : { maxFeePerGas }),
    ...(maxPriorityFeePerGas === undefined ? {} : { maxPriorityFeePerGas }),
  });
  return { fee: applyNetworkFeeExecutionBuffer(sourceChainId, totalFee), request };
}

function assertFeeWithinReview(feeSoFar: bigint, fee: bigint, maxNativeFee: bigint) {
  if (feeSoFar + fee > maxNativeFee) throw new Error("Native gas exceeded the reviewed maximum");
}

function assertNativeBalance(nativeBalance: bigint, fee: bigint, value: bigint) {
  if (nativeBalance < fee + value) throw new Error("Native balance no longer covers gas and route fees");
}

export interface AwaitSquidDepositInput extends PollingOptions, SquidDepositRef {
  target: SquidDepositTarget;
  fundsBefore: bigint;
  minimumDestinationAmount: bigint;
  destinationClient: SquidDepositDestinationClient;
  squid: SquidClient;
  onStage?: (stage: SquidDepositStage, transactionHash?: Hash) => void;
}

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
/** Squid answers status requests in well under a second; a request still open after this is stalled. */
export const STATUS_REQUEST_TIMEOUT_MS = 15_000;

export function readFilecoinPayFunds(
  client: SquidDepositDestinationClient,
  { payments, usdfc, recipient }: SquidDepositTarget,
): Promise<bigint> {
  return client
    .readContract({ abi: squidDepositAbi, address: payments, args: [usdfc, recipient], functionName: "accounts" })
    .then(([funds]) => funds);
}

export async function fetchSquidDepositStatus(
  input: SquidDepositRef,
  client: SquidClient,
  requestTimeoutMs = STATUS_REQUEST_TIMEOUT_MS,
): Promise<{ status: SquidDepositStatus; destinationTransactionHash?: Hash }> {
  const fetcher = client.fetch ?? globalThis.fetch.bind(globalThis);
  const query = new URLSearchParams({
    transactionId: input.transactionHash,
    fromChainId: String(input.sourceChainId),
    toChainId: String(FILECOIN_CHAIN_ID),
    quoteId: input.quoteId,
  });
  // The poll loop bounds attempts and failures, but only for requests that settle;
  // an abort turns a hung request into one more failed attempt.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Squid status request timed out")), requestTimeoutMs);
  let body: { squidTransactionStatus?: unknown; status?: unknown; toChain?: { transactionId?: unknown } };
  try {
    const response = await fetcher(`${client.baseUrl ?? SQUID_API_BASE_URL}/status?${query}`, {
      headers: { "x-integrator-id": client.integratorId },
      signal: controller.signal,
    });
    // Squid answers 404 until its indexer sees the source transaction.
    if (response.status === 404) return { status: "pending" };
    if (!response.ok) throw new Error(`Squid status request failed (${response.status})`);
    body = (await response.json()) as typeof body;
  } finally {
    clearTimeout(timer);
  }
  const status = body.squidTransactionStatus ?? body.status;
  if (typeof status !== "string") throw new Error("Invalid Squid status response");
  const normalized = status.toLowerCase();
  if (normalized === "success") {
    const destinationTransactionHash = body.toChain?.transactionId;
    if (typeof destinationTransactionHash !== "string" || !isHash(destinationTransactionHash)) {
      throw new Error("Invalid Squid destination transaction hash");
    }
    return { status: "success", destinationTransactionHash };
  }
  // Squid delivers the swapped USDFC to `toAddress` when the post-hook fails.
  if (normalized === "partial_success") return { status: "hook-failed" };
  if (normalized === "needs_gas") return { status: "needs-gas" };
  if (["failed", "refund"].includes(normalized)) return { status: "failed" };
  return { status: "pending" };
}

/**
 * Follows a broadcast route to its exact Filecoin transaction, then verifies
 * the expected Filecoin Pay deposit event from that receipt.
 */
export async function awaitSquidDepositSettlement({
  destinationClient,
  minimumDestinationAmount,
  maxStatusAttempts = 90,
  maxStatusFailures = 6,
  maxVerifyAttempts = 12,
  onStage,
  pollIntervalMs = 10_000,
  quoteId,
  sleep = defaultSleep,
  sourceChainId,
  squid,
  statusRequestTimeoutMs = STATUS_REQUEST_TIMEOUT_MS,
  target,
  transactionHash,
}: AwaitSquidDepositInput): Promise<SquidDepositResult> {
  // Squid delivers to the recipient, which is the Pay account's address and not
  // always the paying wallet, so failure messages name where the USDFC went.
  const recipientLabel = formatAddress(target.recipient);
  let destinationTransactionHash = transactionHash;
  if (sourceChainId !== FILECOIN_CHAIN_ID) {
    onStage?.("bridging", transactionHash);
    let status: SquidDepositStatus = "pending";
    let consecutiveFailures = 0;
    for (let attempt = 0; attempt < maxStatusAttempts && status === "pending"; attempt += 1) {
      try {
        const result = await fetchSquidDepositStatus(
          { transactionHash, sourceChainId, quoteId },
          squid,
          statusRequestTimeoutMs,
        );
        status = result.status;
        if (result.destinationTransactionHash) destinationTransactionHash = result.destinationTransactionHash;
        consecutiveFailures = 0;
      } catch (statusError) {
        // One failed status request is noise; a run of them is an outage the user should hear about.
        consecutiveFailures += 1;
        if (consecutiveFailures >= maxStatusFailures) {
          const detail = statusError instanceof Error ? statusError.message : "unknown error";
          throw new SquidDepositError(
            `Squid's status service is not answering (${detail}). Keep this page open or check back later.`,
            "timeout",
            transactionHash,
          );
        }
        status = "pending";
      }
      if (status === "pending") await sleep(pollIntervalMs);
    }
    if (status === "pending") {
      throw new SquidDepositError(
        "Squid has not confirmed the route yet. Keep this page open or check back later.",
        "timeout",
        transactionHash,
      );
    }
    if (status === "hook-failed") {
      throw new SquidDepositError(
        `USDFC reached the Pay account's address ${recipientLabel} but the Filecoin Pay deposit step failed. Deposit it from that wallet.`,
        "hook-failed",
        transactionHash,
      );
    }
    if (status === "needs-gas") {
      throw new SquidDepositError(
        "Squid paused the route because the destination needs more gas. Add gas from the Squid route link, then check again.",
        "needs-gas",
        transactionHash,
      );
    }
    if (status === "failed") {
      throw new SquidDepositError(
        "Squid could not complete the route. Any refund is sent to your wallet.",
        "failed",
        transactionHash,
      );
    }
  }

  onStage?.("verifying", transactionHash);
  let receipt: TransactionReceipt;
  try {
    receipt = await destinationClient.waitForTransactionReceipt({
      hash: destinationTransactionHash,
      timeout: maxVerifyAttempts * pollIntervalMs,
    });
  } catch {
    throw new SquidDepositError(
      "The Filecoin destination transaction has not been indexed yet. Keep this page open or check back later.",
      "timeout",
      transactionHash,
    );
  }
  if (receipt.status !== "success") {
    throw new SquidDepositError(
      `Squid's Filecoin destination transaction reverted. The USDFC may remain at the Pay account's address ${recipientLabel}.`,
      "hook-failed",
      transactionHash,
    );
  }
  const deposit = parseEventLogs({
    abi: squidDepositAbi,
    eventName: "DepositRecorded",
    logs: receipt.logs,
    strict: true,
  }).find(
    (log) =>
      log.address.toLowerCase() === target.payments.toLowerCase() &&
      log.args.token.toLowerCase() === target.usdfc.toLowerCase() &&
      log.args.to.toLowerCase() === target.recipient.toLowerCase(),
  );
  if (!deposit) {
    throw new SquidDepositError(
      `Squid completed without the expected Filecoin Pay deposit event. The USDFC may remain at the Pay account's address ${recipientLabel}.`,
      "hook-failed",
      transactionHash,
    );
  }
  if (deposit.args.amount < minimumDestinationAmount) {
    throw new SquidDepositError(
      "The Filecoin Pay deposit was smaller than the reviewed minimum.",
      "failed",
      transactionHash,
    );
  }
  return { transactionHash, destinationTransactionHash, depositedAmount: deposit.args.amount };
}

/**
 * Approves an ERC-20 when needed, broadcasts the Squid route from the paying
 * wallet, then waits for the deposit to land in the recipient's account.
 */
export async function executeSquidDeposit({
  destinationClient,
  approvalRequired,
  approvalResetRequired,
  onBroadcast,
  onSwapAttempt,
  onStage,
  quote,
  request,
  sourceClient,
  squid,
  walletClient,
  maxNativeFee,
  getCurrentOwner,
  assertCurrentContext,
  ...polling
}: ExecuteSquidDepositInput): Promise<SquidDepositResult> {
  if (quote.sourceChainId !== request.sourceChainId) throw new Error("Quote does not match the requested network");
  if (walletClient.account.address.toLowerCase() !== request.owner.toLowerCase()) {
    throw new Error("Wallet does not control the paying account");
  }
  if (quote.transaction.expiresAt !== undefined && quote.transaction.expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new Error("The Squid route expired. Refresh the quote.");
  }

  const fundsBefore = await readFilecoinPayFunds(destinationClient, request);
  const spender = quote.transaction.approvalSpender ?? quote.transaction.target;
  const isNativeSource = isNativeToken(request.sourceToken);
  let totalNativeFee = 0n;
  let nativeFeeSinceBalanceRead = 0n;
  {
    let { allowance, nativeBalance } = await assertFreshSigningState({
      assertCurrentContext,
      getCurrentOwner,
      quote,
      request,
      requireAllowance: false,
      sourceClient,
      walletClient,
    });
    if (allowance !== request.sourceAmount) {
      if (!approvalRequired) throw new Error("Source-token allowance changed after review. Review the payment again.");
      if (allowance !== 0n && !approvalResetRequired)
        throw new Error("Source-token allowance changed after review. Review the payment again.");
      onStage?.("approving");
      // USDC accepts a direct overwrite, but USDT-style tokens revert unless a
      // non-zero allowance is zeroed first; one path keeps the plan the same for
      // every source token at the price of a third signature on a stale allowance.
      for (const amount of allowance > 0n ? [0n, request.sourceAmount] : [request.sourceAmount]) {
        const approval = await prepareTransaction(sourceClient, walletClient, request.sourceChainId, {
          to: request.sourceToken,
          data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }),
          value: 0n,
        });
        assertFeeWithinReview(totalNativeFee, approval.fee, maxNativeFee);
        assertNativeBalance(nativeBalance, nativeFeeSinceBalanceRead + approval.fee, 0n);
        await assertCurrentWallet({ assertCurrentContext, getCurrentOwner, request, walletClient });
        const approvalHash = await walletClient.sendTransaction({
          ...approval.request,
          account: walletClient.account,
          chain: undefined,
        });
        totalNativeFee += approval.fee;
        nativeFeeSinceBalanceRead += approval.fee;
        const approvalReceipt = await sourceClient.waitForTransactionReceipt({ hash: approvalHash });
        if (approvalReceipt.status !== "success") {
          throw new SquidDepositError("The source-token approval transaction reverted", "reverted", approvalHash);
        }
        if (amount === 0n) {
          ({ allowance, nativeBalance } = await assertFreshSigningState({
            assertCurrentContext,
            getCurrentOwner,
            quote,
            request,
            requireAllowance: false,
            sourceClient,
            walletClient,
          }));
          if (allowance !== 0n)
            throw new Error("Source-token allowance changed after reset. Review the payment again.");
          nativeFeeSinceBalanceRead = 0n;
        }
      }
    }
  }

  await assertFreshSigningState({
    assertCurrentContext,
    getCurrentOwner,
    quote,
    request,
    requireAllowance: !isNativeSource,
    sourceClient,
    walletClient,
  });

  const route = await prepareTransaction(sourceClient, walletClient, request.sourceChainId, {
    to: quote.transaction.target,
    data: quote.transaction.data,
    value: quote.transaction.value,
  });
  assertFeeWithinReview(totalNativeFee, route.fee, maxNativeFee);
  const { nativeBalance } = await assertFreshSigningState({
    assertCurrentContext,
    getCurrentOwner,
    quote,
    request,
    requireAllowance: true,
    sourceClient,
    walletClient,
  });
  assertNativeBalance(nativeBalance, route.fee, quote.transaction.value);
  if (quote.transaction.expiresAt !== undefined && quote.transaction.expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new Error("The Squid route expired. Refresh the quote.");
  }
  onStage?.("swap-requested");
  onSwapAttempt?.(fundsBefore);
  const transactionHash = await walletClient.sendTransaction({
    ...route.request,
    account: walletClient.account,
    chain: undefined,
  });
  onStage?.("swap-broadcast", transactionHash);
  onBroadcast?.({ transactionHash, fundsBefore });
  const receipt = await sourceClient.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== "success") {
    throw new SquidDepositError("The Squid transaction reverted on the source network", "reverted", transactionHash);
  }

  return awaitSquidDepositSettlement({
    ...polling,
    destinationClient,
    fundsBefore,
    minimumDestinationAmount: quote.minimumDestinationAmount,
    onStage,
    quoteId: quote.quoteId,
    sourceChainId: request.sourceChainId,
    squid,
    target: request,
    transactionHash,
  });
}
