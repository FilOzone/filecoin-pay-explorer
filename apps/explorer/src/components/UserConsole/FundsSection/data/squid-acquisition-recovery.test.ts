import { SQUID_ROUTER_ADDRESS } from "@filecoin-project/squid-evm-funding";
import { TransactionReceiptNotFoundError } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  beginSquidAcquisition,
  loadSquidAcquisition,
  markSquidAcquired,
  markSquidBroadcast,
  type SquidAcquisition,
} from "./squid-acquisition";
import {
  checkAutomaticSquidRecovery,
  isAutomaticSquidRecoveryCandidate,
  type SquidRecoveryCandidate,
  SquidRecoveryTrustError,
} from "./squid-acquisition-recovery";

const owner = "0x1111111111111111111111111111111111111111" as const;
const other = "0x2222222222222222222222222222222222222222" as const;
const sourceHash = `0x${"3".repeat(64)}` as const;
const otherHash = `0x${"4".repeat(64)}` as const;
const candidate: SquidRecoveryCandidate = {
  acquisitionId: "11111111-1111-4111-8111-111111111111",
  destinationAmount: 10n,
  destinationBalanceBefore: 100n,
  owner,
  sourceChainId: 42161,
  status: "processing",
  transactionHashes: [sourceHash],
};

const successfulReceipt = {
  from: owner,
  status: "success" as const,
  to: SQUID_ROUTER_ADDRESS,
  transactionHash: sourceHash,
};

describe("automatic Squid acquisition recovery", () => {
  it("requires a new processing marker with a baseline and source transaction hash", () => {
    expect(isAutomaticSquidRecoveryCandidate(candidate)).toBe(true);
    expect(isAutomaticSquidRecoveryCandidate({ ...candidate, acquisitionId: undefined } as SquidAcquisition)).toBe(
      false,
    );
    expect(
      isAutomaticSquidRecoveryCandidate({ ...candidate, destinationBalanceBefore: undefined } as SquidAcquisition),
    ).toBe(false);
    expect(isAutomaticSquidRecoveryCandidate({ ...candidate, transactionHashes: [] })).toBe(false);
    expect(isAutomaticSquidRecoveryCandidate({ ...candidate, status: "acquired" } as SquidAcquisition)).toBe(false);
  });

  it("returns the exact delivered balance increase after verifying the source receipt", async () => {
    const readDestinationBalance = vi.fn().mockResolvedValue(115n);

    await expect(
      checkAutomaticSquidRecovery({
        acquisition: candidate,
        getSourceReceipt: vi.fn().mockResolvedValue(successfulReceipt),
        readDestinationBalance,
      }),
    ).resolves.toBe(15n);
    expect(readDestinationBalance).toHaveBeenCalledOnce();
  });

  it("keeps polling while a receipt or the reviewed minimum is pending", async () => {
    const notFound = new TransactionReceiptNotFoundError({ hash: sourceHash });
    await expect(
      checkAutomaticSquidRecovery({
        acquisition: candidate,
        getSourceReceipt: vi.fn().mockRejectedValue(notFound),
        readDestinationBalance: vi.fn(),
      }),
    ).resolves.toBeNull();

    await expect(
      checkAutomaticSquidRecovery({
        acquisition: candidate,
        getSourceReceipt: vi.fn().mockResolvedValue(successfulReceipt),
        readDestinationBalance: vi.fn().mockResolvedValue(109n),
      }),
    ).resolves.toBeNull();
  });

  it.each([
    ["reverted", { ...successfulReceipt, status: "reverted" as const }],
    ["different account", { ...successfulReceipt, from: other }],
    ["untrusted router", { ...successfulReceipt, to: other }],
    ["different hash", { ...successfulReceipt, transactionHash: otherHash }],
  ])("rejects a %s source receipt", async (_name, receipt) => {
    await expect(
      checkAutomaticSquidRecovery({
        acquisition: candidate,
        getSourceReceipt: vi.fn().mockResolvedValue(receipt),
        readDestinationBalance: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(SquidRecoveryTrustError);
  });

  it("re-verifies every hash when the persisted marker advances before recovery commits", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const firstSnapshot = markSquidBroadcast(
      storage,
      beginSquidAcquisition(storage, owner, 10n, 100n, 42161, candidate.acquisitionId),
      sourceHash,
    ) as SquidRecoveryCandidate;
    const firstDelivered = await checkAutomaticSquidRecovery({
      acquisition: firstSnapshot,
      getSourceReceipt: vi.fn().mockResolvedValue(successfulReceipt),
      readDestinationBalance: vi.fn().mockResolvedValue(115n),
    });
    const latest = markSquidBroadcast(storage, firstSnapshot, otherHash) as SquidRecoveryCandidate;

    expect(() => markSquidAcquired(storage, firstSnapshot, firstDelivered ?? undefined)).toThrow("changed");
    expect(loadSquidAcquisition(storage, owner)).toEqual(latest);

    const getSourceReceipt = vi.fn(async (hash: typeof sourceHash | typeof otherHash) => ({
      ...successfulReceipt,
      transactionHash: hash,
    }));
    const latestDelivered = await checkAutomaticSquidRecovery({
      acquisition: latest,
      getSourceReceipt,
      readDestinationBalance: vi.fn().mockResolvedValue(115n),
    });
    expect(getSourceReceipt).toHaveBeenCalledTimes(2);
    expect(getSourceReceipt).toHaveBeenNthCalledWith(1, sourceHash);
    expect(getSourceReceipt).toHaveBeenNthCalledWith(2, otherHash);
    expect(markSquidAcquired(storage, latest, latestDelivered ?? undefined)).toEqual(
      expect.objectContaining({ deliveredAmount: 15n, status: "acquired" }),
    );
  });
});
