import type { Hash } from "viem";
import { describe, expect, it, vi } from "vitest";
import { beginSquidAcquisition, loadSquidAcquisition, markSquidAcquired } from "./squid-acquisition";
import { runSquidDeposit } from "./squid-deposit";

const owner = "0x1111111111111111111111111111111111111111" as const;
const hash = `0x${"3".repeat(64)}` as const;

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

function acquired(storage: ReturnType<typeof createStorage>) {
  return markSquidAcquired(storage, beginSquidAcquisition(storage, owner, 10n, 0n, 8453), 12n);
}

describe("runSquidDeposit", () => {
  it("persists the hash, invalidates balances, and clears a successful deposit", async () => {
    const storage = createStorage();
    const invalidate = vi.fn().mockResolvedValue(undefined);
    const fund = vi.fn(async (_amount: bigint, onHash: (value: Hash) => void) => {
      onHash(hash);
      return { receipt: { status: "success" } };
    });

    const outcome = await runSquidDeposit({
      acquisition: acquired(storage),
      amount: 12n,
      fund,
      invalidate,
      storage,
    });

    expect(outcome.status).toBe("succeeded");
    expect(fund).toHaveBeenCalledWith(12n, expect.any(Function));
    expect(invalidate).toHaveBeenCalledWith(owner);
    expect(loadSquidAcquisition(storage, owner)).toBeNull();
  });

  it("restores the acquired state after an unbroadcast wallet rejection", async () => {
    const storage = createStorage();

    const outcome = await runSquidDeposit({
      acquisition: acquired(storage),
      amount: 12n,
      fund: vi.fn().mockRejectedValue({ code: 4001 }),
      invalidate: vi.fn(),
      storage,
    });

    expect(outcome.status).toBe("rejected");
    expect(loadSquidAcquisition(storage, owner)?.status).toBe("acquired");
  });

  it("keeps the pending marker when a submitted deposit fails", async () => {
    const storage = createStorage();

    const outcome = await runSquidDeposit({
      acquisition: acquired(storage),
      amount: 12n,
      fund: async (_amount, onHash) => {
        onHash(hash);
        throw new Error("receipt unavailable");
      },
      invalidate: vi.fn(),
      storage,
    });

    expect(outcome.status).toBe("blocked");
    expect(loadSquidAcquisition(storage, owner)).toEqual(
      expect.objectContaining({ depositTransactionHash: hash, status: "depositing" }),
    );
  });
});
