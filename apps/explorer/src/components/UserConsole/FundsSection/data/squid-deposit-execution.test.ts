import { NATIVE_TOKEN_ADDRESS, SQUID_ROUTER_ADDRESS } from "@filecoin-project/squid-evm-funding";
import { type Address, decodeFunctionData, erc20Abi, getAddress, type Hash, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  awaitSquidDepositSettlement,
  executeSquidDeposit,
  fetchSquidDepositStatus,
  SquidDepositBudgetError,
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
const RESET_HASH = `0x${"c".repeat(64)}` as Hash;

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
  allowanceSequence,
  approvalUpdatesAllowance = true,
  nativeBalance = 10n ** 18n,
  receiptBlock,
  receiptStatus = "success" as "success" | "reverted",
  tokenBalance = 200_000_000n,
  totalFee,
  totalFeeSequence,
}: {
  allowance?: bigint;
  allowanceSequence?: bigint[];
  approvalUpdatesAllowance?: boolean;
  nativeBalance?: bigint;
  /** Block the fake receipts report; reads after an approval are pinned to it. */
  receiptBlock?: bigint;
  receiptStatus?: "success" | "reverted";
  tokenBalance?: bigint;
  totalFee?: bigint;
  /** Unbuffered fees in call order, each answered as if it were the OP Stack total; execution buffers them. */
  totalFeeSequence?: bigint[];
} = {}) {
  let allowanceReads = 0;
  const source = {
    // Legacy fee data (1 gwei) keeps the sent requests simple to assert on.
    estimateFeesPerGas: vi.fn(async () => {
      throw new Error("EIP-1559 fees not supported");
    }),
    estimateGas: vi.fn(async ({ to }: { to: Address }) => (to === USDC ? 60_000n : 599_399n)),
    getBalance: vi.fn(async () => nativeBalance),
    getChainId: vi.fn(async () => 8453),
    getGasPrice: vi.fn(async () => 1_000_000_000n),
    estimateTotalFee: vi.fn(
      async ({ gas, gasPrice, maxFeePerGas }: { gas: bigint; gasPrice?: bigint; maxFeePerGas?: bigint }) =>
        totalFeeSequence?.length
          ? ((totalFeeSequence.shift() as bigint) * 10n) / 12n
          : (totalFee ?? gas * (gasPrice ?? maxFeePerGas ?? 0n)),
    ),
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === "balanceOf") return tokenBalance;
      allowanceReads += 1;
      if (allowanceSequence?.length) return allowanceSequence.shift() as bigint;
      return approvalUpdatesAllowance && allowanceReads > 1 ? request.sourceAmount : allowance;
    }),
    multicall: vi.fn(async ({ contracts }: { contracts: { functionName: string }[] }) =>
      Promise.all(contracts.map((contract) => source.readContract(contract))),
    ),
    waitForTransactionReceipt: vi.fn(async () => ({
      status: receiptStatus,
      ...(receiptBlock === undefined ? {} : { blockNumber: receiptBlock }),
    })),
  };
  return source as unknown as SquidDepositSourceClient & {
    estimateGas: ReturnType<typeof vi.fn>;
    estimateTotalFee: ReturnType<typeof vi.fn>;
    multicall: ReturnType<typeof vi.fn>;
  };
}

function fakeWallet(hashes?: Hash[]) {
  const pendingHashes = hashes ? [...hashes] : undefined;
  return {
    account: { address: OWNER },
    getChainId: vi.fn(async () => 8453),
    sendTransaction: vi.fn(async ({ to }: { to: Address }) =>
      pendingHashes?.length ? (pendingHashes.shift() as Hash) : to === USDC ? APPROVAL_HASH : ROUTE_HASH,
    ),
  } as unknown as SquidDepositWalletClient & {
    sendTransaction: ReturnType<typeof vi.fn>;
  };
}

const noSleep = async () => undefined;
const signingChecks = {
  approvalRequired: true,
  approvalResetRequired: false,
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
    const broadcasts: { transactionHash: Hash; fundsBefore: bigint; quote: ExecutableSquidDepositQuote }[] = [];

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
    // Two fees priced up front for the plan check, then each transaction again before its send.
    expect(source.estimateTotalFee).toHaveBeenCalledTimes(4);
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
    expect(broadcasts).toEqual([{ transactionHash: ROUTE_HASH, fundsBefore: 100n, quote }]);
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

  it("re-reads the allowance at the approval's block until the node catches up", async () => {
    const wallet = fakeWallet();
    // The first read after the receipt still shows the old allowance; the next one is current.
    const source = fakeSource({ allowanceSequence: [0n, 0n, request.sourceAmount], receiptBlock: 42n });
    const sleep = vi.fn(async () => undefined);
    await executeSquidDeposit({
      destinationClient: fakeDestination([100n, 195n]),
      ...signingChecks,
      quote,
      request,
      sleep,
      sourceClient: source,
      squid: { integratorId: "id", fetch: vi.fn(async () => statusResponse("success")) },
      walletClient: wallet,
    });

    expect(wallet.sendTransaction).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
    expect(
      source.multicall.mock.calls.map((call: unknown[]) => (call[0] as { blockNumber?: bigint }).blockNumber),
    ).toEqual([undefined, 42n, 42n]);
  });

  it("reports the allowance mismatch once the bounded re-reads still disagree", async () => {
    const wallet = fakeWallet();
    const source = fakeSource({ allowance: 0n, approvalUpdatesAllowance: false, receiptBlock: 42n });
    const sleep = vi.fn(async () => undefined);
    await expect(
      executeSquidDeposit({
        destinationClient: fakeDestination([100n]),
        ...signingChecks,
        quote,
        request,
        sleep,
        sourceClient: source,
        squid: { integratorId: "id" },
        walletClient: wallet,
      }),
    ).rejects.toThrow("Source-token allowance does not match the reviewed spend after approval");
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledTimes(4);
  });

  it("resets a nonzero insufficient allowance before approving the payment amount", async () => {
    const wallet = fakeWallet([RESET_HASH, APPROVAL_HASH, ROUTE_HASH]);
    await executeSquidDeposit({
      destinationClient: fakeDestination([100n, 195n]),
      ...signingChecks,
      approvalResetRequired: true,
      quote,
      request,
      sleep: noSleep,
      sourceClient: fakeSource({ allowanceSequence: [1n, 0n, request.sourceAmount] }),
      squid: { integratorId: "id", fetch: vi.fn(async () => statusResponse("success")) },
      walletClient: wallet,
    });

    expect(wallet.sendTransaction).toHaveBeenCalledTimes(3);
    const [reset, approval] = wallet.sendTransaction.mock.calls as unknown as [[{ data: Hex }], [{ data: Hex }]];
    expect(decodeFunctionData({ abi: erc20Abi, data: reset[0].data })).toMatchObject({
      functionName: "approve",
      args: [getAddress(SQUID_ROUTER_ADDRESS), 0n],
    });
    expect(decodeFunctionData({ abi: erc20Abi, data: approval[0].data })).toMatchObject({
      functionName: "approve",
      args: [getAddress(SQUID_ROUTER_ADDRESS), request.sourceAmount],
    });
  });

  it("does not add an unreviewed allowance reset before the route", async () => {
    const wallet = fakeWallet([RESET_HASH, APPROVAL_HASH, ROUTE_HASH]);
    await expect(
      executeSquidDeposit({
        destinationClient: fakeDestination([100n]),
        ...signingChecks,
        quote,
        request,
        sourceClient: fakeSource({ allowanceSequence: [1n] }),
        squid: { integratorId: "id" },
        walletClient: wallet,
      }),
    ).rejects.toThrow("allowance changed after review");
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("zeros an oversized allowance before approving the exact amount", async () => {
    const wallet = fakeWallet([RESET_HASH, APPROVAL_HASH, ROUTE_HASH]);
    await executeSquidDeposit({
      destinationClient: fakeDestination([100n, 195n]),
      ...signingChecks,
      approvalResetRequired: true,
      quote,
      request,
      sleep: noSleep,
      sourceClient: fakeSource({ allowanceSequence: [request.sourceAmount + 1n, 0n, request.sourceAmount] }),
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

  it("uses the native balance as the source balance without ERC-20 reads or approval", async () => {
    const wallet = fakeWallet();
    wallet.sendTransaction.mockResolvedValue(ROUTE_HASH);
    const source = fakeSource({ nativeBalance: 10n ** 18n });
    await executeSquidDeposit({
      destinationClient: fakeDestination([100n, 195n]),
      ...signingChecks,
      approvalRequired: false,
      quote: { ...quote, transaction: { ...quote.transaction, value: request.sourceAmount + 10n } },
      request: { ...request, sourceToken: NATIVE_TOKEN_ADDRESS },
      sleep: noSleep,
      sourceClient: source,
      squid: { integratorId: "id", fetch: vi.fn(async () => statusResponse("success")) },
      walletClient: wallet,
    });
    expect(source.readContract).not.toHaveBeenCalled();
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(1);
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

  it("prices the whole plan before the first signature and stops there when it exceeds the reviewed maximum", async () => {
    const wallet = fakeWallet();
    const source = fakeSource();
    // Base is an OP Stack chain, so each fee carries the 20% execution buffer: 72e12 approval + 719e12 route.
    const requiredFee = 72_000_000_000_000n + 719_278_800_000_000n;
    await expect(
      executeSquidDeposit({
        ...signingChecks,
        destinationClient: fakeDestination([100n]),
        maxNativeFee: requiredFee - 1n,
        quote,
        request,
        sourceClient: source,
        squid: { integratorId: "id" },
        walletClient: wallet,
      }),
    ).rejects.toMatchObject({
      name: "SquidDepositBudgetError",
      message: "Network fees for the approval and Squid transaction are above the reviewed maximum.",
      breach: {
        completed: [],
        remaining: ["approve", "route"],
        feeSoFar: 0n,
        requiredFee,
        maxNativeFee: requiredFee - 1n,
      },
    });
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
    // The route was priced from Squid's gas limit, without a simulation the missing allowance would fail.
    expect(source.estimateGas.mock.calls.map((call) => (call as [{ to: string }])[0].to)).toEqual([USDC]);
    expect(source.estimateTotalFee).toHaveBeenCalledWith(
      expect.objectContaining({ to: SQUID_ROUTER_ADDRESS, gas: 599_399n, gasPrice: 1_000_000_000n }),
    );
  });

  it("reports a cap breach after the approvals executed so the route can be re-reviewed, not repeated", async () => {
    const wallet = fakeWallet([RESET_HASH, APPROVAL_HASH]);
    // Base is an OP Stack chain, so each prepared fee carries the 20% execution buffer. The plan check
    // budgets the unsimulatable approval at the 65k fallback; the fee rises once the route is prepared for real.
    const resetFee = 72_000_000_000_000n;
    const approveFee = 72_000_000_000_000n;
    const routeFee = 719_278_800_000_000n;
    const source = fakeSource({
      allowanceSequence: [5n, 0n, request.sourceAmount],
      totalFeeSequence: [resetFee, approveFee, routeFee, resetFee, approveFee, routeFee + 12n],
    });

    const failure = await executeSquidDeposit({
      ...signingChecks,
      approvalResetRequired: true,
      destinationClient: fakeDestination([100n]),
      maxNativeFee: resetFee + approveFee + routeFee,
      quote,
      request,
      sourceClient: source,
      squid: { integratorId: "id" },
      walletClient: wallet,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SquidDepositBudgetError);
    expect((failure as SquidDepositBudgetError).breach).toEqual({
      completed: ["reset", "approve"],
      remaining: ["route"],
      feeSoFar: resetFee + approveFee,
      requiredFee: routeFee + 12n,
      maxNativeFee: resetFee + approveFee + routeFee,
    });
    expect((failure as Error).message).toBe(
      "Network gas rose above the reviewed maximum before the Squid transaction. The allowance reset and approval already went through and will not be repeated.",
    );
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(2);
    expect(wallet.sendTransaction.mock.calls.map((call) => (call as [{ to: string }])[0].to)).toEqual([USDC, USDC]);

    // The re-reviewed run sees the granted allowance and sends only the route.
    const secondWallet = fakeWallet();
    const fetch = vi.fn(async () => statusResponse("success"));
    await executeSquidDeposit({
      ...signingChecks,
      approvalRequired: false,
      destinationClient: fakeDestination([100n, 100n, 195n]),
      maxNativeFee: routeFee,
      quote,
      request,
      sleep: noSleep,
      sourceClient: fakeSource({ allowance: request.sourceAmount }),
      squid: { integratorId: "id", fetch },
      walletClient: secondWallet,
    });
    expect(secondWallet.sendTransaction).toHaveBeenCalledTimes(1);
    expect(secondWallet.sendTransaction.mock.calls[0]?.[0]).toMatchObject({ to: SQUID_ROUTER_ADDRESS });
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
    ).rejects.toMatchObject({
      name: "SquidDepositBudgetError",
      breach: { completed: [], remaining: ["route"], requiredFee: 1_080_000_000_000_000n },
    });
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
    expect(onSwapAttempt).toHaveBeenCalledWith(100n, quote);
    expect(onBroadcast).not.toHaveBeenCalled();
  });

  it.each([
    "destination account changed",
    "dialog unmounted",
  ])("rechecks the live context after transaction preparation when the %s", async (change) => {
    const wallet = fakeWallet();
    const source = fakeSource({ allowance: request.sourceAmount });
    let mounted = true;
    let liveRecipient: Address = RECIPIENT;
    // The plan check prices the route from Squid's gas limit; the send simulates it, and that is when the context moves.
    source.estimateGas.mockImplementationOnce(async () => {
      if (change === "dialog unmounted") mounted = false;
      else liveRecipient = OWNER;
      return 599_399n;
    });
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
        sourceClient: source,
        squid: { integratorId: "id" },
        walletClient: wallet,
      }),
    ).rejects.toThrow("Funding details changed after review");
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("rechecks expiry after approval before sending the route when no refresh is available", async () => {
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

  it("fetches a fresh route after the approval when the reviewed one is about to expire", async () => {
    // 1000 s at review; the approval lands at 2000 s, inside the 30 s margin of a route expiring at 2020 s.
    const now = vi.spyOn(Date, "now").mockReturnValueOnce(1_000_000).mockReturnValue(2_000_000);
    const wallet = fakeWallet();
    const fetch = vi.fn(async () => statusResponse("success"));
    const fresh: ExecutableSquidDepositQuote = {
      ...quote,
      quoteId: "quote-2",
      minimumDestinationAmount: 91n,
      transaction: { ...quote.transaction, data: "0xfresh0", expiresAt: 2_600 },
    };
    const refreshQuote = vi.fn(async () => fresh);
    const attempts: [bigint, string][] = [];
    const broadcasts: string[] = [];
    try {
      const result = await executeSquidDeposit({
        ...signingChecks,
        destinationClient: fakeDestination([100n, 100n, 195n]),
        onBroadcast: ({ quote: used }) => broadcasts.push(used.quoteId),
        onSwapAttempt: (fundsBefore, used) => attempts.push([fundsBefore, used.quoteId]),
        quote: { ...quote, transaction: { ...quote.transaction, expiresAt: 2_020 } },
        refreshQuote,
        request,
        sleep: noSleep,
        sourceClient: fakeSource(),
        squid: { integratorId: "id", fetch },
        walletClient: wallet,
      });

      expect(refreshQuote).toHaveBeenCalledOnce();
      expect(wallet.sendTransaction.mock.calls[1]?.[0]).toMatchObject({ to: SQUID_ROUTER_ADDRESS, data: "0xfresh0" });
      expect(attempts).toEqual([[100n, "quote-2"]]);
      expect(broadcasts).toEqual(["quote-2"]);
      expect(String((fetch.mock.calls[0] as unknown as [string])[0])).toContain("quoteId=quote-2");
      expect(result.depositedAmount).toBe(95n);
    } finally {
      now.mockRestore();
    }
  });

  it("refuses a refreshed route that no longer matches the reviewed payment or is itself expired", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    try {
      for (const [label, fresh] of [
        ["amount", { ...quote, sourceAmount: 1n, transaction: { ...quote.transaction, expiresAt: 2_600 } }],
        ["expiry", { ...quote, transaction: { ...quote.transaction, expiresAt: 1_999 } }],
      ] as const) {
        const wallet = fakeWallet();
        await expect(
          executeSquidDeposit({
            ...signingChecks,
            approvalRequired: false,
            destinationClient: fakeDestination([100n]),
            quote: { ...quote, transaction: { ...quote.transaction, expiresAt: 2_010 } },
            refreshQuote: async () => fresh,
            request,
            sourceClient: fakeSource({ allowance: request.sourceAmount }),
            squid: { integratorId: "id" },
            walletClient: wallet,
          }),
        ).rejects.toThrow(label === "amount" ? "does not match the reviewed payment" : "route expired");
        expect(wallet.sendTransaction).not.toHaveBeenCalled();
      }
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
    ).rejects.toThrow("Source-token balance");
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
});
