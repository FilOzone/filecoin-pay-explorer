import { SQUID_ROUTER_ADDRESS } from "@filecoin-project/squid-evm-funding";
import { decodeFunctionData, erc20Abi, getAddress, type Hash } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  awaitSquidDepositSettlement,
  executeSquidDeposit,
  fetchSquidDepositStatus,
  type SquidDepositDestinationClient,
  SquidDepositError,
  type SquidDepositSourceClient,
  type SquidDepositStage,
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
  destinationAmount: 93n * 10n ** 18n,
  minimumDestinationAmount: 92n * 10n ** 18n,
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

function fakeSource({ allowance = 0n, receiptStatus = "success" as "success" | "reverted" } = {}) {
  return {
    getChainId: vi.fn(async () => 8453),
    readContract: vi.fn(async () => allowance),
    waitForTransactionReceipt: vi.fn(async () => ({ status: receiptStatus })),
  } as unknown as SquidDepositSourceClient;
}

function fakeWallet() {
  const hashes = [APPROVAL_HASH, ROUTE_HASH];
  return {
    account: { address: OWNER },
    getChainId: vi.fn(async () => 8453),
    sendTransaction: vi.fn(async () => hashes.shift() as Hash),
  };
}

const noSleep = async () => undefined;

describe("fetchSquidDepositStatus", () => {
  it.each([
    ["pending", null, 404],
    ["success", "success", 200],
    ["hook-failed", "partial_success", 200],
    ["failed", "refund", 200],
    ["failed", "needs_gas", 200],
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

  it("tolerates a single failed status request", async () => {
    const responses = [statusResponse(null, 500), statusResponse("success")];
    const fetch = vi.fn(async () => responses.shift() as Response);
    const result = await awaitSquidDepositSettlement({
      destinationClient: fakeDestination([192n]),
      fundsBefore: 100n,
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
    const [approval, route] = wallet.sendTransaction.mock.calls as unknown as [
      [{ to: string; data: `0x${string}` }],
      [{ to: string; data: string; value: bigint; gas: bigint }],
    ];
    expect(approval[0].to).toBe(USDC);
    expect(decodeFunctionData({ abi: erc20Abi, data: approval[0].data })).toEqual({
      functionName: "approve",
      args: [getAddress(SQUID_ROUTER_ADDRESS), 100_000_000n],
    });
    expect(route[0]).toEqual({ to: SQUID_ROUTER_ADDRESS, data: "0xabcdef", value: 10n, gas: 599_399n });
    expect(stages).toEqual([
      ["approving", undefined],
      ["swap-requested", undefined],
      ["swap-broadcast", ROUTE_HASH],
      ["bridging", ROUTE_HASH],
      ["verifying", ROUTE_HASH],
    ]);
    expect(broadcasts).toEqual([{ transactionHash: ROUTE_HASH, fundsBefore: 100n }]);
  });

  it("skips the approval when the allowance already covers the amount", async () => {
    const wallet = fakeWallet();
    await executeSquidDeposit({
      destinationClient: fakeDestination([100n, 195n]),
      quote,
      request,
      sleep: noSleep,
      sourceClient: fakeSource({ allowance: 100_000_000n }),
      squid: { integratorId: "id", fetch: vi.fn(async () => statusResponse("success")) },
      walletClient: wallet,
    });
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("refuses to run when the wallet is on another network", async () => {
    const wallet = { ...fakeWallet(), getChainId: vi.fn(async () => 1) };
    await expect(
      executeSquidDeposit({
        destinationClient: fakeDestination([100n]),
        quote,
        request,
        sourceClient: fakeSource(),
        squid: { integratorId: "id" },
        walletClient: wallet,
      }),
    ).rejects.toThrow("Wallet network does not match");
    expect(wallet.sendTransaction).not.toHaveBeenCalled();
  });

  it("reports a reverted route with its hash", async () => {
    const attempt = executeSquidDeposit({
      destinationClient: fakeDestination([100n]),
      quote,
      request,
      sleep: noSleep,
      sourceClient: fakeSource({ allowance: 100_000_000n, receiptStatus: "reverted" }),
      squid: { integratorId: "id" },
      walletClient: fakeWallet(),
    });
    await expect(attempt).rejects.toBeInstanceOf(SquidDepositError);
    await expect(attempt).rejects.toMatchObject({ reason: "reverted", transactionHash: APPROVAL_HASH });
  });
});
