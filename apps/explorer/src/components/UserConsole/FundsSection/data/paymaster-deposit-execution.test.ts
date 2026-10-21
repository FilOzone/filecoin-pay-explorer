import { NATIVE_TOKEN_ADDRESS } from "@filecoin-project/squid-evm-funding";
import { type Hash, type Hex, stringToHex } from "viem";
import {
  entryPoint08Address,
  getUserOperationHash,
  type UserOperation,
  WaitForUserOperationReceiptTimeoutError,
} from "viem/account-abstraction";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CIRCLE_PAYMASTER_ADDRESS, SIMPLE_7702_ACCOUNT_ADDRESS } from "./circle-paymaster";
import {
  awaitPaymasterOperation,
  type ExecutePaymasterDepositInput,
  executePaymasterSquidDeposit,
  type PaymasterOperationRequest,
  type PaymasterOperations,
  PaymasterReviewError,
} from "./paymaster-deposit-execution";
import { awaitSquidDepositSettlement, SquidDepositError } from "./squid-deposit-execution";
import type { ExecutableSquidDepositQuote, SquidDepositRouteRequest } from "./squid-deposit-route";

const PAYER = "0x1111111111111111111111111111111111111111" as const;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const SQUID_ROUTER = "0xce16F69375520ab01377ce7B88f5BA8C48F8D666" as const;
const BUNDLE_HASH = `0x${"bb".repeat(32)}` as Hash;
const OUR_DELEGATION: Hex = "0xef0100e6cae83bde06e4c305530e199d7217f42808555b";
const BRIDGE_FEE = 300_000_000_000_000n;

const request: SquidDepositRouteRequest = {
  owner: PAYER,
  payments: "0x5555555555555555555555555555555555555555",
  recipient: PAYER,
  sourceAmount: 9_000_000n,
  sourceChainId: 8453,
  sourceToken: USDC,
  usdfc: "0x4444444444444444444444444444444444444444",
};
const quote: ExecutableSquidDepositQuote = {
  destinationAmount: 9_000_000_000_000_000_000n,
  fees: [
    {
      amount: BRIDGE_FEE,
      name: "Bridge fee",
      token: { address: NATIVE_TOKEN_ADDRESS, chainId: 8453, decimals: 18, symbol: "ETH" },
    },
  ],
  gasCosts: [],
  minimumDestinationAmount: 8_900_000_000_000_000_000n,
  quoteId: "quote-1",
  sourceAmount: 9_000_000n,
  sourceChainId: 8453,
  transaction: { data: "0x12345678", gasLimit: 500_000n, target: SQUID_ROUTER, value: BRIDGE_FEE },
};
// 0.5 USDC reserve minus the 121,200 swap cap (120,000 quoted plus 1%).
const GAS_BUDGET = 378_800n;

vi.mock("./squid-deposit-execution", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./squid-deposit-execution")>()),
  awaitSquidDepositSettlement: vi.fn(),
  readFilecoinPayFunds: vi.fn(async () => 0n),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

type Chain = {
  code?: Hex;
  balance?: bigint;
  paymasterAllowance?: bigint;
  swapInput?: bigint;
};

function sourceClient({ balance = 10_000_000n, code, paymasterAllowance = 0n, swapInput = 120_000n }: Chain = {}) {
  return {
    getCode: vi.fn(async () => code),
    getTransactionCount: vi.fn(async () => 3),
    multicall: vi.fn(async () => [35_000, 0, 2_500_000_000n]),
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      const results: Record<string, unknown> = {
        allowance: paymasterAllowance,
        balanceOf: balance,
        nonces: 0n,
      };
      return results[functionName];
    }),
    simulateContract: vi.fn(async () => ({ result: [swapInput, 0n, 0, 0n] })),
    waitForTransactionReceipt: vi.fn(),
  } as unknown as ExecutePaymasterDepositInput["sourceClient"];
}

const hashOf = (userOperation: UserOperation<"0.8">) =>
  getUserOperationHash({
    chainId: 8453,
    entryPointAddress: entryPoint08Address,
    entryPointVersion: "0.8",
    userOperation,
  });

function operations(overrides: Partial<PaymasterOperations> = {}) {
  const events: string[] = [];
  const ops: PaymasterOperations = {
    prepare: vi.fn(
      async (operation: PaymasterOperationRequest): Promise<UserOperation<"0.8">> => ({
        callData: "0x",
        callGasLimit: 600_000n,
        maxFeePerGas: 2_000_000n,
        maxPriorityFeePerGas: 1_000_000n,
        nonce: 0n,
        paymaster: CIRCLE_PAYMASTER_ADDRESS,
        paymasterData: operation.paymasterData,
        paymasterPostOpGasLimit: operation.paymasterPostOpGasLimit,
        paymasterVerificationGasLimit: operation.paymasterVerificationGasLimit,
        preVerificationGas: 60_000n,
        sender: PAYER,
        signature: "0x",
        verificationGasLimit: 150_000n,
      }),
    ),
    sign: vi.fn(async () => {
      events.push("sign");
      return "0x5167" as Hex;
    }),
    signPermit: vi.fn(async () => "0x9e41" as Hex),
    send: vi.fn(async (userOperation) => {
      events.push("send");
      return hashOf(userOperation);
    }),
    waitForUserOperationReceipt: vi.fn(async ({ hash }) => ({
      receipt: { transactionHash: BUNDLE_HASH },
      sender: PAYER,
      success: true,
      userOpHash: hash,
    })),
    ...overrides,
  };
  return { events, ops };
}

function run(overrides: Partial<ExecutePaymasterDepositInput> = {}, chain: Chain = {}) {
  const { events, ops } = operations();
  const settle = vi.mocked(awaitSquidDepositSettlement).mockResolvedValue({
    depositedAmount: 9_000_000_000_000_000_000n,
    destinationTransactionHash: BUNDLE_HASH,
    transactionHash: BUNDLE_HASH,
  });
  const signAuthorization = vi.fn(async (authorization: { contractAddress: Hex; chainId: number; nonce: number }) => ({
    address: authorization.contractAddress,
    chainId: authorization.chainId,
    nonce: authorization.nonce,
    r: "0x01" as Hex,
    s: "0x02" as Hex,
    yParity: 0,
  }));
  const onSubmit = vi.fn(() => {
    events.push("submit");
  });
  const input: ExecutePaymasterDepositInput = {
    assertCurrentContext: () => undefined,
    destinationClient: {} as ExecutePaymasterDepositInput["destinationClient"],
    getCurrentOwner: async () => PAYER,
    onSubmit,
    operations: ops,
    quote,
    refreshQuote: vi.fn(async () => quote),
    request,
    reviewedQuote: quote,
    signAuthorization,
    sourceClient: sourceClient(chain),
    squid: { integratorId: "test" },
    ...overrides,
  };
  return { events, input, onSubmit, ops, settle, signAuthorization };
}

describe("executePaymasterSquidDeposit", () => {
  it("authorizes the delegation once, signs the permit for the reserve left after the swap, and follows the bundle to Squid", async () => {
    const { events, input, onSubmit, ops, settle, signAuthorization } = run();

    await expect(executePaymasterSquidDeposit(input)).resolves.toMatchObject({ transactionHash: BUNDLE_HASH });

    expect(signAuthorization).toHaveBeenCalledWith({
      chainId: 8453,
      contractAddress: SIMPLE_7702_ACCOUNT_ADDRESS,
      nonce: 3,
    });
    expect(ops.signPermit).toHaveBeenCalledWith(
      { chainId: 8453, name: "USD Coin", verifyingContract: USDC, version: "2" },
      { deadline: 2n ** 256n - 1n, nonce: 0n, owner: PAYER, spender: CIRCLE_PAYMASTER_ADDRESS, value: GAS_BUDGET },
    );
    expect(vi.mocked(ops.prepare).mock.calls[0]?.[0]).toMatchObject({
      authorization: expect.objectContaining({ address: SIMPLE_7702_ACCOUNT_ADDRESS }),
      paymasterPostOpGasLimit: 35_000n,
      paymasterVerificationGasLimit: 200_000n,
    });
    // The marker is written before the operation leaves, so a reload can find it.
    expect(events).toEqual(["sign", "submit", "send"]);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ userOperationHash: expect.any(String) }));
    expect(settle).toHaveBeenCalledWith(expect.objectContaining({ quoteId: "quote-1", transactionHash: BUNDLE_HASH }));
  });

  it("reuses an existing delegation without a new authorization", async () => {
    const { input, ops, signAuthorization } = run({}, { code: OUR_DELEGATION });

    await executePaymasterSquidDeposit(input);

    expect(signAuthorization).not.toHaveBeenCalled();
    expect(vi.mocked(ops.prepare).mock.calls[0]?.[0].authorization).toBeUndefined();
  });

  // A deposit that needs another review goes back to the form; one that needs time stays reviewed to retry.
  it.each([
    [
      "another delegate is installed",
      { code: "0xef01001111111111111111111111111111111111111111" as Hex },
      {},
      "another smart account",
      PaymasterReviewError,
    ],
    [
      "the route's bridge fee rose above its cap",
      {},
      { quote: { ...quote, transaction: { ...quote.transaction, value: 450_000_000_000_001n } } },
      "native route payment exceeded the reviewed maximum",
      PaymasterReviewError,
    ],
    [
      "the route's minimum received fell below the reviewed amount",
      {},
      { quote: { ...quote, minimumDestinationAmount: quote.minimumDestinationAmount - 1n } },
      "minimum USDFC received fell below",
      PaymasterReviewError,
    ],
    [
      "the bridge-fee swap alone uses up the reserve",
      { swapInput: 495_050n },
      {},
      "Network fees are above the reserve. Try again later.",
      Error,
    ],
    [
      "the bridge-fee swap leaves nothing for gas",
      { swapInput: 495_049n },
      {},
      "Network fees are above the reserve. Try again later.",
      Error,
    ],
    [
      "the balance no longer covers the deposit and the reserve",
      { balance: 9_499_999n },
      {},
      "no longer covers",
      PaymasterReviewError,
    ],
  ] as const)("fails before signing when %s", async (_label, chain, overrides, message, kind) => {
    const { input, ops, signAuthorization } = run(overrides, chain);

    const failure = await executePaymasterSquidDeposit(input).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(kind);
    expect(failure).toHaveProperty("message", expect.stringContaining(message));
    if (kind === Error) expect(failure).not.toBeInstanceOf(PaymasterReviewError);
    expect(signAuthorization).not.toHaveBeenCalled();
    expect(ops.signPermit).not.toHaveBeenCalled();
    expect(ops.send).not.toHaveBeenCalled();
  });

  it("fails before the operation is signed when the bundler's estimate does not fit the reserve", async () => {
    const { input, ops } = run();
    const estimate = vi.mocked(ops.prepare).getMockImplementation();
    vi.mocked(ops.prepare).mockImplementation(async (operation) => {
      if (!estimate) throw new Error("prepare is not mocked");
      return { ...(await estimate(operation)), preVerificationGas: 100_000_000n };
    });

    await expect(executePaymasterSquidDeposit(input)).rejects.toThrow(
      "Network fees are above the reserve. Try again later.",
    );
    expect(ops.sign).not.toHaveBeenCalled();
    expect(ops.send).not.toHaveBeenCalled();
  });

  it("retries after a reverted operation left its unused permit allowance behind", async () => {
    // The new permit overwrites the leftover, so even one above the gas budget does not block the retry.
    const { input, ops } = run({}, { paymasterAllowance: GAS_BUDGET + 1n });

    await expect(executePaymasterSquidDeposit(input)).resolves.toMatchObject({ transactionHash: BUNDLE_HASH });
    expect(vi.mocked(ops.signPermit).mock.calls[0]?.[1].value).toBe(GAS_BUDGET);
    expect(ops.send).toHaveBeenCalledOnce();
  });

  it("sends nothing when the account switches during the signing prompt", async () => {
    let owner: Hex = PAYER;
    const { input, ops, onSubmit } = run({ getCurrentOwner: async () => owner });
    vi.mocked(ops.sign).mockImplementation(async () => {
      owner = "0x2222222222222222222222222222222222222222";
      return "0x5167";
    });

    await expect(executePaymasterSquidDeposit(input)).rejects.toThrow("Wallet account changed before signing");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(ops.send).not.toHaveBeenCalled();
  });

  describe("a route that expires while the payer signs", () => {
    const expiringIn = (seconds: number, quoteId: string): ExecutableSquidDepositQuote => ({
      ...quote,
      quoteId,
      transaction: {
        ...quote.transaction,
        data: stringToHex(quoteId),
        expiresAt: Math.floor(Date.now() / 1000) + seconds,
      },
    });
    const waitSeconds = (seconds: number) => vi.setSystemTime(Date.now() + seconds * 1000);

    it("is replaced before the operation is built, keeping the authorization and permit", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const refreshQuote = vi.fn(async () => expiringIn(120, "quote-2"));
      const { input, ops, onSubmit, settle, signAuthorization } = run({
        quote: expiringIn(60, "quote-1"),
        refreshQuote,
      });
      vi.mocked(ops.signPermit).mockImplementation(async () => {
        waitSeconds(40);
        return "0x9e41";
      });

      await executePaymasterSquidDeposit(input);

      expect(refreshQuote).toHaveBeenCalledOnce();
      expect(signAuthorization).toHaveBeenCalledOnce();
      expect(ops.signPermit).toHaveBeenCalledOnce();
      expect(ops.sign).toHaveBeenCalledOnce();
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ quote: expect.objectContaining({ quoteId: "quote-2" }) }),
      );
      expect(settle).toHaveBeenCalledWith(expect.objectContaining({ quoteId: "quote-2" }));
    });

    it("is replaced and signed again when it runs out during the operation prompt", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const refreshQuote = vi.fn(async () => expiringIn(120, "quote-2"));
      const { input, ops } = run({ quote: expiringIn(60, "quote-1"), refreshQuote });
      vi.mocked(ops.sign).mockImplementationOnce(async () => {
        waitSeconds(55);
        return "0x5167";
      });

      await executePaymasterSquidDeposit(input);

      expect(refreshQuote).toHaveBeenCalledOnce();
      expect(ops.signPermit).toHaveBeenCalledOnce();
      expect(ops.sign).toHaveBeenCalledTimes(2);
      expect(ops.send).toHaveBeenCalledOnce();
      expect(vi.mocked(ops.prepare).mock.calls[1]?.[0].calls).toContainEqual(
        expect.objectContaining({ data: stringToHex("quote-2") }),
      );
    });

    it("goes back to review when it keeps running out", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const { input, ops, onSubmit } = run({
        quote: expiringIn(60, "quote-1"),
        refreshQuote: vi.fn(async () => expiringIn(60, "quote-2")),
      });
      vi.mocked(ops.sign).mockImplementation(async () => {
        waitSeconds(55);
        return "0x5167";
      });

      const failure = await executePaymasterSquidDeposit(input).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(PaymasterReviewError);
      expect(failure).toHaveProperty("message", "The Squid route kept expiring before the deposit could be sent.");
      expect(ops.sign).toHaveBeenCalledTimes(2);
      expect(onSubmit).not.toHaveBeenCalled();
      expect(ops.send).not.toHaveBeenCalled();
    });

    it("goes back to review when the replacement's bridge fee no longer fits the signed permit", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const fresh = expiringIn(120, "quote-2");
      const { input, ops } = run({
        quote: expiringIn(60, "quote-1"),
        refreshQuote: vi.fn(async () => ({ ...fresh, transaction: { ...fresh.transaction, value: BRIDGE_FEE + 1n } })),
      });
      vi.mocked(ops.signPermit).mockImplementation(async () => {
        waitSeconds(40);
        return "0x9e41";
      });

      await expect(executePaymasterSquidDeposit(input)).rejects.toBeInstanceOf(PaymasterReviewError);
      expect(ops.sign).not.toHaveBeenCalled();
      expect(ops.send).not.toHaveBeenCalled();
    });
  });

  it("reports a bundler validation rejection as nothing charged", async () => {
    const { input, ops } = run();
    vi.mocked(ops.send).mockRejectedValue(new Error("AA33 reverted: paymaster validation failed"));

    const failure = await executePaymasterSquidDeposit(input).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SquidDepositError);
    expect(failure).toMatchObject({
      message:
        "The bundler refused the deposit, so nothing was charged and your USDC is still in this account (AA33 reverted: paymaster validation failed).",
      reason: "failed",
    });
  });

  it("keeps a lost submission answer unresolved rather than proof of rejection", async () => {
    const { input, ops } = run();
    vi.mocked(ops.send).mockRejectedValue(new TypeError("fetch failed"));

    await expect(executePaymasterSquidDeposit(input)).rejects.toMatchObject({ reason: "timeout" });
  });

  it("refuses a bundler that reports a different operation than the one signed", async () => {
    const { input, ops, settle } = run();
    vi.mocked(ops.send).mockResolvedValue(`0x${"ee".repeat(32)}`);

    await expect(executePaymasterSquidDeposit(input)).rejects.toMatchObject({ reason: "timeout" });
    expect(settle).not.toHaveBeenCalled();
  });
});

describe("awaitPaymasterOperation", () => {
  const hash = `0x${"aa".repeat(32)}` as Hash;
  const receiptOps = (overrides: { sender?: Hex; success?: boolean } = {}) => ({
    waitForUserOperationReceipt: vi.fn(async () => ({
      receipt: { transactionHash: BUNDLE_HASH },
      sender: PAYER,
      success: true,
      userOpHash: hash,
      ...overrides,
    })),
  });

  it("returns the bundle hash of a successful operation", async () => {
    await expect(awaitPaymasterOperation(receiptOps(), hash, PAYER)).resolves.toBe(BUNDLE_HASH);
  });

  it("treats a failed operation inside a successful bundle as reverted, with gas charged", async () => {
    await expect(awaitPaymasterOperation(receiptOps({ success: false }), hash, PAYER)).rejects.toMatchObject({
      message: expect.stringContaining("it is still in this account. Network fees were still charged"),
      reason: "reverted",
      transactionHash: BUNDLE_HASH,
    });
  });

  it("does not accept another payer's receipt", async () => {
    await expect(
      awaitPaymasterOperation(receiptOps({ sender: "0x2222222222222222222222222222222222222222" }), hash, PAYER),
    ).rejects.toMatchObject({ reason: "timeout" });
  });

  it("reports an operation not yet included as unresolved", async () => {
    const ops = {
      waitForUserOperationReceipt: vi.fn(async () => {
        throw new WaitForUserOperationReceiptTimeoutError({ hash });
      }),
    };

    await expect(awaitPaymasterOperation(ops, hash, PAYER, 10)).rejects.toMatchObject({
      message: expect.stringContaining("has not been included on Base yet"),
      reason: "timeout",
    });
  });
});
