import { describe, expect, it, vi } from "vitest";
import { loadSquidAcquisition, markSquidAcquired, type ProcessingSquidAcquisition } from "./squid-acquisition";
import { runSquidAcquisition } from "./squid-acquisition-flow";

const owner = "0x1111111111111111111111111111111111111111" as const;
const sourceHash = `0x${"3".repeat(64)}` as const;

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("runSquidAcquisition", () => {
  it("persists the baseline and freezes the exact delivered balance increase", async () => {
    const storage = createStorage();
    const readDestinationBalance = vi.fn().mockResolvedValueOnce(100n).mockResolvedValueOnce(115n);
    const onStarted = vi.fn();

    const outcome = await runSquidAcquisition({
      execute: async ({ onSwapAttempt, onSwapBroadcast }) => {
        onSwapAttempt();
        onSwapBroadcast(sourceHash);
      },
      minimumDestinationAmount: 10n,
      onStarted,
      owner,
      readDestinationBalance,
      sourceChainId: 42161,
      storage,
    });

    expect(onStarted).toHaveBeenCalledWith(expect.objectContaining({ destinationBalanceBefore: 100n }));
    expect(outcome).toEqual({
      acquisition: expect.objectContaining({ deliveredAmount: 15n, transactionHashes: [sourceHash] }),
      status: "acquired",
    });
    expect(loadSquidAcquisition(storage, owner)).toEqual(
      expect.objectContaining({ deliveredAmount: 15n, status: "acquired" }),
    );
  });

  it("does not execute or create a marker when the initial balance read fails", async () => {
    const storage = createStorage();
    const execute = vi.fn();
    const error = new Error("destination RPC unavailable");

    await expect(
      runSquidAcquisition({
        execute,
        minimumDestinationAmount: 10n,
        owner,
        readDestinationBalance: vi.fn().mockRejectedValue(error),
        sourceChainId: 42161,
        storage,
      }),
    ).resolves.toEqual({ error, status: "failed" });
    expect(execute).not.toHaveBeenCalled();
    expect(loadSquidAcquisition(storage, owner)).toBeNull();
  });

  it.each([
    ["post-broadcast balance read failure", vi.fn().mockResolvedValueOnce(100n).mockRejectedValue(new Error("RPC"))],
    ["delivery below the reviewed minimum", vi.fn().mockResolvedValueOnce(100n).mockResolvedValueOnce(109n)],
  ])("keeps the marker and hash after %s", async (_name, readDestinationBalance) => {
    const storage = createStorage();

    const outcome = await runSquidAcquisition({
      execute: async ({ onSwapAttempt, onSwapBroadcast }) => {
        onSwapAttempt();
        onSwapBroadcast(sourceHash);
      },
      minimumDestinationAmount: 10n,
      owner,
      readDestinationBalance,
      sourceChainId: 42161,
      storage,
    });

    expect(outcome).toEqual({
      acquisition: expect.objectContaining({
        executionStage: "swap-broadcast",
        status: "processing",
        transactionHashes: [sourceHash],
      }),
      error: expect.any(Error),
      status: "blocked",
    });
    expect(loadSquidAcquisition(storage, owner)).toEqual(
      expect.objectContaining({ status: "processing", transactionHashes: [sourceHash] }),
    );
  });

  it("clears only the exact marker after a pre-swap failure", async () => {
    const storage = createStorage();
    const error = new Error("quote refresh failed");

    await expect(
      runSquidAcquisition({
        execute: vi.fn().mockRejectedValue(error),
        minimumDestinationAmount: 10n,
        owner,
        readDestinationBalance: vi.fn().mockResolvedValue(100n),
        sourceChainId: 42161,
        storage,
      }),
    ).resolves.toEqual({ error, status: "failed" });
    expect(loadSquidAcquisition(storage, owner)).toBeNull();
  });

  it("persists an ambiguous swap request without a returned hash", async () => {
    const storage = createStorage();
    const error = new Error("wallet response lost");

    const outcome = await runSquidAcquisition({
      execute: async ({ onSwapAttempt }) => {
        onSwapAttempt();
        throw error;
      },
      minimumDestinationAmount: 10n,
      owner,
      readDestinationBalance: vi.fn().mockResolvedValue(100n),
      sourceChainId: 42161,
      storage,
    });

    expect(outcome).toEqual({
      acquisition: expect.objectContaining({ executionStage: "swap-requested", transactionHashes: [] }),
      error,
      status: "blocked",
    });
    expect(loadSquidAcquisition(storage, owner)).toEqual(
      expect.objectContaining({ executionStage: "swap-requested", transactionHashes: [] }),
    );
  });

  it("clears an unbroadcast swap request only after an explicit wallet rejection", async () => {
    const storage = createStorage();
    const error = { code: 4001 };

    await expect(
      runSquidAcquisition({
        execute: async ({ onSwapAttempt }) => {
          onSwapAttempt();
          throw error;
        },
        minimumDestinationAmount: 10n,
        owner,
        readDestinationBalance: vi.fn().mockResolvedValue(100n),
        sourceChainId: 42161,
        storage,
      }),
    ).resolves.toEqual({ error, status: "failed" });
    expect(loadSquidAcquisition(storage, owner)).toBeNull();
  });

  it("preserves an earlier route hash when a later wallet request is rejected", async () => {
    const storage = createStorage();
    const error = { code: 4001 };

    const outcome = await runSquidAcquisition({
      execute: async ({ onSwapAttempt, onSwapBroadcast }) => {
        onSwapAttempt();
        onSwapBroadcast(sourceHash);
        onSwapAttempt();
        throw error;
      },
      minimumDestinationAmount: 10n,
      owner,
      readDestinationBalance: vi.fn().mockResolvedValue(100n),
      sourceChainId: 42161,
      storage,
    });

    expect(outcome).toEqual({
      acquisition: expect.objectContaining({
        executionStage: "swap-requested",
        transactionHashes: [sourceHash],
      }),
      error,
      status: "blocked",
    });
    expect(loadSquidAcquisition(storage, owner)).toEqual(
      expect.objectContaining({ executionStage: "swap-requested", transactionHashes: [sourceHash] }),
    );
  });

  it("returns the in-memory marker when storage becomes unreadable after it is saved", async () => {
    const values = new Map<string, string>();
    let readsFail = false;
    const storage = {
      getItem: (key: string) => {
        if (readsFail) throw new Error("storage unavailable");
        return values.get(key) ?? null;
      },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => {
        values.set(key, value);
        readsFail = true;
      },
    };

    const outcome = await runSquidAcquisition({
      execute: async ({ onSwapAttempt, onSwapBroadcast }) => {
        onSwapAttempt();
        onSwapBroadcast(sourceHash);
      },
      minimumDestinationAmount: 10n,
      owner,
      readDestinationBalance: vi.fn().mockResolvedValue(100n),
      sourceChainId: 42161,
      storage,
    });

    expect(outcome).toEqual({
      acquisition: expect.objectContaining({ destinationBalanceBefore: 100n, status: "processing" }),
      error: expect.objectContaining({ message: "storage unavailable" }),
      status: "blocked",
    });
  });

  it("returns a concurrently completed acquisition instead of blocking it", async () => {
    const storage = createStorage();
    let started!: ProcessingSquidAcquisition;

    const outcome = await runSquidAcquisition({
      execute: async () => {
        markSquidAcquired(storage, started, 10n);
        throw new Error("stale execution failure");
      },
      minimumDestinationAmount: 10n,
      onStarted: (acquisition) => {
        started = acquisition;
      },
      owner,
      readDestinationBalance: vi.fn().mockResolvedValue(100n),
      sourceChainId: 42161,
      storage,
    });

    expect(outcome).toEqual({ acquisition: expect.objectContaining({ status: "acquired" }), status: "acquired" });
  });

  it("clears the marker and returns failed when the start callback throws before execution", async () => {
    const storage = createStorage();
    const execute = vi.fn();
    const error = new Error("render callback failed");

    const outcome = await runSquidAcquisition({
      execute,
      minimumDestinationAmount: 10n,
      onStarted: () => {
        throw error;
      },
      owner,
      readDestinationBalance: vi.fn().mockResolvedValue(100n),
      sourceChainId: 42161,
      storage,
    });

    expect(outcome).toEqual({ error, status: "failed" });
    expect(execute).not.toHaveBeenCalled();
    expect(loadSquidAcquisition(storage, owner)).toBeNull();
  });
});
