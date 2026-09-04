import { SQUID_ROUTER_ADDRESS } from "@filecoin-project/squid-evm-funding";
import { type Address, decodeFunctionData, erc20Abi, getAddress, type Hash, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  awaitSquidDepositSettlement,
  executeSquidDeposit,
  fetchSquidDepositStatus,
  type SquidDepositDestinationClient,
  SquidDepositError,
  type SquidDepositSourceClient,
  type SquidDepositStage,
  type SquidDepositWalletClient,
} from "./squid-deposit-execution";
import type { ExecutableSquidDepositQuote } from "./squid-deposit-route";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const RECIPIENT = "0x2222222222222222222222222222222222222222" as const;
const USDC = "0x3333333333333333333333333333333333333333" as const;
const USDFC = "0x4444444444444444444444444444444444444444" as const;
const PAYMENTS = "0x5555555555555555555555555555555555555555" as const;
const APPROVAL_HASH = `0x${"a".repeat(64)}` as Hash;
const ROUTE_HASH = `0x${"b".repeat(64)}` as Hash;

const request = {
  owner: OWNER,
  recipient: RECIPIENT,
  sourceChainId: 8453,
  sourceToken: USDC,
  sourceAmount: 100_000_000n,
  payments: PAYMENTS,
  usdfc: USDFC,
} as const;

const quote: ExecutableSquidDepositQuote = {
  quoteId: "quote-1",
  sourceChainId: 8453,
  sourceAmount: 100_000_000n,
  destinationAmount: 93n,
  minimumDestinationAmount: 92n,
  fees: [],
  gasCosts: [],
  transaction: { target: SQUID_ROUTER_ADDRESS, data: "0xabcdef", value: 10n, gasLimit: 599_399n },
};

const statusResponse = (status: string | null, httpStatus = 200) =>
  new Response(status === null ? "" : JSON.stringify({ squidTransactionStatus: status }), { status: httpStatus });

function fakeDestination(fundsSequence: bigint[]): SquidDepositDestinationClient {
  const funds = [...fundsSequence];
  return {
    readContract: vi.fn(async () => [funds.length > 1 ? (funds.shift() as bigint) : funds[0], 0n, 0n, 0n]),
  } as unknown as SquidDepositDestinationClient;
}

function fakeSource({
  allowance = 0n,
  approvalUpdatesAllowance = true,
  nativeBalance = 10n ** 18n,
  receiptStatus = "success" as "success" | "reverted",
  tokenBalance = 200_000_000n,
  totalFee,
}: {
  allowance?: bigint;
  approvalUpdatesAllowance?: boolean;
  nativeBalance?: bigint;
  receiptStatus?: "success" | "reverted";
  tokenBalance?: bigint;
  totalFee?: bigint;
} = {}) {
  let allowanceReads = 0;
  return {
    getBalance: vi.fn(async () => nativeBalance),
    getChainId: vi.fn(async () => 8453),
    estimateTotalFee: vi.fn(
      async ({ gas, gasPrice, maxFeePerGas }: { gas: bigint; gasPrice?: bigint; maxFeePerGas?: bigint }) =>
        totalFee ?? gas * (gasPrice ?? maxFeePerGas ?? 0n),
    ),
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === "balanceOf") return tokenBalance;
      allowanceReads += 1;
      return approvalUpdatesAllowance && allowanceReads > 1 ? request.sourceAmount : allowance;
    }),
    waitForTransactionReceipt: vi.fn(async () => ({ status: receiptStatus })),
  } as unknown as SquidDepositSourceClient;
}

function fakeWallet() {
  let nonce = 0;
  return {
    account: { address: OWNER },
    getChainId: vi.fn(async () => 8453),
    prepareTransactionRequest: vi.fn(async (transaction: { to: Address; data: Hex; value: bigint }) => ({
      ...transaction,
      gas: transaction.to === USDC ? 60_000n : 599_399n,
      gasPrice: 1_000_000_000n,
      nonce: nonce++,
    })),
    sendTransaction: vi.fn(async ({ to }: { to: Address }) => (to === USDC ? APPROVAL_HASH : ROUTE_HASH)),
  } as unknown as SquidDepositWalletClient & {
    prepareTransactionRequest: ReturnType<typeof vi.fn>;
    sendTransaction: ReturnType<typeof vi.fn>;
  };
}

const noSleep = async () => undefined;
const signingChecks = {
  approvalRequired: true,
  assertCurrentContext: vi.fn(),
  getCurrentOwner: vi.fn(async () => OWNER),
  maxNativeFee: 1_000_000_000_000_000n,
};

describe("fetchSquidDepositStatus", () => {
  it.each([
    ["pending", null, 404],
    ["success", "success", 200],
    ["hook-failed", "partial_success", 200],
    ["failed", "refund", 200],
    ["needs-gas", "needs_gas", 200],
    ["pending", "ongoing", 200],
  ])("maps Squid's answer to %s", async (expected, status, httpStatus) => {
    const fetch = vi.fn(async () => statusResponse(status, httpStatus));
    await expect(
      fetchSquidDepositStatus(
        { transactionHash: ROUTE_HASH, sourceChainId: 8453, quoteId: "quote-1" },
        { integratorId: "id", fetch },
      ),
    ).resolves.toBe(expected);
    const [url] = fetch.mock.calls[0] as unknown as [string];
    expect(url).toBe(
      `https://v2.api.squidrouter.com/v2/status?transactionId=${ROUTE_HASH}&fromChainId=8453&toChainId=314&quoteId=quote-1`,
    );
  });

  it("throws on other HTTP failures", async () => {
    const fetch = vi.fn(async () => statusResponse(null, 500));
    await expect(
      fetchSquidDepositStatus(
        { transactionHash: ROUTE_HASH, sourceChainId: 8453, quoteId: "quote-1" },
        { integratorId: "id", fetch },
      ),
    ).rejects.toThrow("Squid status request failed (500)");
  });
});

describe("awaitSquidDepositSettlement", () => {
  const target = { payments: PAYMENTS, usdfc: USDFC, recipient: RECIPIENT };

  it("waits for Squid, then for the Filecoin Pay balance to grow", async () => {
    const responses = [statusResponse(null, 404), statusResponse("ongoing"), statusResponse("success")];
    const fetch = vi.fn(async () => responses.shift() as Response);
    const stages: SquidDepositStage[] = [];

    const result = await awaitSquidDepositSettlement({
      destinationClient: fakeDestination([100n, 100n, 192n]),
      fundsBefore: 100n,
      minimumDestinationAmount: 92n,
      onStage: (stage) => stages.push(stage),
      quoteId: "quote-1",
      sleep: noSleep,
      sourceChainId: 8453,
      squid: { integratorId: "id", fetch },
      target,
      transactionHash: ROUTE_HASH,
    });

    expect(result).toEqual({ transactionHash: ROUTE_HASH, fundsBefore: 100n, fundsAfter: 192n, depositedAmount: 92n });
    expect(stages).toEqual(["bridging", "verifying"]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("skips Squid status for same-chain routes", async () => {
    const fetch = vi.fn();
    const result = await awaitSquidDepositSettlement({
      destinationClient: fakeDestination([150n]),
      fundsBefore: 100n,
      minimumDestinationAmount: 50n,
      quoteId: "quote-1",
      sleep: noSleep,
      sourceChainId: 314,
      squid: { integratorId: "id", fetch },
      target,
      transactionHash: ROUTE_HASH,
    });
    expect(result.depositedAmount).toBe(50n);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["partial_success", "hook-failed", "USDFC reached your wallet"],
    ["failed", "failed", "could not complete the route"],
  ])("reports %s as a %s failure", async (status, reason, message) => {
    const fetch = vi.fn(async () => statusResponse(status));
    const attempt = awaitSquidDepositSettlement({
      destinationClient: fakeDestination([100n]),
      fundsBefore: 100n,
      minimumDestinationAmount: 1n,
      quoteId: "quote-1",
      sleep: noSleep,
      sourceChainId: 8453,
      squid: { integratorId: "id", fetch },
      target,
      transactionHash: ROUTE_HASH,
    });
    await expect(attempt).rejects.toMatchObject({ name: "SquidDepositError", reason, transactionHash: ROUTE_HASH });
    await expect(attempt).rejects.toThrow(message);
  });

  it("keeps NEEDS_GAS distinct and actionable for later recovery", async () => {
    const attempt = awaitSquidDepositSettlement({
      destinationClient: fakeDestination([100n]),
      fundsBefore: 100n,
      minimumDestinationAmount: 1n,
      quoteId: "quote-1",
      sleep: noSleep,
      sourceChainId: 8453,
      squid: { integratorId: "id", fetch: vi.fn(async () => statusResponse("needs_gas")) },
      target,
      transactionHash: ROUTE_HASH,
    });
    await expect(attempt).rejects.toMatchObject({ reason: "needs-gas", transactionHash: ROUTE_HASH });
    await expect(attempt).rejects.toThrow("Add gas from the Squid route link");
  });

  it("tolerates a single failed status request", async () => {
    const responses = [statusResponse(null, 500), statusResponse("success")];
    const fetch = vi.fn(async () => responses.shift() as Response);
    const result = await awaitSquidDepositSettlement({
      destinationClient: fakeDestination([192n]),
      fundsBefore: 100n,
      minimumDestinationAmount: 92n,
      quoteId: "quote-1",
      sleep: noSleep,
      sourceChainId: 8453,
      squid: { integratorId: "id", fetch },
      target,
      transactionHash: ROUTE_HASH,
    });
    expect(result).toEqual({ transactionHash: ROUTE_HASH, fundsBefore: 100n, fundsAfter: 192n, depositedAmount: 92n });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reports a status service outage after repeated failures without dropping the hash", async () => {
    const fetch = vi.fn(async () => statusResponse(null, 500));
    const attempt = awaitSquidDepositSettlement({
      destinationClient: fakeDestination([100n]),
      fundsBefore: 100n,
      minimumDestinationAmount: 1n,
      maxStatusFailures: 3,
      quoteId: "quote-1",
      sleep: noSleep,
      sourceChainId: 8453,
      squid: { integratorId: "id", fetch },
      target,
      transactionHash: ROUTE_HASH,
    });
    await expect(attempt).rejects.toMatchObject({
      name: "SquidDepositError",
      reason: "timeout",
      transactionHash: ROUTE_HASH,
    });
    await expect(attempt).rejects.toThrow(
      "Squid's status service is not answering (Squid status request failed (500)). Keep this page open or check back later.",
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("times out while keeping the transaction hash for a later resume", async () => {
    const fetch = vi.fn(async () => statusResponse(null, 404));
    await expect(
      awaitSquidDepositSettlement({
        destinationClient: fakeDestination([100n]),
        fundsBefore: 100n,
        minimumDestinationAmount: 1n,
        maxStatusAttempts: 2,
        quoteId: "quote-1",
        sleep: noSleep,
        sourceChainId: 8453,
        squid: { integratorId: "id", fetch },
        target,
        transactionHash: ROUTE_HASH,
      }),
    ).rejects.toMatchObject({ reason: "timeout", transactionHash: ROUTE_HASH });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not treat an unrelated credit below the reviewed minimum as settlement", async () => {
    await expect(
      awaitSquidDepositSettlement({
        destinationClient: fakeDestination([101n]),
        fundsBefore: 100n,
        maxVerifyAttempts: 2,
        minimumDestinationAmount: 92n,
        quoteId: "quote-1",
        sleep: noSleep,
        sourceChainId: 314,
        squid: { integratorId: "id" },
        target,
        transactionHash: ROUTE_HASH,
      }),
    ).rejects.toMatchObject({ reason: "timeout", transactionHash: ROUTE_HASH });
  });
});

describe("executeSquidDeposit", () => {
  it("approves exactly the USDC amount, sends the route, and reports each stage", async () => {
    const wallet = fakeWallet();
    const source = fakeSource();
    const fetch = vi.fn(async () => statusResponse("success"));
    const stages: [SquidDepositStage, Hash | undefined][] = [];
    const broadcasts: { transactionHash: Hash; fundsBefore: bigint }[] = [];

    const result = await executeSquidDeposit({
      destinationClient: fakeDestination([100n, 100n, 195n]),
      ...signingChecks,
      onBroadcast: (broadcast) => broadcasts.push(broadcast),
      onStage: (stage, hash) => stages.push([stage, hash]),
      quote,
      request,
      sleep: noSleep,
      sourceClient: source,
      squid: { integratorId: "id", fetch },
      walletClient: wallet,
    });

    expect(result).toEqual({ transactionHash: ROUTE_HASH, fundsBefore: 100n, fundsAfter: 195n, depositedAmount: 95n });
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(2);
    expect(source.estimateTotalFee).toHaveBeenCalledTimes(2);
    const [approval, route] = wallet.sendTransaction.mock.calls as unknown as [
      [{ to: string; data: `0x${string}` }],
      [{ to: string; data: string; value: bigint; gas: bigint }],
    ];
    expect(approval[0].to).toBe(USDC);
    expect(decodeFunctionData({ abi: erc20Abi, data: approval[0].data })).toEqual({
      functionName: "approve",
      args: [getAddress(SQUID_ROUTER_ADDRESS), 100_000_000n],
    });
    expect(approval[0]).toMatchObject({ gas: 60_000n, gasPrice: 1_000_000_000n });
    expect(route[0]).toMatchObject({
      to: SQUID_ROUTER_ADDRESS,
      data: "0xabcdef",
      value: 10n,
      gas: 599_399n,
      gasPrice: 1_000_000_000n,
    });
    expect(stages).toEqual([
      ["approving", undefined],
      ["swap-requested", undefined],
      ["swap-broadcast", ROUTE_HASH],
      ["bridging", ROUTE_HASH],
      ["verifying", ROUTE_HASH],
    ]);
    expect(broadcasts).toEqual([{ transactionHash: ROUTE_HASH, fundsBefore: 100n }]);
  });

  it("skips the approval only when the allowance exactly matches the amount", async () => {
    const wallet = fakeWallet();
    await executeSquidDeposit({
      destinationClient: fakeDestination([100n, 195n]),
      ...signingChecks,
      quote,
      request,
      sleep: noSleep,
      sourceClient: fakeSource({ allowance: 100_000_000n }),
      squid: { integratorId: "id", fetch: vi.fn(async () => statusResponse("success")) },
      walletClient: wallet,
    });
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("zeros an oversized allowance before approving the exact amount", async () => {
    const wallet = fakeWallet();
    await executeSquidDeposit({
      destinationClient: fakeDestination([100n, 195n]),
      ...signingChecks,
      quote,
      request,
      sleep: noSleep,
      sourceClient: fakeSource({ allowance: request.sourceAmount + 1n }),
      squid: { integratorId: "id", fetch: vi.fn(async () => statusResponse("success")) },
      walletClient: wallet,
    });
    const transactions = wallet.sendTransaction.mock.calls as unknown as Array<[{ data: Hex }]>;
    expect(
      transactions.slice(0, 2).map(([transaction]) => decodeFunctionData({ abi: erc20Abi, data: transaction.data })),
    ).toEqual([
      { functionName: "approve", args: [getAddress(SQUID_ROUTER_ADDRESS), 0n] },
      { functionName: "approve", args: [getAddress(SQUID_ROUTER_ADDRESS), request.sourceAmount] },
    ]);
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(3);
  });

  it("refuses to run when the wallet is on another network", async () => {
    const wallet = { ...fakeWallet(), getChainId: vi.fn(async () => 1) };
    await expect(
      executeSquidDeposit({
        destinationClient: fakeDestination([100n]),
        ...signingChecks,
        quote,
        request,
        sourceClient: fakeSource(),
        squid: { integratorId: "id" },
        walletClient: wallet,
      }),
    ).rejects.toThrow("Source network changed before signing");
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("reports a reverted route with its hash", async () => {
    const attempt = executeSquidDeposit({
      destinationClient: fakeDestination([100n]),
      ...signingChecks,
      quote,
      request,
      sleep: noSleep,
      sourceClient: fakeSource({ allowance: 100_000_000n, receiptStatus: "reverted" }),
      squid: { integratorId: "id" },
      walletClient: fakeWallet(),
    });
    await expect(attempt).rejects.toBeInstanceOf(SquidDepositError);
    await expect(attempt).rejects.toMatchObject({ reason: "reverted", transactionHash: ROUTE_HASH });
  });

  it("revalidates the provider account immediately before signing", async () => {
    const wallet = fakeWallet();
    await expect(
      executeSquidDeposit({
        ...signingChecks,
        destinationClient: fakeDestination([100n]),
        getCurrentOwner: vi.fn(async () => RECIPIENT),
        quote,
        request,
        sourceClient: fakeSource(),
        squid: { integratorId: "id" },
        walletClient: wallet,
      }),
    ).rejects.toThrow("Wallet account changed before signing");
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("blocks native-gas drift beyond the reviewed maximum", async () => {
    const wallet = fakeWallet();
    await expect(
      executeSquidDeposit({
        ...signingChecks,
        destinationClient: fakeDestination([100n]),
        maxNativeFee: 1n,
        quote,
        request,
        sourceClient: fakeSource(),
        squid: { integratorId: "id" },
        walletClient: wallet,
      }),
    ).rejects.toThrow("Native gas exceeded");
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("uses the buffered OP Stack total fee, including L1 fees, for the reviewed cap", async () => {
    const wallet = fakeWallet();
    await expect(
      executeSquidDeposit({
        ...signingChecks,
        approvalRequired: false,
        destinationClient: fakeDestination([100n]),
        maxNativeFee: 700_000_000_000_000n,
        quote,
        request,
        sourceClient: fakeSource({ allowance: request.sourceAmount, totalFee: 900_000_000_000_000n }),
        squid: { integratorId: "id" },
        walletClient: wallet,
      }),
    ).rejects.toThrow("Native gas exceeded the reviewed maximum");
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("requires the current native balance to cover gas and the executable route value", async () => {
    const wallet = fakeWallet();
    const routeGas = quote.transaction.gasLimit * 1_000_000_000n;
    await expect(
      executeSquidDeposit({
        ...signingChecks,
        destinationClient: fakeDestination([100n]),
        quote,
        request,
        sourceClient: fakeSource({ allowance: request.sourceAmount, nativeBalance: routeGas + 9n }),
        squid: { integratorId: "id" },
        walletClient: wallet,
      }),
    ).rejects.toThrow("Native balance no longer covers gas and route fees");
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("does not persist or broadcast when the native wallet confirmation is rejected", async () => {
    const wallet = fakeWallet();
    wallet.sendTransaction.mockRejectedValueOnce(Object.assign(new Error("rejected"), { code: 4001 }));
    const onBroadcast = vi.fn();
    await expect(
      executeSquidDeposit({
        ...signingChecks,
        destinationClient: fakeDestination([100n]),
        onBroadcast,
        quote,
        request,
        sourceClient: fakeSource(),
        squid: { integratorId: "id" },
        walletClient: wallet,
      }),
    ).rejects.toMatchObject({ code: 4001 });
    expect(onBroadcast).not.toHaveBeenCalled();
  });

  it("marks the route before send so a lost provider response remains recoverable", async () => {
    const wallet = fakeWallet();
    wallet.sendTransaction.mockRejectedValueOnce(new Error("provider response lost"));
    const onSwapAttempt = vi.fn();
    const onBroadcast = vi.fn();
    await expect(
      executeSquidDeposit({
        ...signingChecks,
        approvalRequired: false,
        destinationClient: fakeDestination([100n]),
        onBroadcast,
        onSwapAttempt,
        quote,
        request,
        sourceClient: fakeSource({ allowance: request.sourceAmount }),
        squid: { integratorId: "id" },
        walletClient: wallet,
      }),
    ).rejects.toThrow("provider response lost");
    expect(onSwapAttempt).toHaveBeenCalledWith(100n);
    expect(onBroadcast).not.toHaveBeenCalled();
  });

  it.each([
    "destination account changed",
    "dialog unmounted",
  ])("rechecks the live context after transaction preparation when the %s", async (change) => {
    const wallet = fakeWallet();
    let mounted = true;
    let liveRecipient: Address = RECIPIENT;
    wallet.prepareTransactionRequest.mockImplementationOnce(
      async (transaction: { to: Address; data: Hex; value: bigint }) => {
        if (change === "dialog unmounted") mounted = false;
        else liveRecipient = OWNER;
        return { ...transaction, gas: 599_399n, gasPrice: 1_000_000_000n, nonce: 0 };
      },
    );
    const assertCurrentContext = () => {
      if (!mounted || liveRecipient !== RECIPIENT) throw new Error("Funding details changed after review");
    };
    await expect(
      executeSquidDeposit({
        ...signingChecks,
        approvalRequired: false,
        assertCurrentContext,
        destinationClient: fakeDestination([100n]),
        quote,
        request,
        sourceClient: fakeSource({ allowance: request.sourceAmount }),
        squid: { integratorId: "id" },
        walletClient: wallet,
      }),
    ).rejects.toThrow("Funding details changed after review");
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("rechecks expiry after approval before sending the route", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValueOnce(1_000_000).mockReturnValue(2_000_000);
    const wallet = fakeWallet();
    try {
      await expect(
        executeSquidDeposit({
          ...signingChecks,
          destinationClient: fakeDestination([100n]),
          quote: { ...quote, transaction: { ...quote.transaction, expiresAt: 1_500 } },
          request,
          sourceClient: fakeSource(),
          squid: { integratorId: "id" },
          walletClient: wallet,
        }),
      ).rejects.toThrow("route expired");
      expect(wallet.sendTransaction).toHaveBeenCalledTimes(1);
    } finally {
      now.mockRestore();
    }
  });

  it("rechecks token balance and approval allowance before broadcasting the swap", async () => {
    const lowBalanceWallet = fakeWallet();
    await expect(
      executeSquidDeposit({
        ...signingChecks,
        destinationClient: fakeDestination([100n]),
        quote,
        request,
        sourceClient: fakeSource({ tokenBalance: 1n }),
        squid: { integratorId: "id" },
        walletClient: lowBalanceWallet,
      }),
    ).rejects.toThrow("USDC balance");
    expect(lowBalanceWallet.sendTransaction).not.toHaveBeenCalled();

    const unchangedAllowanceWallet = fakeWallet();
    await expect(
      executeSquidDeposit({
        ...signingChecks,
        destinationClient: fakeDestination([100n]),
        quote,
        request,
        sourceClient: fakeSource({ approvalUpdatesAllowance: false }),
        squid: { integratorId: "id" },
        walletClient: unchangedAllowanceWallet,
      }),
    ).rejects.toThrow("allowance does not match the reviewed spend after approval");
    expect(unchangedAllowanceWallet.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("uses the remaining native balance after a paid approval", async () => {
    const source = fakeSource({ totalFee: 100n });
    vi.mocked(source.getBalance).mockResolvedValueOnce(250n).mockResolvedValue(150n);
    const wallet = fakeWallet();
    await expect(
      executeSquidDeposit({
        ...signingChecks,
        maxNativeFee: 240n,
        quote,
        request,
        destinationClient: fakeDestination([100n, 195n]),
        sourceClient: source,
        walletClient: wallet,
        sleep: noSleep,
        squid: { integratorId: "id", fetch: vi.fn(async () => statusResponse("success")) },
      }),
    ).resolves.toMatchObject({ transactionHash: ROUTE_HASH });
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(2);
  });
  it.each([360n, 359n])("checks remaining balance and cumulative fee cap %s after a reset", async (maxNativeFee) => {
    const source = fakeSource({ allowance: 1n, totalFee: 100n });
    vi.mocked(source.getBalance).mockResolvedValueOnce(370n).mockResolvedValueOnce(270n).mockResolvedValue(170n);
    const wallet = fakeWallet();
    const execution = executeSquidDeposit({
      ...signingChecks,
      maxNativeFee,
      quote,
      request,
      destinationClient: fakeDestination([100n, 195n]),
      sourceClient: source,
      walletClient: wallet,
      sleep: noSleep,
      squid: { integratorId: "id", fetch: vi.fn(async () => statusResponse("success")) },
    });
    if (maxNativeFee === 360n) {
      await expect(execution).resolves.toMatchObject({ transactionHash: ROUTE_HASH });
      expect(wallet.sendTransaction).toHaveBeenCalledTimes(3);
    } else {
      await expect(execution).rejects.toThrow("Native gas exceeded the reviewed maximum");
      expect(wallet.sendTransaction).toHaveBeenCalledTimes(2);
    }
  });
});
