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
import { PERMIT_TYPES } from "@/utils/permit";
import {
  CIRCLE_PAYMASTER_ADDRESS,
  CIRCLE_PAYMASTER_CHAIN_ID,
  CIRCLE_PAYMASTER_TOKEN_DECIMALS,
  circlePaymasterAbi,
  getDelegationState,
  getPaymasterGasLimits,
  getPaymasterGasMaximum,
  readPaymasterFees,
  SIMPLE_7702_ACCOUNT_ADDRESS,
} from "./circle-paymaster";
import { type BatchCall, buildPaymasterDepositCalls, quoteSwapInputCap } from "./paymaster-batch";
import { FEE_RESERVE_USDC } from "./paymaster-deposit-plan";
import {
  awaitSquidDepositSettlement,
  isRouteExpiring,
  type PollingOptions,
  ROUTE_EXPIRY_MARGIN_SECONDS,
  readFilecoinPayFunds,
  type SquidDepositDestinationClient,
  SquidDepositError,
  type SquidDepositResult,
  type SquidDepositStage,
} from "./squid-deposit-execution";
import {
  assertExecutableQuoteWithinReview,
  captureReviewedSquidDepositCaps,
  type ExecutableSquidDepositQuote,
  type SquidClient,
  type SquidDepositQuote,
  type SquidDepositRouteRequest,
  SquidQuoteChangedError,
} from "./squid-deposit-route";

/** The reviewed deposit no longer holds and nothing was signed into an operation: it must be reviewed again. */
export class PaymasterReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymasterReviewError";
  }
}

const FEES_ABOVE_RESERVE = "Network fees are above the reserve. Try again later.";

// Waiting for inclusion before the deposit is reported unresolved; Base includes a bundle in seconds.
const OPERATION_RECEIPT_TIMEOUT_MS = 120_000;

const permitAbi = parseAbi([
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function nonces(address owner) view returns (uint256)",
]);

type PermitMessage = { owner: Address; spender: Address; value: bigint; nonce: bigint; deadline: bigint };
type PimlicoGasPriceSchema = {
  Method: "pimlico_getUserOperationGasPrice";
  Parameters: [];
  ReturnType: Record<"slow" | "standard" | "fast", { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex }>;
};

// The parts of an operation receipt the deposit checks.
type PaymasterOperationReceipt = Pick<UserOperationReceipt<"0.8">, "logs" | "sender" | "success" | "userOpHash"> & {
  receipt: { transactionHash: Hash };
};

export interface PaymasterOperationRequest {
  calls: BatchCall[];
  authorization?: SignedAuthorization;
  paymasterData: Hex;
  paymasterVerificationGasLimit: bigint;
  paymasterPostOpGasLimit: bigint;
}

/** What a USDC-gas deposit needs from the payer's 7702 account and the bundler. */
export interface PaymasterOperations {
  /** The operation with nonce, call data and gas limits filled in by the bundler's estimate, at its current price. */
  prepare(request: PaymasterOperationRequest): Promise<UserOperation<"0.8">>;
  /** Signs Circle's USDC permit, which lets the paymaster take up to `value` for gas. */
  signPermit(domain: TypedDataDomain, message: PermitMessage): Promise<Hex>;
  sign(userOperation: UserOperation<"0.8">): Promise<Hex>;
  send(userOperation: UserOperation<"0.8">): Promise<Hash>;
  waitForUserOperationReceipt(parameters: { hash: Hash; timeout: number }): Promise<PaymasterOperationReceipt>;
}

/** Pimlico's Base bundler behind `/api/bundler`, which keeps the key on the server. */
export function createPaymasterBundler(client: PublicClient<Transport, Chain>) {
  return createBundlerClient({
    chain: client.chain,
    client,
    rpcSchema: rpcSchema<[...BundlerRpcSchema, PimlicoGasPriceSchema]>(),
    transport: http("/api/bundler"),
  });
}

type PaymasterBundler = ReturnType<typeof createPaymasterBundler>;

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
  // The implementation is pinned so the account matches the delegate the authorization and delegation check use.
  return toSimple7702SmartAccount({
    client,
    implementation: SIMPLE_7702_ACCOUNT_ADDRESS,
    owner: owner as PrivateKeyAccount,
  });
}

/** Binds the payer's 7702 account to the bundler. */
export function createPaymasterOperations(
  account: SmartAccount,
  wallet: WalletClient<Transport, Chain | undefined, Account>,
  bundler: PaymasterBundler,
): PaymasterOperations {
  return {
    prepare: async ({ authorization, calls, ...paymaster }) => {
      const { fast } = await bundler.request({ method: "pimlico_getUserOperationGasPrice", params: [] });
      const { account: _account, ...userOperation } = await bundler.prepareUserOperation({
        account,
        authorization,
        calls,
        maxFeePerGas: BigInt(fast.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(fast.maxPriorityFeePerGas),
        paymaster: CIRCLE_PAYMASTER_ADDRESS,
        ...paymaster,
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
    waitForUserOperationReceipt: (parameters) => bundler.waitForUserOperationReceipt(parameters),
  };
}

const VALIDATION_REASON = /\bAA[1-5]\d\b[^\n]*/;

// A bundler answers a failed validation with an ERC-4337 AA code: nothing was included and no gas was charged.
// Returns that line of the error, without the request viem prints around it.
function getValidationRejection(error: unknown): string | undefined {
  const cause =
    error instanceof BaseError
      ? error.walk((inner) => inner instanceof Error && VALIDATION_REASON.test(inner.message))
      : error;
  return cause instanceof Error ? cause.message.match(VALIDATION_REASON)?.[0].trim() : undefined;
}

// The USDC Circle's paymaster kept for this operation, from the event it emits after refunding the rest.
function getChargedUsdc(receipt: PaymasterOperationReceipt): bigint | undefined {
  return parseEventLogs({
    abi: circlePaymasterAbi,
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
  bundler: Pick<PaymasterOperations, "waitForUserOperationReceipt">,
  hash: Hash,
  payer: Address,
  timeoutMs = OPERATION_RECEIPT_TIMEOUT_MS,
): Promise<Hash> {
  let receipt: PaymasterOperationReceipt;
  try {
    receipt = await bundler.waitForUserOperationReceipt({ hash, timeout: timeoutMs });
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
    const fees =
      charged === undefined
        ? "Network fees were"
        : `Network fees of ${formatUnits(charged, CIRCLE_PAYMASTER_TOKEN_DECIMALS)} USDC were`;
    throw new SquidDepositError(
      `The deposit reverted on Base, so no USDC went to Squid and it is still in this account. ${fees} still charged, and this account keeps its USDC-gas setup for the next try.`,
      "reverted",
      receipt.receipt.transactionHash,
    );
  }
  return receipt.receipt.transactionHash;
}

export interface ExecutePaymasterDepositInput extends PollingOptions {
  /** The quote the user reviewed, for the amount set aside minus `FEE_RESERVE_USDC`. */
  reviewedQuote: SquidDepositQuote;
  /** The executable route, checked here against the reviewed quote. */
  quote: ExecutableSquidDepositQuote;
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
 * and the batch swaps USDC for the route's bridge fee. Gas and the swap must fit inside `FEE_RESERVE_USDC` before
 * the operation is signed, then the deposit is followed to Filecoin Pay like a wallet-sent route.
 */
export async function executePaymasterSquidDeposit({
  assertCurrentContext,
  destinationClient,
  getCurrentOwner,
  onBroadcast,
  onStage,
  onSubmit,
  operations,
  quote,
  request,
  reviewedQuote,
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
  const assertSigner = async () => {
    if (isRouteExpiring(quote, ROUTE_EXPIRY_MARGIN_SECONDS))
      throw new Error("The Squid route expired. Refresh the quote.");
    assertCurrentContext();
    const owner = await getCurrentOwner();
    assertCurrentContext();
    if (owner?.toLowerCase() !== payer.toLowerCase()) throw new Error("Wallet account changed before signing");
  };

  const nativeFee = quote.transaction.value;
  try {
    assertExecutableQuoteWithinReview(quote, captureReviewedSquidDepositCaps(reviewedQuote, token));
  } catch (error) {
    throw error instanceof SquidQuoteChangedError ? new PaymasterReviewError(error.message) : error;
  }
  const [
    fundsBefore,
    code,
    fees,
    balance,
    paymasterAllowance,
    permitNonce,
    authorizationNonce,
    permitName,
    permitVersion,
    maxSwapInput,
  ] = await Promise.all([
    readFilecoinPayFunds(destinationClient, request),
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
    quoteSwapInputCap(sourceClient, token, nativeFee),
  ]);
  const delegation = getDelegationState(code);
  if (delegation === "conflict") {
    throw new Error("This account delegates to another smart account, so it cannot pay network fees in USDC.");
  }
  const gasBudget = FEE_RESERVE_USDC - maxSwapInput;
  // The paymaster falls back to an existing allowance when its permit fails, so that allowance counts against the
  // reserve too. A reverted batch never reaches its allowance reset, so its leftover stays below the last budget.
  if (gasBudget <= 0n || paymasterAllowance > gasBudget) throw new Error(FEES_ABOVE_RESERVE);
  if (balance < request.sourceAmount + FEE_RESERVE_USDC) {
    throw new PaymasterReviewError("The USDC balance no longer covers the deposit and the fee reserve.");
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
      value: gasBudget,
    },
  );
  const prepared = await operations.prepare({
    authorization,
    calls,
    paymasterData: encodePacked(["uint8", "address", "uint256", "bytes"], [0, token, gasBudget, permitSignature]),
    ...getPaymasterGasLimits(fees),
  });
  const gasMaximum = getPaymasterGasMaximum(
    {
      ...prepared,
      paymasterVerificationGasLimit: prepared.paymasterVerificationGasLimit ?? 0n,
      paymasterPostOpGasLimit: prepared.paymasterPostOpGasLimit ?? 0n,
    },
    fees,
  );
  if (gasMaximum > gasBudget) throw new Error(FEES_ABOVE_RESERVE);
  await assertSigner();
  const userOperation = { ...prepared, signature: await operations.sign(prepared) };
  // The signing prompt can outlast the route or see the account switch; a stale route would revert and still charge gas.
  await assertSigner();
  const userOperationHash = getUserOperationHash({
    chainId: CIRCLE_PAYMASTER_CHAIN_ID,
    entryPointAddress: entryPoint08Address,
    entryPointVersion: "0.8",
    userOperation,
  });
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
