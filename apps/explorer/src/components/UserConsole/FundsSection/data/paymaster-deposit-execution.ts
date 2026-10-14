import {
  type Account,
  type Address,
  BaseError,
  type BundlerRpcSchema,
  type Chain,
  encodePacked,
  erc20Abi,
  formatUnits,
  type Hash,
  type Hex,
  http,
  maxUint256,
  type PublicClient,
  parseAbi,
  parseEventLogs,
  rpcSchema,
  type SignedAuthorization,
  type Transport,
  type TypedDataDomain,
  type WalletClient,
} from "viem";
import {
  createBundlerClient,
  entryPoint08Address,
  getUserOperationHash,
  getUserOperationTypedData,
  type SmartAccount,
  toSimple7702SmartAccount,
  type UserOperation,
  type UserOperationReceipt,
  WaitForUserOperationReceiptTimeoutError,
} from "viem/account-abstraction";
import { type PrivateKeyAccount, toAccount } from "viem/accounts";
import {
  CIRCLE_PAYMASTER_ADDRESS,
  CIRCLE_PAYMASTER_CHAIN_ID,
  getPaymasterGasLimits,
  getPaymasterGasMaximum,
  readPaymasterFees,
} from "./circle-paymaster";
import { type BatchCall, buildPaymasterDepositCalls, quoteSwapInputCap } from "./paymaster-batch";
import type { PaymasterDepositPlan } from "./paymaster-deposit-plan";
import { getDelegationState, SIMPLE_7702_ACCOUNT_ADDRESS } from "./paymaster-eligibility";
import {
  awaitSquidDepositSettlement,
  isRouteExpiring,
  type PollingOptions,
  readFilecoinPayFunds,
  type SquidDepositDestinationClient,
  SquidDepositError,
  type SquidDepositResult,
  type SquidDepositStage,
} from "./squid-deposit-execution";
import {
  applyNetworkFeeReviewHeadroom,
  type ExecutableSquidDepositQuote,
  type SquidClient,
  type SquidDepositRouteRequest,
} from "./squid-deposit-route";

/**
 * The reviewed plan no longer holds and nothing was signed into an operation: the deposit must be reviewed again.
 * `gasMaximumFloor` is what execution needed, so the next review reserves at least that much.
 */
export class PaymasterReviewError extends Error {
  readonly gasMaximumFloor?: bigint;

  constructor(message: string, gasMaximumFloor?: bigint) {
    super(message);
    this.name = "PaymasterReviewError";
    this.gasMaximumFloor = gasMaximumFloor;
  }
}

/** Waiting for inclusion before the deposit is reported unresolved; Base includes a bundle in seconds. */
const OPERATION_RECEIPT_TIMEOUT_MS = 120_000;

const permitAbi = parseAbi([
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function nonces(address owner) view returns (uint256)",
]);

type GasPrice = { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
type PermitMessage = { owner: Address; spender: Address; value: bigint; nonce: bigint; deadline: bigint };
const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
type PimlicoGasPriceSchema = {
  Method: "pimlico_getUserOperationGasPrice";
  Parameters: [];
  ReturnType: Record<"slow" | "standard" | "fast", { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex }>;
};

/** The parts of an operation receipt the deposit checks. */
export type PaymasterOperationReceipt = Pick<
  UserOperationReceipt<"0.8">,
  "logs" | "sender" | "success" | "userOpHash"
> & {
  receipt: { transactionHash: Hash };
};

export interface PaymasterOperationRequest {
  calls: BatchCall[];
  authorization?: SignedAuthorization;
  paymasterData: Hex;
  paymasterVerificationGasLimit: bigint;
  paymasterPostOpGasLimit: bigint;
  gasPrice: GasPrice;
}

/** What a USDC-gas deposit needs from the payer's 7702 account and the bundler. */
export interface PaymasterOperations {
  getGasPrice(): Promise<GasPrice>;
  /** The operation with nonce, call data and gas limits filled in by the bundler's estimate. */
  prepare(request: PaymasterOperationRequest): Promise<UserOperation<"0.8">>;
  /** Signs Circle's USDC permit, which lets the paymaster take up to `value` for gas. */
  signPermit(domain: TypedDataDomain, message: PermitMessage): Promise<Hex>;
  sign(userOperation: UserOperation<"0.8">): Promise<Hex>;
  send(userOperation: UserOperation<"0.8">): Promise<Hash>;
  waitForReceipt(hash: Hash, timeoutMs: number): Promise<PaymasterOperationReceipt>;
}

/** Pimlico's Base bundler behind `/api/bundler`, which keeps the key on the server. */
export function createPaymasterBundler(client: PublicClient<Transport, Chain>, bundlerUrl = "/api/bundler") {
  return createBundlerClient({
    chain: client.chain,
    client,
    rpcSchema: rpcSchema<[...BundlerRpcSchema, PimlicoGasPriceSchema]>(),
    transport: http(bundlerUrl),
  });
}

export type PaymasterBundler = ReturnType<typeof createPaymasterBundler>;

/** The fee per gas the bundler currently requires to include an operation promptly. */
export async function readUserOperationGasPrice(bundler: PaymasterBundler): Promise<GasPrice> {
  const { fast } = await bundler.request({ method: "pimlico_getUserOperationGasPrice", params: [] });
  return { maxFeePerGas: BigInt(fast.maxFeePerGas), maxPriorityFeePerGas: BigInt(fast.maxPriorityFeePerGas) };
}

/**
 * The payer's Simple7702 account, used to build operations. Its owner never signs: the wallet signs the operation
 * and the permit as typed data, since an embedded wallet keeps its key out of the page.
 */
export function toPaymasterAccount(client: PublicClient<Transport, Chain>, payer: Address): Promise<SmartAccount> {
  const signsThroughWallet = () => Promise.reject(new Error("USDC-gas signatures go through the wallet"));
  const owner = toAccount({
    address: payer,
    signMessage: signsThroughWallet,
    signTransaction: signsThroughWallet,
    signTypedData: signsThroughWallet,
  });
  // viem types the owner as a private key; building an operation only reads its address.
  return toSimple7702SmartAccount({ client, owner: owner as PrivateKeyAccount });
}

/** Binds the payer's 7702 account to the bundler. */
export function createPaymasterOperations(
  account: SmartAccount,
  wallet: WalletClient<Transport, Chain | undefined, Account>,
  bundler: PaymasterBundler,
): PaymasterOperations {
  return {
    getGasPrice: () => readUserOperationGasPrice(bundler),
    prepare: async ({ authorization, calls, gasPrice, ...paymaster }) => {
      const { account: _account, ...userOperation } = await bundler.prepareUserOperation({
        account,
        authorization,
        calls,
        paymaster: CIRCLE_PAYMASTER_ADDRESS,
        ...paymaster,
        ...gasPrice,
      });
      return userOperation;
    },
    signPermit: (domain, message) =>
      wallet.signTypedData({ account: wallet.account, domain, message, primaryType: "Permit", types: PERMIT_TYPES }),
    // Simple7702Account checks a plain ECDSA signature over the EIP-712 operation hash.
    sign: (userOperation) =>
      wallet.signTypedData({
        account: wallet.account,
        ...getUserOperationTypedData({
          chainId: CIRCLE_PAYMASTER_CHAIN_ID,
          entryPointAddress: entryPoint08Address,
          userOperation,
        }),
      }),
    send: (userOperation) => bundler.sendUserOperation({ ...userOperation, entryPointAddress: entryPoint08Address }),
    waitForReceipt: (hash, timeout) => bundler.waitForUserOperationReceipt({ hash, timeout }),
  };
}

const hashUserOperation = (userOperation: UserOperation<"0.8">) =>
  getUserOperationHash({
    chainId: CIRCLE_PAYMASTER_CHAIN_ID,
    entryPointAddress: entryPoint08Address,
    entryPointVersion: "0.8",
    userOperation,
  });

const VALIDATION_REASON = /\bAA[1-5]\d\b[^\n]*/;

/**
 * A bundler answers a failed validation with an ERC-4337 AA code: nothing was included and no gas was charged.
 * Returns that line of the error, without the request viem prints around it.
 */
function getValidationRejection(error: unknown): string | undefined {
  const cause =
    error instanceof BaseError
      ? error.walk((inner) => inner instanceof Error && VALIDATION_REASON.test(inner.message))
      : error;
  return cause instanceof Error ? cause.message.match(VALIDATION_REASON)?.[0].trim() : undefined;
}

const circlePaymasterEventsAbi = parseAbi([
  "event UserOperationSponsored(address indexed token, address indexed sender, bytes32 userOpHash, uint256 nativeTokenPrice, uint256 actualTokenNeeded, uint256 feeTokenAmount)",
]);

/** The USDC Circle's paymaster kept for this operation, from the event it emits after refunding the rest. */
function getChargedUsdc(receipt: PaymasterOperationReceipt): bigint | undefined {
  return parseEventLogs({
    abi: circlePaymasterEventsAbi,
    eventName: "UserOperationSponsored",
    logs: receipt.logs,
  }).find(
    (log) =>
      log.address.toLowerCase() === CIRCLE_PAYMASTER_ADDRESS.toLowerCase() &&
      log.args.userOpHash === receipt.userOpHash,
  )?.args.actualTokenNeeded;
}

/**
 * Waits for the operation's own receipt. A successful bundle does not prove the operation inside it
 * succeeded, so its sender, hash and `success` are checked. Returns the bundle transaction hash.
 */
export async function awaitPaymasterOperation(
  operations: Pick<PaymasterOperations, "waitForReceipt">,
  hash: Hash,
  payer: Address,
  timeoutMs = OPERATION_RECEIPT_TIMEOUT_MS,
): Promise<Hash> {
  let receipt: PaymasterOperationReceipt;
  try {
    receipt = await operations.waitForReceipt(hash, timeoutMs);
  } catch (error) {
    throw new SquidDepositError(
      error instanceof WaitForUserOperationReceiptTimeoutError
        ? "The deposit has not been included on Base yet, so whether network fees were charged is not known. Your USDC stays in this account unless it is included. Check again before starting another deposit."
        : "The bundler could not be reached to confirm this deposit, so whether network fees were charged is not known. Check again before starting another deposit.",
      "timeout",
    );
  }
  if (receipt.userOpHash !== hash || receipt.sender.toLowerCase() !== payer.toLowerCase()) {
    throw new SquidDepositError("The bundler reported a different operation than the one signed.", "timeout");
  }
  if (!receipt.success) {
    const charged = getChargedUsdc(receipt);
    const fees = charged === undefined ? "Network fees were" : `Network fees of ${formatUnits(charged, 6)} USDC were`;
    throw new SquidDepositError(
      `The deposit reverted on Base, so no USDC went to Squid and it is still in this account. ${fees} still charged, and this account keeps its USDC-gas setup for the next try.`,
      "reverted",
      receipt.receipt.transactionHash,
    );
  }
  return receipt.receipt.transactionHash;
}

export interface ExecutePaymasterDepositInput extends PollingOptions {
  plan: PaymasterDepositPlan;
  /** The executable route, already checked against the reviewed Squid caps. */
  quote: ExecutableSquidDepositQuote;
  /** Its `sourceAmount` is the sized deposit, not the USDC set aside for it. */
  request: SquidDepositRouteRequest;
  operations: PaymasterOperations;
  /** Privy's 7702 signer for the payer's embedded wallet. */
  signAuthorization(request: {
    contractAddress: Address;
    chainId: number;
    nonce: number;
  }): Promise<SignedAuthorization>;
  sourceClient: Pick<
    PublicClient,
    "getCode" | "getTransactionCount" | "multicall" | "readContract" | "simulateContract" | "waitForTransactionReceipt"
  >;
  destinationClient: SquidDepositDestinationClient;
  squid: SquidClient;
  getCurrentOwner(): Promise<Address | undefined>;
  assertCurrentContext(): void;
  onStage?: (stage: SquidDepositStage, transactionHash?: Hash) => void;
  /** Persists a marker synchronously before the operation is sent, so a reload can find it. */
  onSubmit?: (submission: { userOperationHash: Hash; fundsBefore: bigint; quote: ExecutableSquidDepositQuote }) => void;
  onBroadcast?: (broadcast: { transactionHash: Hash; fundsBefore: bigint; quote: ExecutableSquidDepositQuote }) => void;
}

/**
 * Deposits through one user operation from the payer's own address: USDC pays Base gas through Circle's paymaster,
 * and the batch swaps USDC for the route's bridge fee. Every cost is checked against the reviewed plan before
 * anything is signed, then the deposit is followed to Filecoin Pay like a wallet-sent route.
 */
export async function executePaymasterSquidDeposit({
  assertCurrentContext,
  destinationClient,
  getCurrentOwner,
  onBroadcast,
  onStage,
  onSubmit,
  operations,
  plan,
  quote,
  request,
  signAuthorization,
  sourceClient,
  squid,
  ...polling
}: ExecutePaymasterDepositInput): Promise<SquidDepositResult> {
  const payer = request.owner;
  const token = request.sourceToken;
  if (quote.sourceChainId !== CIRCLE_PAYMASTER_CHAIN_ID || request.sourceChainId !== CIRCLE_PAYMASTER_CHAIN_ID) {
    throw new Error("USDC gas is only available on Base");
  }
  if (isRouteExpiring(quote, 0)) throw new Error("The Squid route expired. Refresh the quote.");
  const assertSigner = async () => {
    assertCurrentContext();
    const owner = await getCurrentOwner();
    assertCurrentContext();
    if (owner?.toLowerCase() !== payer.toLowerCase()) throw new Error("Wallet account changed before signing");
  };

  const fundsBefore = await readFilecoinPayFunds(destinationClient, request);
  const [code, fees, balance, paymasterAllowance, permitNonce, authorizationNonce, permitName, permitVersion] =
    await Promise.all([
      sourceClient.getCode({ address: payer }),
      readPaymasterFees(sourceClient),
      sourceClient.readContract({ abi: erc20Abi, address: token, functionName: "balanceOf", args: [payer] }),
      sourceClient.readContract({
        abi: erc20Abi,
        address: token,
        functionName: "allowance",
        args: [payer, CIRCLE_PAYMASTER_ADDRESS],
      }),
      sourceClient.readContract({ abi: permitAbi, address: token, functionName: "nonces", args: [payer] }),
      sourceClient.getTransactionCount({ address: payer }),
      sourceClient.readContract({ abi: permitAbi, address: token, functionName: "name" }),
      sourceClient.readContract({ abi: permitAbi, address: token, functionName: "version" }),
    ]);
  const delegation = getDelegationState(code);
  if (delegation === "conflict") {
    throw new Error("This account delegates to another smart account, so it cannot pay network fees in USDC.");
  }
  // The paymaster falls back to an existing allowance when its permit fails, so that allowance is a cap too.
  if (paymasterAllowance > plan.gasMaximum) {
    throw new Error("An earlier USDC allowance to Circle's paymaster exceeds the reviewed gas maximum.");
  }
  const nativeFee = quote.transaction.value;
  if (nativeFee > plan.maxNativeFee) throw new PaymasterReviewError("The bridge fee rose above the reviewed maximum.");
  const maxSwapInput = nativeFee === 0n ? 0n : await quoteSwapInputCap(sourceClient, token, nativeFee);
  if (maxSwapInput > plan.maxSwapInput) {
    throw new PaymasterReviewError("Buying the bridge fee now costs more USDC than reviewed.");
  }
  if (balance < request.sourceAmount + maxSwapInput + plan.gasMaximum) {
    throw new PaymasterReviewError("The USDC balance no longer covers the deposit and its fees.");
  }
  const calls = buildPaymasterDepositCalls({
    maxSwapInput,
    payer,
    sourceAmount: request.sourceAmount,
    sourceToken: token,
    transaction: quote.transaction,
  });

  onStage?.("swap-requested");
  await assertSigner();
  const authorization =
    delegation === "none"
      ? await signAuthorization({
          chainId: CIRCLE_PAYMASTER_CHAIN_ID,
          contractAddress: SIMPLE_7702_ACCOUNT_ADDRESS,
          nonce: authorizationNonce,
        })
      : undefined;
  // Circle's paymaster cannot read block time during validation, so its permits never expire.
  const permitSignature = await operations.signPermit(
    { chainId: CIRCLE_PAYMASTER_CHAIN_ID, name: permitName, verifyingContract: token, version: permitVersion },
    {
      deadline: maxUint256,
      nonce: permitNonce,
      owner: payer,
      spender: CIRCLE_PAYMASTER_ADDRESS,
      value: plan.gasMaximum,
    },
  );
  const prepared = await operations.prepare({
    authorization,
    calls,
    gasPrice: await operations.getGasPrice(),
    paymasterData: encodePacked(["uint8", "address", "uint256", "bytes"], [0, token, plan.gasMaximum, permitSignature]),
    ...getPaymasterGasLimits(fees),
  });
  const gasMaximum = getPaymasterGasMaximum(
    {
      callGasLimit: prepared.callGasLimit,
      verificationGasLimit: prepared.verificationGasLimit,
      preVerificationGas: prepared.preVerificationGas,
      paymasterVerificationGasLimit: prepared.paymasterVerificationGasLimit ?? 0n,
      paymasterPostOpGasLimit: prepared.paymasterPostOpGasLimit ?? 0n,
      maxFeePerGas: prepared.maxFeePerGas,
    },
    fees,
  );
  if (gasMaximum > plan.gasMaximum) {
    throw new PaymasterReviewError(
      "Network fees rose above the reviewed USDC maximum.",
      applyNetworkFeeReviewHeadroom(gasMaximum),
    );
  }
  if (isRouteExpiring(quote, 0)) throw new Error("The Squid route expired. Refresh the quote.");
  await assertSigner();
  const userOperation = { ...prepared, signature: await operations.sign(prepared) };
  const userOperationHash = hashUserOperation(userOperation);
  onSubmit?.({ fundsBefore, quote, userOperationHash });
  let sentHash: Hash;
  try {
    sentHash = await operations.send(userOperation);
  } catch (error) {
    const rejection = getValidationRejection(error);
    if (rejection) {
      throw new SquidDepositError(
        `The bundler refused the deposit, so nothing was charged and your USDC is still in this account (${rejection}).`,
        "failed",
      );
    }
    throw new SquidDepositError(
      "The deposit may have been sent, but the bundler's answer was lost, so whether network fees were charged is not known. Check again before starting another deposit.",
      "timeout",
    );
  }
  if (sentHash !== userOperationHash) {
    throw new SquidDepositError("The bundler reported a different operation than the one signed.", "timeout");
  }
  onStage?.("swap-broadcast");
  const transactionHash = await awaitPaymasterOperation(operations, userOperationHash, payer);
  onBroadcast?.({ fundsBefore, quote, transactionHash });

  return awaitSquidDepositSettlement({
    ...polling,
    destinationClient,
    fundsBefore,
    minimumDestinationAmount: quote.minimumDestinationAmount,
    onStage,
    quoteId: quote.quoteId,
    sourceChainId: request.sourceChainId,
    sourceClient,
    squid,
    target: request,
    transactionHash,
  });
}
