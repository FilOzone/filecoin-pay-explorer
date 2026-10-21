import {
  type Account,
  type Address,
  BaseError,
  type BundlerRpcSchema,
  type Chain,
  encodePacked,
  erc20Abi,
  type Hash,
  type Hex,
  http,
  maxUint256,
  type PublicClient,
  parseAbi,
  rpcSchema,
  type SignedAuthorization,
  type Transport,
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
  CIRCLE_PAYMASTER_TOKEN_NAME,
  CIRCLE_PAYMASTER_TOKEN_VERSION,
  getDelegationState,
  getPaymasterGasLimits,
  getPaymasterGasMaximum,
  readPaymasterFees,
  SIMPLE_7702_ACCOUNT_ADDRESS,
} from "./circle-paymaster";
import { buildPaymasterDepositCalls, quoteSwapInputCap } from "./paymaster-batch";
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
} from "./squid-deposit-route";
import { FEE_RESERVE_USDC } from "./usdc-gas-payer";

/** The reviewed deposit no longer holds and nothing was sent: it must be reviewed again. */
export class PaymasterReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymasterReviewError";
  }
}

const FEES_ABOVE_RESERVE = "Network fees are above the reserve. Try again later.";

// Waiting for inclusion before the deposit is reported unresolved; Base includes a bundle in seconds.
const OPERATION_RECEIPT_TIMEOUT_MS = 120_000;
// A signed operation is sent only with this much of its route left: Base includes it within a few blocks, and a route
// that expires first reverts the batch and still charges gas.
const OPERATION_SEND_MARGIN_SECONDS = 10;
// Each expired route costs the payer another signing prompt; past this, the deposit goes back to review.
const MAX_OPERATION_SIGNATURES = 2;

const permitAbi = parseAbi(["function nonces(address owner) view returns (uint256)"]);

type PimlicoGasPriceSchema = {
  Method: "pimlico_getUserOperationGasPrice";
  Parameters: [];
  ReturnType: Record<"slow" | "standard" | "fast", { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex }>;
};

// The parts of an operation receipt the deposit checks.
type PaymasterOperationReceipt = Pick<UserOperationReceipt<"0.8">, "sender" | "success" | "userOpHash"> & {
  receipt: { transactionHash: Hash };
};

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

/**
 * Waits for the operation's own receipt. A successful bundle does not prove the operation inside it
 * succeeded, so its sender, hash and `success` are checked. Returns the bundle transaction hash.
 */
export async function awaitPaymasterOperation(
  bundler: {
    waitForUserOperationReceipt(parameters: { hash: Hash; timeout: number }): Promise<PaymasterOperationReceipt>;
  },
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
        ? "The deposit has not been included on Base yet, so whether network fees were charged is not known. Your USDC stays in this account unless it is included. Check again in a minute; if it is still not included after a few minutes, dismiss it and check this account's USDC before starting another deposit."
        : "The bundler could not be reached to confirm this deposit, so whether network fees were charged is not known. Check again before starting another deposit.",
      "timeout",
    );
  }
  if (receipt.userOpHash !== hash || receipt.sender.toLowerCase() !== payer.toLowerCase()) {
    throw new SquidDepositError("The bundler reported a different operation than the one signed.", "timeout");
  }
  if (!receipt.success) {
    throw new SquidDepositError(
      "The deposit reverted on Base, so no USDC went to Squid and it is still in this account. Network fees were still charged, and this account keeps its USDC-gas setup for the next try.",
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
  /** A fresh executable route for the same request, for when signing outlasts the current one. */
  refreshQuote(): Promise<ExecutableSquidDepositQuote>;
  request: SquidDepositRouteRequest;
  /** The payer's Simple7702 account, which the operation is built for. */
  account: SmartAccount;
  bundler: Pick<
    PaymasterBundler,
    "prepareUserOperation" | "request" | "sendUserOperation" | "waitForUserOperationReceipt"
  >;
  /** Signs the permit and the operation as typed data. */
  walletClient: Pick<WalletClient<Transport, Chain | undefined, Account>, "account" | "signTypedData">;
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
  account,
  assertCurrentContext,
  bundler,
  destinationClient,
  getCurrentOwner,
  onBroadcast,
  onStage,
  onSubmit,
  quote,
  refreshQuote,
  request,
  reviewedQuote,
  signAuthorization,
  sourceClient,
  squid,
  walletClient,
  ...polling
}: ExecutePaymasterDepositInput): Promise<SquidDepositResult> {
  const payer = request.owner;
  const token = request.sourceToken;
  if (quote.sourceChainId !== CIRCLE_PAYMASTER_CHAIN_ID || request.sourceChainId !== CIRCLE_PAYMASTER_CHAIN_ID) {
    throw new Error("USDC gas is only available on Base");
  }
  const assertSigner = async () => {
    assertCurrentContext();
    const owner = await getCurrentOwner();
    assertCurrentContext();
    if (owner?.toLowerCase() !== payer.toLowerCase()) throw new Error("Wallet account changed before signing");
  };
  const reviewedCaps = captureReviewedSquidDepositCaps(reviewedQuote, token);
  // Any route outside the review needs a new quote, and nothing has been sent yet, so the deposit goes back to review.
  const assertWithinReview = (route: ExecutableSquidDepositQuote) => {
    try {
      assertExecutableQuoteWithinReview(route, reviewedCaps);
    } catch (error) {
      throw error instanceof Error ? new PaymasterReviewError(error.message) : error;
    }
  };

  const nativeFee = quote.transaction.value;
  assertWithinReview(quote);
  const [fundsBefore, code, fees, balance, permitNonce, authorizationNonce, maxSwapInput] = await Promise.all([
    readFilecoinPayFunds(destinationClient, request),
    sourceClient.getCode({ address: payer }),
    readPaymasterFees(sourceClient),
    sourceClient.readContract({ abi: erc20Abi, address: token, functionName: "balanceOf", args: [payer] }),
    sourceClient.readContract({ abi: permitAbi, address: token, functionName: "nonces", args: [payer] }),
    sourceClient.getTransactionCount({ address: payer }),
    quoteSwapInputCap(sourceClient, token, nativeFee),
  ]);
  const delegation = getDelegationState(code);
  if (delegation === "conflict") {
    throw new PaymasterReviewError(
      "This account delegates to another smart account, so it cannot pay network fees in USDC.",
    );
  }
  const gasBudget = FEE_RESERVE_USDC - maxSwapInput;
  if (gasBudget <= 0n) throw new Error(FEES_ABOVE_RESERVE);
  if (balance < request.sourceAmount + FEE_RESERVE_USDC) {
    throw new PaymasterReviewError("The USDC balance no longer covers the deposit and the fee reserve.");
  }
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
  // Lets the paymaster take up to the gas budget. It cannot read block time during validation, so the permit never expires.
  const permitSignature = await walletClient.signTypedData({
    account: walletClient.account,
    domain: {
      chainId: CIRCLE_PAYMASTER_CHAIN_ID,
      name: CIRCLE_PAYMASTER_TOKEN_NAME,
      verifyingContract: token,
      version: CIRCLE_PAYMASTER_TOKEN_VERSION,
    },
    message: {
      deadline: maxUint256,
      nonce: permitNonce,
      owner: payer,
      spender: CIRCLE_PAYMASTER_ADDRESS,
      value: gasBudget,
    },
    primaryType: "Permit",
    types: PERMIT_TYPES,
  });
  let route = quote;
  let userOperation: UserOperation<"0.8"> | undefined;
  for (let signatures = 0; !userOperation; signatures++) {
    if (signatures === MAX_OPERATION_SIGNATURES) {
      throw new PaymasterReviewError("The Squid route kept expiring before the deposit could be sent.");
    }
    // The prompts so far can outlast the route. The authorization and permit do not depend on it, so a fresh route
    // keeps them, as long as its bridge fee still fits the swap they were sized for.
    if (isRouteExpiring(route, ROUTE_EXPIRY_MARGIN_SECONDS)) {
      route = await refreshQuote();
      assertWithinReview(route);
      if (route.transaction.value > nativeFee) {
        throw new PaymasterReviewError("Squid's bridge fee rose while the deposit was being signed.");
      }
      assertCurrentContext();
    }
    const { fast } = await bundler.request({ method: "pimlico_getUserOperationGasPrice", params: [] });
    const { account: _account, ...prepared } = await bundler.prepareUserOperation({
      account,
      authorization,
      calls: buildPaymasterDepositCalls({
        maxSwapInput,
        payer,
        sourceAmount: request.sourceAmount,
        sourceToken: token,
        transaction: route.transaction,
      }),
      maxFeePerGas: BigInt(fast.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(fast.maxPriorityFeePerGas),
      paymaster: CIRCLE_PAYMASTER_ADDRESS,
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
    // Simple7702Account checks a plain ECDSA signature over the EIP-712 operation hash.
    const signature = await walletClient.signTypedData({
      account: walletClient.account,
      ...getUserOperationTypedData({
        chainId: CIRCLE_PAYMASTER_CHAIN_ID,
        entryPointAddress: entryPoint08Address,
        userOperation: prepared,
      }),
    });
    // The signing prompt can see the account switch, or outlast the route, which would revert and still charge gas.
    await assertSigner();
    if (!isRouteExpiring(route, OPERATION_SEND_MARGIN_SECONDS)) userOperation = { ...prepared, signature };
  }
  const userOperationHash = getUserOperationHash({
    chainId: CIRCLE_PAYMASTER_CHAIN_ID,
    entryPointAddress: entryPoint08Address,
    entryPointVersion: "0.8",
    userOperation,
  });
  onSubmit?.({ fundsBefore, quote: route, userOperationHash });
  let sentHash: Hash;
  try {
    sentHash = await bundler.sendUserOperation({ ...userOperation, entryPointAddress: entryPoint08Address });
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
  const transactionHash = await awaitPaymasterOperation(bundler, userOperationHash, payer);
  onBroadcast?.({ fundsBefore, quote: route, transactionHash });

  return awaitSquidDepositSettlement({
    ...polling,
    destinationClient,
    fundsBefore,
    minimumDestinationAmount: route.minimumDestinationAmount,
    onStage,
    quoteId: route.quoteId,
    sourceChainId: request.sourceChainId,
    sourceClient,
    squid,
    target: request,
    transactionHash,
  });
}
