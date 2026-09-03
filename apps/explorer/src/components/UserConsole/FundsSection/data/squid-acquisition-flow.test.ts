import { describe, expect, it, vi } from "vitest";
import { loadSquidAcquisition } from "./squid-acquisition";
import { runSquidAcquisition } from "./squid-acquisition-flow";
import { FILECOIN_FIL_REQUIREMENT_ID } from "./squid-quote";

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

  it("keeps a completed FIL checkpoint after a later wallet request is rejected", async () => {
    const storage = createStorage();
    const error = { code: 4001 };
    const onCheckpoint = vi.fn();

    const outcome = await runSquidAcquisition({
      execute: async ({ onIntermediateRouteComplete, onSwapAttempt, onSwapBroadcast }) => {
        onSwapAttempt();
        onSwapBroadcast(sourceHash);
        onIntermediateRouteComplete(FILECOIN_FIL_REQUIREMENT_ID);
        onSwapAttempt();
        throw error;
      },
      minimumDestinationAmount: 10n,
      onCheckpoint,
      owner,
      readDestinationBalance: vi.fn().mockResolvedValue(100n),
      sourceChainId: 42161,
      storage,
    });

    expect(outcome).toEqual({ error, status: "failed" });
    expect(onCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({ completedRequirementIds: [FILECOIN_FIL_REQUIREMENT_ID] }),
    );
    expect(loadSquidAcquisition(storage, owner)).toEqual(
      expect.objectContaining({
        completedRequirementIds: [FILECOIN_FIL_REQUIREMENT_ID],
        executionStage: "preparing",
        transactionHashes: [sourceHash],
      }),
    );
  });

  it("resumes only the remaining route after a later preflight failure", async () => {
    const storage = createStorage();
    const error = new Error("second quote refresh failed");

    await expect(
      runSquidAcquisition({
        execute: async ({ onIntermediateRouteComplete, onSwapAttempt, onSwapBroadcast }) => {
          onSwapAttempt();
          onSwapBroadcast(sourceHash);
          onIntermediateRouteComplete(FILECOIN_FIL_REQUIREMENT_ID);
          throw error;
        },
        minimumDestinationAmount: 10n,
        owner,
        readDestinationBalance: vi.fn().mockResolvedValue(100n),
        sourceChainId: 42161,
        storage,
      }),
    ).resolves.toEqual({ error, status: "failed" });
    const execute = vi.fn(async () => undefined);
    await expect(
      runSquidAcquisition({
        execute,
        minimumDestinationAmount: 10n,
        owner,
        readDestinationBalance: vi.fn().mockResolvedValue(110n),
        sourceChainId: 42161,
        storage,
      }),
    ).resolves.toEqual({ acquisition: expect.objectContaining({ status: "acquired" }), status: "acquired" });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ completedRequirementIds: [FILECOIN_FIL_REQUIREMENT_ID] }),
    );
    expect(loadSquidAcquisition(storage, owner)).toEqual(
      expect.objectContaining({
        completedRequirementIds: [FILECOIN_FIL_REQUIREMENT_ID],
        status: "acquired",
        transactionHashes: [sourceHash],
      }),
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
