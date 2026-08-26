import type { Address } from "viem";
import { describe, expect, it } from "vitest";
import {
  beginSquidAcquisition,
  clearInvalidSquidAcquisition,
  clearSquidAcquisition,
  getDeliveredSquidAmount,
  getSquidDepositAmount,
  hasSavedSquidAcquisition,
  loadSquidAcquisition,
  markSquidAcquired,
  markSquidAcquiredFromBalance,
  markSquidBroadcast,
  markSquidDepositPending,
  markSquidSwapRequested,
  resetSquidDeposit,
  type SquidAcquisition,
} from "./squid-acquisition";

const owner = "0x1111111111111111111111111111111111111111" as Address;
const otherOwner = "0x2222222222222222222222222222222222222222" as Address;
const acquisitionId = "11111111-1111-4111-8111-111111111111";
const replacementId = "22222222-2222-4222-8222-222222222222";
const sourceHash = `0x${"3".repeat(64)}` as const;
const depositHash = `0x${"4".repeat(64)}` as const;

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("persisted Squid acquisition", () => {
  it("persists the verified delivery through deposit retry and clears only the same acquisition", () => {
    const storage = createStorage();
    const processing = beginSquidAcquisition(storage, owner, 10n, 100n, 42161, acquisitionId);
    expect(loadSquidAcquisition(storage, owner)).toEqual(processing);

    const requested = markSquidSwapRequested(storage, processing);
    const broadcast = markSquidBroadcast(storage, requested, sourceHash);
    const acquired = markSquidAcquired(storage, broadcast, 15n);
    expect(loadSquidAcquisition(storage, owner)).toEqual(acquired);
    expect(getSquidDepositAmount(acquired)).toBe(15n);
    expect(loadSquidAcquisition(storage, otherOwner)).toBeNull();

    const depositPreflight = markSquidDepositPending(storage, acquired);
    const depositing = markSquidDepositPending(storage, depositPreflight, depositHash);
    expect(getSquidDepositAmount(depositing)).toBe(15n);
    expect(resetSquidDeposit(storage, depositing)).toEqual(acquired);

    clearSquidAcquisition(storage, acquired);
    expect(loadSquidAcquisition(storage, owner)).toBeNull();
  });

  it("loads a legacy marker without treating it as automatically verified", () => {
    const storage = createStorage();
    storage.setItem(
      `filecoin-pay:squid-acquisition:v1:${owner.toLowerCase()}`,
      JSON.stringify({
        destinationAmount: "10",
        owner,
        sourceChainId: 42161,
        status: "processing",
        transactionHashes: [sourceHash],
      }),
    );

    const legacy = loadSquidAcquisition(storage, owner);
    expect(legacy).toEqual({
      acquisitionId: undefined,
      deliveredAmount: undefined,
      depositTransactionHash: undefined,
      destinationAmount: 10n,
      destinationBalanceBefore: undefined,
      executionStage: "swap-broadcast",
      owner,
      sourceChainId: 42161,
      status: "processing",
      transactionHashes: [sourceHash],
    });
    expect(getSquidDepositAmount(legacy as SquidAcquisition)).toBe(10n);

    storage.setItem(
      `filecoin-pay:squid-acquisition:v1:${owner.toLowerCase()}`,
      JSON.stringify({
        destinationAmount: "10",
        owner,
        sourceChainId: 42161,
        status: "processing",
        transactionHashes: [],
      }),
    );
    expect(loadSquidAcquisition(storage, owner)).toEqual(
      expect.objectContaining({ executionStage: "swap-requested", transactionHashes: [] }),
    );
  });

  it("recovers only after the Filecoin balance increase reaches the reviewed minimum", () => {
    const acquisition: SquidAcquisition = {
      acquisitionId,
      destinationAmount: 10n,
      destinationBalanceBefore: 100n,
      owner,
      sourceChainId: 42161,
      status: "processing",
      transactionHashes: [sourceHash],
      executionStage: "swap-broadcast",
    };

    expect(getDeliveredSquidAmount(acquisition, 99n)).toBeNull();
    expect(getDeliveredSquidAmount(acquisition, 109n)).toBeNull();
    expect(getDeliveredSquidAmount(acquisition, 110n)).toBe(10n);
    expect(getDeliveredSquidAmount(acquisition, 115n)).toBe(15n);
    expect(getDeliveredSquidAmount({ ...acquisition, destinationBalanceBefore: undefined }, 115n)).toBeNull();
  });

  it("freezes the exact balance increase only after it reaches the reviewed minimum", () => {
    const storage = createStorage();
    const processing = beginSquidAcquisition(storage, owner, 10n, 100n, 42161, acquisitionId);
    const broadcast = markSquidBroadcast(storage, markSquidSwapRequested(storage, processing), sourceHash);

    expect(() => markSquidAcquiredFromBalance(storage, broadcast, 109n)).toThrow(
      "reviewed USDFC minimum has not arrived",
    );
    expect(loadSquidAcquisition(storage, owner)).toEqual(broadcast);

    const acquired = markSquidAcquiredFromBalance(storage, broadcast, 115n);
    expect(acquired.deliveredAmount).toBe(15n);
    expect(getSquidDepositAmount(acquired)).toBe(15n);
  });

  it("rejects stale or regressive state mutations", () => {
    const storage = createStorage();
    const stale = beginSquidAcquisition(storage, owner, 10n, 100n, 42161, acquisitionId);
    const acquired = markSquidAcquired(
      storage,
      markSquidBroadcast(storage, markSquidSwapRequested(storage, stale), sourceHash),
      15n,
    );

    expect(() => markSquidBroadcast(storage, stale, sourceHash)).toThrow("no longer processing");
    expect(markSquidAcquired(storage, stale, 15n)).toEqual(acquired);
    expect(markSquidAcquired(storage, stale, 16n)).toEqual(acquired);
    expect(loadSquidAcquisition(storage, owner)).toEqual(acquired);

    clearSquidAcquisition(storage, acquired);
    const replacement = beginSquidAcquisition(storage, owner, 20n, 200n, 8453, replacementId);
    expect(() => clearSquidAcquisition(storage, acquired)).toThrow("changed");
    expect(loadSquidAcquisition(storage, owner)).toEqual(replacement);
  });

  it("does not acquire a processing marker whose source hashes advanced after verification", () => {
    const storage = createStorage();
    const firstBroadcast = markSquidBroadcast(
      storage,
      markSquidSwapRequested(storage, beginSquidAcquisition(storage, owner, 10n, 100n, 42161, acquisitionId)),
      sourceHash,
    );
    const secondHash = `0x${"5".repeat(64)}` as const;
    const latest = markSquidBroadcast(storage, markSquidSwapRequested(storage, firstBroadcast), secondHash);

    expect(() => markSquidAcquired(storage, firstBroadcast, 15n)).toThrow("changed");
    expect(loadSquidAcquisition(storage, owner)).toEqual(latest);
    expect(markSquidAcquired(storage, latest, 15n)).toEqual(
      expect.objectContaining({
        deliveredAmount: 15n,
        status: "acquired",
        transactionHashes: [sourceHash, secondHash],
      }),
    );
  });

  it("does not clear, retry, or duplicate a deposit after another tab advances it", () => {
    const storage = createStorage();
    const processing = beginSquidAcquisition(storage, owner, 10n, 100n, 42161, acquisitionId);
    const acquired = markSquidAcquired(
      storage,
      markSquidBroadcast(storage, markSquidSwapRequested(storage, processing), sourceHash),
      15n,
    );
    const depositPreflight = markSquidDepositPending(storage, acquired);

    expect(() => markSquidDepositPending(storage, acquired)).toThrow("changed");
    const depositing = markSquidDepositPending(storage, depositPreflight, depositHash);
    expect(() => resetSquidDeposit(storage, depositPreflight)).toThrow("expected pending transaction");
    expect(() => clearSquidAcquisition(storage, depositPreflight)).toThrow("changed");
    expect(loadSquidAcquisition(storage, owner)).toEqual(depositing);
  });

  it("rejects malformed verified amounts", () => {
    const storage = createStorage();
    const key = `filecoin-pay:squid-acquisition:v1:${owner.toLowerCase()}`;
    const record = {
      acquisitionId,
      destinationAmount: "10",
      destinationBalanceBefore: "100",
      owner,
      sourceChainId: 42161,
      status: "acquired",
      transactionHashes: [sourceHash],
    };

    storage.setItem(key, JSON.stringify({ ...record, deliveredAmount: "9" }));
    expect(loadSquidAcquisition(storage, owner)).toBeNull();
    storage.setItem(key, JSON.stringify({ ...record, deliveredAmount: "15", destinationBalanceBefore: "-1" }));
    expect(loadSquidAcquisition(storage, owner)).toBeNull();
    storage.setItem(key, JSON.stringify({ ...record, deliveredAmount: "15", status: "processing" }));
    expect(loadSquidAcquisition(storage, owner)).toBeNull();
  });

  it("persists swap-requested before a hash and rejects invalid stage snapshots", () => {
    const storage = createStorage();
    const preparing = beginSquidAcquisition(storage, owner, 10n, 100n, 42161, acquisitionId);
    expect(preparing.executionStage).toBe("preparing");

    const requested = markSquidSwapRequested(storage, preparing);
    expect(loadSquidAcquisition(storage, owner)).toEqual(
      expect.objectContaining({ executionStage: "swap-requested", transactionHashes: [] }),
    );
    expect(markSquidBroadcast(storage, requested, sourceHash)).toEqual(
      expect.objectContaining({ executionStage: "swap-broadcast", transactionHashes: [sourceHash] }),
    );

    const key = `filecoin-pay:squid-acquisition:v1:${owner.toLowerCase()}`;
    storage.setItem(
      key,
      JSON.stringify({
        ...preparing,
        destinationAmount: "10",
        destinationBalanceBefore: "100",
        executionStage: "swap-broadcast",
        transactionHashes: [],
      }),
    );
    expect(loadSquidAcquisition(storage, owner)).toBeNull();
  });

  it("clears malformed state without clearing a valid acquisition", () => {
    const storage = createStorage();
    storage.setItem(`filecoin-pay:squid-acquisition:v1:${owner.toLowerCase()}`, "not json");
    expect(hasSavedSquidAcquisition(storage, owner)).toBe(true);

    clearInvalidSquidAcquisition(storage, owner);
    expect(hasSavedSquidAcquisition(storage, owner)).toBe(false);

    const processing = beginSquidAcquisition(storage, owner, 10n, 100n, 42161, acquisitionId);
    expect(() => clearInvalidSquidAcquisition(storage, owner)).toThrow("is valid");
    expect(loadSquidAcquisition(storage, owner)).toEqual(processing);
  });
});
