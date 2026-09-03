import { type Address, encodeFunctionData, erc20Abi, type Hash, type Hex, type PublicClient } from "viem";
import {
  type ExecutableSquidDepositQuote,
  FILECOIN_CHAIN_ID,
  SQUID_API_BASE_URL,
  type SquidClient,
  type SquidDepositRef,
  type SquidDepositRouteRequest,
  type SquidDepositTarget,
  squidDepositAbi,
} from "./squid-deposit-route";

const APPROVAL_GAS_UNITS = 60_000n;

export type SquidDepositStage = "approving" | "swap-requested" | "swap-broadcast" | "bridging" | "verifying";
export type SquidDepositStatus = "pending" | "success" | "failed" | "hook-failed";
export type SquidDepositFailure = "failed" | "hook-failed" | "reverted" | "timeout";

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

export interface SquidDepositWalletClient {
  account: { address: Address };
  getChainId(): Promise<number>;
  sendTransaction(request: { to: Address; data: Hex; value?: bigint; gas: bigint; gasPrice: bigint }): Promise<Hash>;
}

export type SquidDepositSourceClient = Pick<
  PublicClient,
  "getBalance" | "getChainId" | "getGasPrice" | "readContract" | "waitForTransactionReceipt"
>;
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
  /** Maximum native-denominated gas the user reviewed, including a possible approval. */
  maxNativeGas: bigint;
  /** Reads the provider/UI account immediately before every signature. */
  getCurrentOwner(): Promise<Address | undefined>;
  /** Fails when recipient, source wallet, chain or token no longer match the reviewed screen. */
  assertCurrentContext(): void;
  onStage?: (stage: SquidDepositStage, transactionHash?: Hash) => void;
  /** Fires once the route is broadcast, with what a resume needs to finish it. */
  onBroadcast?: (broadcast: { transactionHash: Hash; fundsBefore: bigint }) => void;
}

async function assertFreshSigningState({
  assertCurrentContext,
  getCurrentOwner,
  maxNativeGas,
  quote,
  request,
  requireAllowance,
  sourceClient,
  walletClient,
}: Pick<
  ExecuteSquidDepositInput,
  "assertCurrentContext" | "getCurrentOwner" | "maxNativeGas" | "quote" | "request" | "sourceClient" | "walletClient"
> & {
  requireAllowance: boolean;
}): Promise<{ allowance: bigint; gasPrice: bigint }> {
  assertCurrentContext();
  const [providerOwner, walletChainId, rpcChainId, tokenBalance, nativeBalance, gasPrice, allowance] =
    await Promise.all([
      getCurrentOwner(),
      walletClient.getChainId(),
      sourceClient.getChainId(),
      sourceClient.readContract({
        abi: erc20Abi,
        address: request.sourceToken,
        args: [request.owner],
        functionName: "balanceOf",
      }),
      sourceClient.getBalance({ address: request.owner }),
      sourceClient.getGasPrice(),
      sourceClient.readContract({
        abi: erc20Abi,
        address: request.sourceToken,
        args: [request.owner, quote.transaction.approvalSpender ?? quote.transaction.target],
        functionName: "allowance",
      }),
    ]);
  assertCurrentContext();
  if (!providerOwner || providerOwner.toLowerCase() !== request.owner.toLowerCase()) {
    throw new Error("Wallet account changed before signing");
  }
  if (walletChainId !== request.sourceChainId || rpcChainId !== request.sourceChainId) {
    throw new Error("Source network changed before signing");
  }
  if (tokenBalance < request.sourceAmount) throw new Error("USDC balance no longer covers the reviewed spend");
  if (requireAllowance && allowance < request.sourceAmount)
    throw new Error("USDC allowance is insufficient after approval");
  const approvalGas = allowance < request.sourceAmount ? APPROVAL_GAS_UNITS * gasPrice : 0n;
  const routeGas = quote.transaction.gasLimit * gasPrice;
  const actualGas = approvalGas + routeGas;
  if (actualGas > maxNativeGas) throw new Error("Native gas exceeded the reviewed maximum");
  if (nativeBalance < actualGas + quote.transaction.value) {
    throw new Error("Native balance no longer covers gas and route fees");
  }
  return { allowance, gasPrice };
}

export interface AwaitSquidDepositInput extends PollingOptions, SquidDepositRef {
  target: SquidDepositTarget;
  fundsBefore: bigint;
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
  if (["failed", "refund", "needs_gas"].includes(normalized)) return "failed";
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
    if (fundsAfter > fundsBefore) {
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
 * Approves USDC when needed, broadcasts the Squid route from the paying
 * wallet, then waits for the deposit to land in the recipient's account.
 */
export async function executeSquidDeposit({
  destinationClient,
  onBroadcast,
  onStage,
  quote,
  request,
  sourceClient,
  squid,
  walletClient,
  maxNativeGas,
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
  {
    const { allowance, gasPrice } = await assertFreshSigningState({
      assertCurrentContext,
      getCurrentOwner,
      maxNativeGas,
      quote,
      request,
      requireAllowance: false,
      sourceClient,
      walletClient,
    });
    if (allowance < request.sourceAmount) {
      onStage?.("approving");
      const approvalHash = await walletClient.sendTransaction({
        to: request.sourceToken,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, request.sourceAmount] }),
        gas: APPROVAL_GAS_UNITS,
        gasPrice,
      });
      const approvalReceipt = await sourceClient.waitForTransactionReceipt({ hash: approvalHash });
      if (approvalReceipt.status !== "success") {
        throw new SquidDepositError("The USDC approval transaction reverted", "reverted", approvalHash);
      }
    }
  }

  const { gasPrice } = await assertFreshSigningState({
    assertCurrentContext,
    getCurrentOwner,
    maxNativeGas,
    quote,
    request,
    requireAllowance: true,
    sourceClient,
    walletClient,
  });

  onStage?.("swap-requested");
  const transactionHash = await walletClient.sendTransaction({
    to: quote.transaction.target,
    data: quote.transaction.data,
    value: quote.transaction.value,
    gas: quote.transaction.gasLimit,
    gasPrice,
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
    onStage,
    quoteId: quote.quoteId,
    sourceChainId: request.sourceChainId,
    squid,
    target: request,
    transactionHash,
  });
}
