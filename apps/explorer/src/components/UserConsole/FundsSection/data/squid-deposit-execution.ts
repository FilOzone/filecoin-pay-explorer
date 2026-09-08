import {
  type Account,
  type Address,
  encodeFunctionData,
  erc20Abi,
  type Hash,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { readSourceTokenState } from "./source-token-balances";
import {
  ERC20_APPROVE_FALLBACK_GAS,
  type ExecutableSquidDepositQuote,
  FILECOIN_CHAIN_ID,
  getDepositTransactionKinds,
  isNativeToken,
  listTransactionLabels,
  priceSourceTransaction,
  readSourceFeesPerGas,
  type SourceFeesPerGas,
  SQUID_API_BASE_URL,
  type SquidClient,
  type SquidDepositFeeClient,
  type SquidDepositRef,
  type SquidDepositRouteRequest,
  type SquidDepositTarget,
  type SquidDepositTransactionKind,
  squidDepositAbi,
} from "./squid-deposit-route";

export type SquidDepositStage = "approving" | "swap-requested" | "swap-broadcast" | "bridging" | "verifying";

/** A route this close to its expiry is not sent: the wallet prompt and the broadcast take time too. */
export const ROUTE_EXPIRY_MARGIN_SECONDS = 30;

const isRouteExpiring = (quote: ExecutableSquidDepositQuote, marginSeconds: number) =>
  quote.transaction.expiresAt !== undefined &&
  quote.transaction.expiresAt <= Math.floor(Date.now() / 1000) + marginSeconds;
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

export interface SquidDepositBudgetBreach {
  /** Transactions already broadcast under the reviewed cap; a re-review must not repeat them. */
  completed: readonly SquidDepositTransactionKind[];
  /** Transactions still to send, first one next. */
  remaining: readonly SquidDepositTransactionKind[];
  feeSoFar: bigint;
  /**
   * What execution priced at current fees, buffered as it charges them: every remaining
   * transaction before the first signature, the next send mid-run.
   */
  requiredFee: bigint;
  maxNativeFee: bigint;
}

/**
 * The cumulative gas cap would be exceeded before a send. Nothing beyond
 * `completed` was broadcast, so the caller can review a fresh maximum and
 * continue rather than abandon the deposit.
 */
export class SquidDepositBudgetError extends Error {
  readonly breach: SquidDepositBudgetBreach;

  constructor(breach: SquidDepositBudgetBreach) {
    super(
      breach.completed.length === 0
        ? `Network fees for the ${listTransactionLabels(breach.remaining)} are above the reviewed maximum.`
        : `Network gas rose above the reviewed maximum before the ${listTransactionLabels(breach.remaining.slice(0, 1))}. The ${listTransactionLabels(breach.completed)} already went through and will not be repeated.`,
    );
    this.name = "SquidDepositBudgetError";
    this.breach = breach;
  }
}

export type SquidDepositWalletClient = Pick<WalletClient, "getChainId" | "sendTransaction"> & {
  account: Account;
};

/** Reads state and prices transactions on the source network; the wallet only signs what it is handed. */
export type SquidDepositSourceClient = Pick<
  PublicClient,
  "getBalance" | "getChainId" | "multicall" | "readContract" | "waitForTransactionReceipt"
> &
  SquidDepositFeeClient;
export type SquidDepositDestinationClient = Pick<PublicClient, "readContract">;

export interface SquidDepositResult {
  transactionHash: Hash;
  fundsBefore: bigint;
  fundsAfter: bigint;
  depositedAmount: bigint;
}

interface PollingOptions {
  sleep?: (milliseconds: number) => Promise<void>;
  pollIntervalMs?: number;
  /** Squid status polls before giving up; the route itself is quoted at ~90s. */
  maxStatusAttempts?: number;
  /** Consecutive failed status requests tolerated before the outage is reported. */
  maxStatusFailures?: number;
  /** Filecoin balance reads after Squid reports success. */
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
  onSwapAttempt?: (fundsBefore: bigint, quote: ExecutableSquidDepositQuote) => void;
  /** Fires once the route is broadcast, with what a resume needs to finish it. */
  onBroadcast?: (broadcast: { transactionHash: Hash; fundsBefore: bigint; quote: ExecutableSquidDepositQuote }) => void;
  /**
   * Fetches a fresh executable route, already checked against the reviewed caps. Called
   * when the approvals took longer than the route's validity, so the swap is not lost.
   */
  refreshQuote?: () => Promise<ExecutableSquidDepositQuote>;
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

type SigningStateInput = Pick<
  ExecuteSquidDepositInput,
  "assertCurrentContext" | "getCurrentOwner" | "quote" | "request" | "sourceClient" | "walletClient"
>;

async function assertFreshSigningState({
  assertCurrentContext,
  blockNumber,
  getCurrentOwner,
  quote,
  request,
  requireAllowance,
  sourceClient,
  walletClient,
}: SigningStateInput & {
  requireAllowance: boolean;
  /** Reads pinned to this block, so state older than a just-mined approval is refused, not returned. */
  blockNumber?: bigint;
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
      blockNumber,
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

/** Reads of the allowance an approval just set, before the mismatch counts as real. */
const ALLOWANCE_READ_ATTEMPTS = 5;

/**
 * Reads the signing state after an approval was mined. Public RPC endpoints
 * are load balanced, and the node that answers the read can be a block behind
 * the one that returned the receipt, so a first read may still show the old
 * allowance. The read is pinned to the receipt's block, which makes a lagging
 * node fail instead of answering, and repeated a few times before the
 * mismatch is reported as such.
 */
async function assertSigningStateAfterApproval({
  attempts = ALLOWANCE_READ_ATTEMPTS,
  blockNumber,
  expectedAllowance,
  pollIntervalMs,
  sleep,
  ...input
}: SigningStateInput & {
  blockNumber: bigint;
  expectedAllowance: bigint;
  attempts?: number;
  pollIntervalMs: number;
  sleep: (milliseconds: number) => Promise<void>;
}): Promise<{ allowance: bigint; nativeBalance: bigint }> {
  for (let attempt = 1; ; attempt++) {
    try {
      const state = await assertFreshSigningState({ ...input, blockNumber, requireAllowance: false });
      if (state.allowance === expectedAllowance || attempt >= attempts) return state;
    } catch (error) {
      if (attempt >= attempts) throw error;
    }
    await sleep(pollIntervalMs);
  }
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

/**
 * Prices a transaction on the source client and returns it fully specified, so
 * the wallet signs exactly what was accounted for instead of filling fees by
 * its own rules. Without `gas` the call is simulated, which also catches a revert.
 */
async function prepareTransaction(
  sourceClient: SquidDepositSourceClient,
  walletClient: SquidDepositWalletClient,
  sourceChainId: number,
  transaction: { to: Address; data: Hex; value: bigint; gas?: bigint },
  fees?: SourceFeesPerGas,
) {
  const priced = await priceSourceTransaction(
    sourceClient,
    sourceChainId,
    { account: walletClient.account.address, ...transaction },
    fees,
  );
  return {
    fee: priced.fee,
    request: { to: transaction.to, data: transaction.data, value: transaction.value, gas: priced.gas, ...priced.fees },
  };
}

function assertFeeWithinReview(
  progress: {
    completed: readonly SquidDepositTransactionKind[];
    remaining: readonly SquidDepositTransactionKind[];
    feeSoFar: bigint;
  },
  fee: bigint,
  maxNativeFee: bigint,
  nativeBalance: bigint,
  value: bigint,
) {
  const { completed, feeSoFar, remaining } = progress;
  if (feeSoFar + fee > maxNativeFee) {
    throw new SquidDepositBudgetError({ completed, feeSoFar, maxNativeFee, remaining, requiredFee: fee });
  }
  if (nativeBalance < feeSoFar + fee + value) throw new Error("Native balance no longer covers gas and route fees");
}

/**
 * Prices every transaction the run will send before the first signature, so a
 * reviewed maximum that current fees cannot meet stops the run here, with
 * nothing broadcast, rather than between an approval and the route.
 */
async function assertPlanWithinReview({
  allowance,
  maxNativeFee,
  quote,
  request,
  sourceClient,
  spender,
  walletClient,
}: Pick<ExecuteSquidDepositInput, "maxNativeFee" | "quote" | "request" | "sourceClient" | "walletClient"> & {
  allowance: bigint;
  spender: Address;
}) {
  const remaining = getDepositTransactionKinds(request.sourceToken, request.sourceAmount, allowance);
  const fees = await readSourceFeesPerGas(sourceClient);
  const approval = (amount: bigint, gas?: bigint) =>
    prepareTransaction(
      sourceClient,
      walletClient,
      request.sourceChainId,
      {
        to: request.sourceToken,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }),
        value: 0n,
        gas,
      },
      fees,
    );
  const price = (kind: SquidDepositTransactionKind) => {
    if (kind === "reset") return approval(0n);
    // Behind a reset the approval cannot be simulated yet; budget it at the fallback gas.
    if (kind === "approve")
      return approval(request.sourceAmount, allowance > 0n ? ERC20_APPROVE_FALLBACK_GAS : undefined);
    // Squid's gas limit stands in for a simulation the missing allowance would fail.
    return prepareTransaction(
      sourceClient,
      walletClient,
      request.sourceChainId,
      {
        to: quote.transaction.target,
        data: quote.transaction.data,
        value: quote.transaction.value,
        gas: quote.transaction.gasLimit,
      },
      fees,
    );
  };
  const priced = await Promise.all(remaining.map(price));
  const requiredFee = priced.reduce((total, { fee }) => total + fee, 0n);
  if (requiredFee > maxNativeFee) {
    throw new SquidDepositBudgetError({ completed: [], feeSoFar: 0n, maxNativeFee, remaining, requiredFee });
  }
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
): Promise<SquidDepositStatus> {
  const fetcher = client.fetch ?? globalThis.fetch.bind(globalThis);
  const query = new URLSearchParams({
    transactionId: input.transactionHash,
    fromChainId: String(input.sourceChainId),
    toChainId: String(FILECOIN_CHAIN_ID),
    quoteId: input.quoteId,
  });
  const response = await fetcher(`${client.baseUrl ?? SQUID_API_BASE_URL}/status?${query}`, {
    headers: { "x-integrator-id": client.integratorId },
  });
  // Squid answers 404 until its indexer sees the source transaction.
  if (response.status === 404) return "pending";
  if (!response.ok) throw new Error(`Squid status request failed (${response.status})`);
  const body = (await response.json()) as { squidTransactionStatus?: unknown; status?: unknown };
  const status = body.squidTransactionStatus ?? body.status;
  if (typeof status !== "string") throw new Error("Invalid Squid status response");
  const normalized = status.toLowerCase();
  if (normalized === "success") return "success";
  // Squid delivers the swapped USDFC to `toAddress` when the post-hook fails.
  if (normalized === "partial_success") return "hook-failed";
  if (normalized === "needs_gas") return "needs-gas";
  if (["failed", "refund"].includes(normalized)) return "failed";
  return "pending";
}

/**
 * Follows a broadcast route to its Filecoin Pay credit: Squid's status for
 * cross-chain routes, then the account balance on Filecoin. Same-chain routes
 * settle atomically, so only the balance check applies.
 */
export async function awaitSquidDepositSettlement({
  destinationClient,
  fundsBefore,
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
  target,
  transactionHash,
}: AwaitSquidDepositInput): Promise<SquidDepositResult> {
  if (sourceChainId !== FILECOIN_CHAIN_ID) {
    onStage?.("bridging", transactionHash);
    let status: SquidDepositStatus = "pending";
    let consecutiveFailures = 0;
    for (let attempt = 0; attempt < maxStatusAttempts && status === "pending"; attempt += 1) {
      try {
        status = await fetchSquidDepositStatus({ transactionHash, sourceChainId, quoteId }, squid);
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
        "USDFC reached your wallet but the Filecoin Pay deposit step failed. Deposit it directly from your wallet.",
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
  for (let attempt = 0; attempt < maxVerifyAttempts; attempt += 1) {
    const fundsAfter = await readFilecoinPayFunds(destinationClient, target);
    if (fundsAfter >= fundsBefore + minimumDestinationAmount) {
      return { transactionHash, fundsBefore, fundsAfter, depositedAmount: fundsAfter - fundsBefore };
    }
    await sleep(pollIntervalMs);
  }
  throw new SquidDepositError(
    "Your Filecoin Pay balance has not updated yet. The deposit may still be settling.",
    "timeout",
    transactionHash,
  );
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
  refreshQuote,
  request,
  sourceClient,
  squid,
  walletClient,
  maxNativeFee,
  getCurrentOwner,
  assertCurrentContext,
  ...polling
}: ExecuteSquidDepositInput): Promise<SquidDepositResult> {
  const { sleep = defaultSleep, pollIntervalMs = 10_000 } = polling;
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
  const completed: SquidDepositTransactionKind[] = [];
  const signingState = { assertCurrentContext, getCurrentOwner, quote, request, sourceClient, walletClient };
  // Block of the last mined approval; reads after it must not come from an older block.
  let approvalBlock: bigint | undefined;
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
    }
    await assertPlanWithinReview({ allowance, maxNativeFee, quote, request, sourceClient, spender, walletClient });
    if (allowance !== request.sourceAmount) {
      const plan = getDepositTransactionKinds(request.sourceToken, request.sourceAmount, allowance);
      onStage?.("approving");
      for (const amount of allowance > 0n ? [0n, request.sourceAmount] : [request.sourceAmount]) {
        const approval = await prepareTransaction(sourceClient, walletClient, request.sourceChainId, {
          to: request.sourceToken,
          data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }),
          value: 0n,
        });
        const kind = amount === 0n ? "reset" : "approve";
        assertFeeWithinReview(
          { completed, feeSoFar: totalNativeFee, remaining: plan.slice(completed.length) },
          approval.fee,
          maxNativeFee,
          nativeBalance,
          0n,
        );
        await assertCurrentWallet({ assertCurrentContext, getCurrentOwner, request, walletClient });
        const approvalHash = await walletClient.sendTransaction({
          ...approval.request,
          account: walletClient.account,
          chain: undefined,
        });
        totalNativeFee += approval.fee;
        completed.push(kind);
        const approvalReceipt = await sourceClient.waitForTransactionReceipt({ hash: approvalHash });
        if (approvalReceipt.status !== "success") {
          throw new SquidDepositError("The source-token approval transaction reverted", "reverted", approvalHash);
        }
        approvalBlock = approvalReceipt.blockNumber;
        if (amount === 0n) {
          ({ allowance, nativeBalance } = await assertSigningStateAfterApproval({
            ...signingState,
            blockNumber: approvalBlock,
            expectedAllowance: 0n,
            pollIntervalMs,
            sleep,
          }));
          if (allowance !== 0n)
            throw new Error("Source-token allowance changed after reset. Review the payment again.");
        }
      }
    }
  }

  const { nativeBalance } =
    approvalBlock === undefined
      ? await assertFreshSigningState({ ...signingState, requireAllowance: !isNativeSource })
      : await assertSigningStateAfterApproval({
          ...signingState,
          blockNumber: approvalBlock,
          expectedAllowance: request.sourceAmount,
          pollIntervalMs,
          sleep,
        }).then((state) => {
          if (state.allowance !== request.sourceAmount) {
            throw new Error("Source-token allowance does not match the reviewed spend after approval");
          }
          return state;
        });

  // Approvals on a slow network can outlast the route's validity; a fresh route within the
  // reviewed caps keeps the swap going rather than failing after the approvals were paid for.
  let routeQuote = quote;
  if (isRouteExpiring(routeQuote, ROUTE_EXPIRY_MARGIN_SECONDS)) {
    if (!refreshQuote) throw new Error("The Squid route expired. Refresh the quote.");
    routeQuote = await refreshQuote();
    if (routeQuote.sourceChainId !== request.sourceChainId || routeQuote.sourceAmount !== request.sourceAmount) {
      throw new Error("The refreshed Squid route does not match the reviewed payment");
    }
    if (isRouteExpiring(routeQuote, 0)) throw new Error("The Squid route expired. Refresh the quote.");
    assertCurrentContext();
  }
  const route = await prepareTransaction(sourceClient, walletClient, request.sourceChainId, {
    to: routeQuote.transaction.target,
    data: routeQuote.transaction.data,
    value: routeQuote.transaction.value,
  });
  assertFeeWithinReview(
    { completed, feeSoFar: totalNativeFee, remaining: ["route"] },
    route.fee,
    maxNativeFee,
    nativeBalance,
    routeQuote.transaction.value,
  );
  await assertCurrentWallet({ assertCurrentContext, getCurrentOwner, request, walletClient });
  if (isRouteExpiring(routeQuote, 0)) throw new Error("The Squid route expired. Refresh the quote.");
  onStage?.("swap-requested");
  onSwapAttempt?.(fundsBefore, routeQuote);
  const transactionHash = await walletClient.sendTransaction({
    ...route.request,
    account: walletClient.account,
    chain: undefined,
  });
  onStage?.("swap-broadcast", transactionHash);
  onBroadcast?.({ transactionHash, fundsBefore, quote: routeQuote });
  const receipt = await sourceClient.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== "success") {
    throw new SquidDepositError("The Squid transaction reverted on the source network", "reverted", transactionHash);
  }

  return awaitSquidDepositSettlement({
    ...polling,
    destinationClient,
    fundsBefore,
    minimumDestinationAmount: routeQuote.minimumDestinationAmount,
    onStage,
    quoteId: routeQuote.quoteId,
    sourceChainId: request.sourceChainId,
    squid,
    target: request,
    transactionHash,
  });
}
