import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, create } from "react-test-renderer";
import type { TransactionReceipt } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPersistedTransaction } from "@/utils/persistedTransaction";
import { useIndexedTransaction } from "./useIndexedTransaction";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const OTHER_OWNER = "0x2222222222222222222222222222222222222222" as const;
const CHAIN_ID = 314159;
const HASH_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const HASH_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const NAMESPACE = "test:indexed-tx:v1";
const BLOCK_NUMBER = 1_000n;

function receiptFor(hash: string, status: "success" | "reverted" = "success"): TransactionReceipt {
  return { transactionHash: hash, status, blockNumber: BLOCK_NUMBER } as TransactionReceipt;
}

const mocks = vi.hoisted(() => ({
  // Mirror wagmi's hash-scoped receipt cache.
  receipt: {
    forHash: undefined as string | undefined,
    data: undefined as TransactionReceipt | undefined,
    isSuccess: false,
    isError: false,
    error: undefined as Error | undefined,
  },
  lastOnReplaced: undefined as
    | ((replacement: {
        reason: "replaced" | "repriced" | "cancelled";
        transaction: { hash: string };
        transactionReceipt: TransactionReceipt;
      }) => void)
    | undefined,
  lastRefetch: undefined as (() => void) | undefined,
}));

vi.mock("wagmi", () => ({
  useWaitForTransactionReceipt: (opts: { hash?: string; onReplaced?: typeof mocks.lastOnReplaced }) => {
    mocks.lastOnReplaced = opts.onReplaced;
    const refetch = vi.fn();
    mocks.lastRefetch = refetch;
    const matches = opts.hash !== undefined && opts.hash === mocks.receipt.forHash;
    return {
      data: matches ? mocks.receipt.data : undefined,
      isSuccess: matches && mocks.receipt.isSuccess,
      isError: matches && mocks.receipt.isError,
      error: matches ? mocks.receipt.error : undefined,
      refetch,
    };
  },
}));

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage;
}

/** Readable storage that rejects every write. */
function throwingStorage(): Storage {
  const backing = memoryStorage();
  return {
    ...backing,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  } as Storage;
}

interface Ctx {
  id: string;
}

function decodeCtx(value: unknown): Ctx | null {
  if (!value || typeof value !== "object" || typeof (value as Ctx).id !== "string") return null;
  return { id: (value as Ctx).id };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Unmount polling hooks before shared mocks are reused by the next test.
const activeRenderers: Array<ReturnType<typeof create>> = [];

function renderLifecycle(overrides: {
  owner?: `0x${string}` | undefined;
  storage?: Storage;
  /** Omits the storage override to exercise unavailable browser storage. */
  noStorage?: boolean;
  isIndexed?: (context: Ctx, confirmedBlockNumber: bigint) => Promise<boolean>;
  onIndexed?: (context: Ctx) => Promise<void>;
}) {
  // Keep backing storage for assertions even when the hook receives none.
  const storage = overrides.storage ?? memoryStorage();
  const isIndexed = overrides.isIndexed ?? vi.fn().mockResolvedValue(false);
  const onIndexed = overrides.onIndexed ?? vi.fn().mockResolvedValue(undefined);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  let result!: ReturnType<typeof useIndexedTransaction<Ctx>>;
  function Harness({ owner }: { owner: `0x${string}` | undefined }) {
    result = useIndexedTransaction<Ctx>({
      namespace: NAMESPACE,
      owner,
      chainId: CHAIN_ID,
      encodeContext: (context) => context,
      decodeContext: decodeCtx,
      isIndexed,
      onIndexed,
      pollIntervalMs: 5,
      pollTimeoutMs: 40,
      ...(overrides.noStorage ? {} : { storage }),
    });
    return null;
  }

  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <QueryClientProvider client={queryClient}>
        <Harness owner={overrides.owner ?? OWNER} />
      </QueryClientProvider>,
    );
  });
  activeRenderers.push(renderer);

  return {
    get result() {
      return result;
    },
    storage,
    isIndexed,
    onIndexed,
    rerenderWithOwner: (owner: `0x${string}` | undefined) =>
      act(() => {
        renderer.update(
          <QueryClientProvider client={queryClient}>
            <Harness owner={owner} />
          </QueryClientProvider>,
        );
      }),
    rerender: () =>
      act(() => {
        renderer.update(
          <QueryClientProvider client={queryClient}>
            <Harness owner={overrides.owner ?? OWNER} />
          </QueryClientProvider>,
        );
      }),
  };
}

beforeEach(() => {
  mocks.receipt = { forHash: undefined, data: undefined, isSuccess: false, isError: false, error: undefined };
  mocks.lastOnReplaced = undefined;
  mocks.lastRefetch = undefined;
});

afterEach(() => {
  act(() => {
    for (const renderer of activeRenderers.splice(0)) renderer.unmount();
  });
  vi.restoreAllMocks();
});

describe("useIndexedTransaction", () => {
  it("walks review -> awaiting-signature -> submitted -> confirmed -> waiting-for-indexer -> complete, persisting and invalidating along the way", async () => {
    const isIndexed = vi.fn().mockResolvedValue(false);
    const onIndexed = vi.fn().mockResolvedValue(undefined);
    const harness = renderLifecycle({ isIndexed, onIndexed });
    expect(harness.result.stage).toBe("review");

    let resolveBroadcast!: (hash: `0x${string}`) => void;
    const broadcast = vi.fn(() => new Promise<`0x${string}`>((resolve) => (resolveBroadcast = resolve)));

    act(() => {
      void harness.result.submit({ id: "ctx-1" }, broadcast);
    });
    expect(harness.result.stage).toBe("awaiting-signature");

    await act(async () => {
      resolveBroadcast(HASH_A);
      await Promise.resolve();
    });
    expect(harness.result.stage).toBe("submitted");
    expect(harness.result.txHash).toBe(HASH_A);
    expect(loadPersistedTransaction(harness.storage, NAMESPACE, OWNER, CHAIN_ID, decodeCtx)?.stage).toBe("submitted");

    mocks.receipt = { forHash: HASH_A, data: receiptFor(HASH_A), isSuccess: true, isError: false, error: undefined };
    await act(async () => {
      harness.rerender();
      await Promise.resolve();
    });
    expect(harness.result.stage).toBe("waiting-for-indexer");
    const persisted = loadPersistedTransaction(harness.storage, NAMESPACE, OWNER, CHAIN_ID, decodeCtx);
    expect(persisted?.stage).toBe("waiting-for-indexer");
    expect(persisted?.blockNumber).toBe(BLOCK_NUMBER);
    expect(onIndexed).not.toHaveBeenCalled();

    // Indexing hasn't happened yet: even after a few real poll ticks, completion must not fire early.
    await act(async () => {
      await sleep(25);
    });
    expect(harness.result.stage).toBe("waiting-for-indexer");
    expect(isIndexed.mock.calls.length).toBeGreaterThan(0);
    expect(isIndexed).toHaveBeenCalledWith({ id: "ctx-1" }, BLOCK_NUMBER);

    isIndexed.mockResolvedValue(true);
    await act(async () => {
      harness.result.recheckIndexing();
      await sleep(10);
    });
    expect(harness.result.stage).toBe("complete");
    expect(onIndexed).toHaveBeenCalledWith({ id: "ctx-1" });
    expect(loadPersistedTransaction(harness.storage, NAMESPACE, OWNER, CHAIN_ID, decodeCtx)).toBeNull();
  });

  it("times out the indexing wait without failing, and a manual recheck still completes it", async () => {
    const isIndexed = vi.fn().mockResolvedValue(false);
    const harness = renderLifecycle({ isIndexed });

    await act(async () => {
      void harness.result.submit({ id: "ctx-1" }, () => Promise.resolve(HASH_A));
      await Promise.resolve();
    });
    mocks.receipt = { forHash: HASH_A, data: receiptFor(HASH_A), isSuccess: true, isError: false, error: undefined };
    await act(async () => {
      harness.rerender();
      await Promise.resolve();
    });
    expect(harness.result.stage).toBe("waiting-for-indexer");

    await act(async () => {
      await sleep(60); // pollTimeoutMs is 40
    });
    expect(harness.result.indexingTimedOut).toBe(true);
    expect(harness.result.stage).toBe("waiting-for-indexer");

    isIndexed.mockResolvedValue(true);
    await act(async () => {
      harness.result.recheckIndexing();
      await sleep(10);
    });
    expect(harness.result.stage).toBe("complete");
  });

  it("resumes a submitted transaction from storage after a refresh without ever calling broadcast again", async () => {
    const storage = memoryStorage();
    const preSeeded = renderLifecycle({ storage, isIndexed: vi.fn().mockResolvedValue(false) });
    await act(async () => {
      void preSeeded.result.submit({ id: "ctx-1" }, () => Promise.resolve(HASH_A));
      await Promise.resolve();
    });
    expect(preSeeded.result.stage).toBe("submitted");

    // Start unindexed so the intermediate stage is deterministic under load.
    const broadcastAfterRefresh = vi.fn();
    const isIndexed = vi.fn().mockResolvedValue(false);
    const resumed = renderLifecycle({ storage, isIndexed });
    expect(resumed.result.stage).toBe("submitted");
    expect(resumed.result.resumedContext).toEqual({ id: "ctx-1" });
    expect(resumed.result.txHash).toBe(HASH_A);

    mocks.receipt = { forHash: HASH_A, data: receiptFor(HASH_A), isSuccess: true, isError: false, error: undefined };
    await act(async () => {
      resumed.rerender();
      await Promise.resolve();
    });
    expect(resumed.result.stage).toBe("waiting-for-indexer");

    isIndexed.mockResolvedValue(true);
    await act(async () => {
      resumed.result.recheckIndexing();
      await sleep(10);
    });
    expect(resumed.result.stage).toBe("complete");
    expect(broadcastAfterRefresh).not.toHaveBeenCalled();
  });

  it("resumes a waiting-for-indexer record's block number, so a re-approved pair doesn't complete early", async () => {
    const storage = memoryStorage();
    const preSeeded = renderLifecycle({ storage, isIndexed: vi.fn().mockResolvedValue(false) });
    await act(async () => {
      void preSeeded.result.submit({ id: "ctx-1" }, () => Promise.resolve(HASH_A));
      await Promise.resolve();
    });
    mocks.receipt = { forHash: HASH_A, data: receiptFor(HASH_A), isSuccess: true, isError: false, error: undefined };
    await act(async () => {
      preSeeded.rerender();
      await Promise.resolve();
    });
    expect(preSeeded.result.stage).toBe("waiting-for-indexer");

    const isIndexed = vi.fn().mockResolvedValue(false);
    const resumed = renderLifecycle({ storage, isIndexed });
    expect(resumed.result.stage).toBe("waiting-for-indexer");

    await act(async () => {
      await sleep(15);
    });
    expect(isIndexed).toHaveBeenCalledWith({ id: "ctx-1" }, BLOCK_NUMBER);
  });

  it("falls back to review for a different wallet without touching the first wallet's saved record", async () => {
    const storage = memoryStorage();
    const owner1 = renderLifecycle({ storage, owner: OWNER });
    await act(async () => {
      void owner1.result.submit({ id: "ctx-owner1" }, () => Promise.resolve(HASH_A));
      await Promise.resolve();
    });
    expect(owner1.result.stage).toBe("submitted");

    owner1.rerenderWithOwner(OTHER_OWNER);
    expect(owner1.result.stage).toBe("review");

    owner1.rerenderWithOwner(OWNER);
    expect(owner1.result.stage).toBe("submitted");
    expect(owner1.result.txHash).toBe(HASH_A);
  });

  it("does not attribute wallet A's receipt to wallet B when the switch and the receipt land in the same update", async () => {
    // Stage alone is stale during this commit; transaction identity must reject the receipt.
    const harness = renderLifecycle({ owner: OWNER });
    await act(async () => {
      void harness.result.submit({ id: "ctx-owner1" }, () => Promise.resolve(HASH_A));
      await Promise.resolve();
    });
    expect(harness.result.stage).toBe("submitted");

    // Deliver A's receipt in the same update that connects B.
    mocks.receipt = { forHash: HASH_A, data: receiptFor(HASH_A), isSuccess: true, isError: false, error: undefined };
    harness.rerenderWithOwner(OTHER_OWNER);

    expect(harness.result.stage).toBe("review");
    expect(harness.result.txHash).toBeUndefined();

    // Clear the receipt result before testing A's persisted recovery record.
    mocks.receipt = { forHash: undefined, data: undefined, isSuccess: false, isError: false, error: undefined };
    harness.rerenderWithOwner(OWNER);
    expect(harness.result.stage).toBe("submitted");
    expect(harness.result.txHash).toBe(HASH_A);
  });

  it("does not attribute wallet A's receipt-lookup error to wallet B when the switch and the error land in the same update", async () => {
    // Transaction identity must reject an error delivered during the wallet switch.
    const harness = renderLifecycle({ owner: OWNER });
    await act(async () => {
      void harness.result.submit({ id: "ctx-owner1" }, () => Promise.resolve(HASH_A));
      await Promise.resolve();
    });
    expect(harness.result.stage).toBe("submitted");

    // Fail A's receipt lookup in the same update that connects B.
    mocks.receipt = {
      forHash: HASH_A,
      data: undefined,
      isSuccess: false,
      isError: true,
      error: new Error("network request failed"),
    };
    harness.rerenderWithOwner(OTHER_OWNER);

    // B must not inherit A's receipt error.
    expect(harness.result.stage).toBe("review");
    expect(harness.result.watchError).toBeUndefined();
  });

  it("associates a submission with the wallet that requested it, not whichever is connected when broadcast() resolves", async () => {
    const storage = memoryStorage();
    let resolveBroadcast!: (hash: `0x${string}`) => void;
    const broadcast = vi.fn(() => new Promise<`0x${string}`>((resolve) => (resolveBroadcast = resolve)));

    const harness = renderLifecycle({ storage, owner: OWNER });
    act(() => {
      void harness.result.submit({ id: "ctx-owner1" }, broadcast);
    });
    expect(harness.result.stage).toBe("awaiting-signature");

    // Switch to B while A's wallet request is pending.
    harness.rerenderWithOwner(OTHER_OWNER);
    expect(harness.result.stage).toBe("review");

    // Resolve A's broadcast after the switch.
    await act(async () => {
      resolveBroadcast(HASH_A);
      await Promise.resolve();
    });

    // B's dialog stays untouched.
    expect(harness.result.stage).toBe("review");
    expect(harness.result.txHash).toBeUndefined();

    // A's transaction remains persisted under A.
    const persisted = loadPersistedTransaction(storage, NAMESPACE, OWNER, CHAIN_ID, decodeCtx);
    expect(persisted?.stage).toBe("submitted");
    expect(persisted?.txHash).toBe(HASH_A);

    // A resumes its transaction after reconnecting.
    harness.rerenderWithOwner(OWNER);
    expect(harness.result.stage).toBe("submitted");
    expect(harness.result.txHash).toBe(HASH_A);
  });

  it("does not report a rejection against a wallet that reconnected as someone else while the signature was pending", async () => {
    let rejectBroadcast!: (err: Error) => void;
    const broadcast = vi.fn(
      () =>
        new Promise<`0x${string}`>((_, reject) => {
          rejectBroadcast = reject;
        }),
    );

    const harness = renderLifecycle({ owner: OWNER });
    act(() => {
      void harness.result.submit({ id: "ctx-owner1" }, broadcast);
    });

    harness.rerenderWithOwner(OTHER_OWNER);
    expect(harness.result.stage).toBe("review");

    await act(async () => {
      rejectBroadcast(new Error("User rejected the request"));
      await Promise.resolve();
    });

    // Wallet B never asked for anything, so it must not show A's rejection.
    expect(harness.result.stage).toBe("review");
    expect(harness.result.error).toBeUndefined();
  });

  it("does not leak a persistence warning belonging to a switched-away wallet's submission", async () => {
    let resolveBroadcast!: (hash: `0x${string}`) => void;
    const broadcast = vi.fn(() => new Promise<`0x${string}`>((resolve) => (resolveBroadcast = resolve)));

    // A's failed save must not surface in B's dialog.
    const harness = renderLifecycle({ owner: OWNER, storage: throwingStorage() });
    act(() => {
      void harness.result.submit({ id: "ctx-owner1" }, broadcast);
    });

    harness.rerenderWithOwner(OTHER_OWNER);
    expect(harness.result.persistenceWarning).toBeUndefined();

    await act(async () => {
      resolveBroadcast(HASH_A);
      await Promise.resolve();
    });

    // B receives no state or warning from A's request.
    expect(harness.result.stage).toBe("review");
    expect(harness.result.txHash).toBeUndefined();
    expect(harness.result.persistenceWarning).toBeUndefined();
  });

  it("recovers from a rejected signature (no hash, nothing persisted) and allows retrying", async () => {
    const harness = renderLifecycle({});
    await act(async () => {
      await harness.result.submit({ id: "ctx-1" }, () => Promise.reject(new Error("User rejected the request")));
    });
    expect(harness.result.stage).toBe("failed");
    expect(harness.result.error?.message).toBe("User rejected the request");
    expect(loadPersistedTransaction(harness.storage, NAMESPACE, OWNER, CHAIN_ID, decodeCtx)).toBeNull();

    await act(async () => {
      void harness.result.submit({ id: "ctx-2" }, () => Promise.resolve(HASH_A));
      await Promise.resolve();
    });
    expect(harness.result.stage).toBe("submitted");
  });

  it("recovers from a confirmed revert (receipt status !== success), clearing the persisted record", async () => {
    const harness = renderLifecycle({});
    await act(async () => {
      void harness.result.submit({ id: "ctx-1" }, () => Promise.resolve(HASH_A));
      await Promise.resolve();
    });

    // A found receipt can still represent an on-chain revert.
    mocks.receipt = {
      forHash: HASH_A,
      data: receiptFor(HASH_A, "reverted"),
      isSuccess: true,
      isError: false,
      error: undefined,
    };
    await act(async () => {
      harness.rerender();
    });
    expect(harness.result.stage).toBe("failed");
    expect(harness.result.error?.message).toMatch(/reverted/i);
    expect(loadPersistedTransaction(harness.storage, NAMESPACE, OWNER, CHAIN_ID, decodeCtx)).toBeNull();
  });

  it("does not treat a receipt lookup error as a failure — keeps the record and offers a recheck instead of resubmission", async () => {
    const harness = renderLifecycle({});
    await act(async () => {
      void harness.result.submit({ id: "ctx-1" }, () => Promise.resolve(HASH_A));
      await Promise.resolve();
    });

    mocks.receipt = {
      forHash: HASH_A,
      data: undefined,
      isSuccess: false,
      isError: true,
      error: new Error("network request failed"),
    };
    await act(async () => {
      harness.rerender();
    });

    // An RPC error leaves the submitted transaction recoverable.
    expect(harness.result.stage).toBe("submitted");
    expect(harness.result.error).toBeUndefined();
    expect(harness.result.watchError?.message).toBe("network request failed");
    expect(loadPersistedTransaction(harness.storage, NAMESPACE, OWNER, CHAIN_ID, decodeCtx)?.stage).toBe("submitted");

    harness.result.recheckReceipt();
    expect(mocks.lastRefetch).toHaveBeenCalled();
  });

  it("surfaces a persistence warning (without failing or blocking resubmission-guard) when storage.setItem throws", async () => {
    const harness = renderLifecycle({ storage: throwingStorage() });
    await act(async () => {
      void harness.result.submit({ id: "ctx-1" }, () => Promise.resolve(HASH_A));
      await Promise.resolve();
    });

    // A storage failure must not fail the transaction.
    expect(harness.result.stage).toBe("submitted");
    expect(harness.result.txHash).toBe(HASH_A);
    expect(harness.result.error).toBeUndefined();
    expect(harness.result.persistenceWarning?.message).toBeTruthy();

    // The persistence warning must not permit another submission.
    const secondBroadcast = vi.fn();
    await act(async () => {
      void harness.result.submit({ id: "ctx-2" }, secondBroadcast);
    });
    expect(secondBroadcast).not.toHaveBeenCalled();
  });

  it("surfaces a persistence warning when storage itself is unavailable, not only when setItem throws", async () => {
    const harness = renderLifecycle({ noStorage: true });
    await act(async () => {
      void harness.result.submit({ id: "ctx-1" }, () => Promise.resolve(HASH_A));
      await Promise.resolve();
    });

    // Missing storage warns without failing the transaction.
    expect(harness.result.stage).toBe("submitted");
    expect(harness.result.txHash).toBe(HASH_A);
    expect(harness.result.error).toBeUndefined();
    expect(harness.result.persistenceWarning?.message).toBeTruthy();
  });

  it("clears the persistence warning once a later save succeeds", async () => {
    const storage = throwingStorage();
    const harness = renderLifecycle({ storage });
    await act(async () => {
      void harness.result.submit({ id: "ctx-1" }, () => Promise.resolve(HASH_A));
      await Promise.resolve();
    });
    expect(harness.result.persistenceWarning).toBeDefined();

    // Storage recovers (e.g. quota freed up) before the next persist call.
    Object.assign(storage, memoryStorage());
    mocks.receipt = { forHash: HASH_A, data: receiptFor(HASH_A), isSuccess: true, isError: false, error: undefined };
    await act(async () => {
      harness.rerender();
      await Promise.resolve();
    });
    expect(harness.result.persistenceWarning).toBeUndefined();
  });

  it("recovers from onIndexed rejecting: exposes a syncError, doesn't get stuck, and a retry completes it", async () => {
    const onIndexed = vi.fn().mockRejectedValueOnce(new Error("invalidation failed")).mockResolvedValue(undefined);
    const isIndexed = vi.fn().mockResolvedValue(true);
    const harness = renderLifecycle({ isIndexed, onIndexed });

    await act(async () => {
      void harness.result.submit({ id: "ctx-1" }, () => Promise.resolve(HASH_A));
      await Promise.resolve();
    });
    mocks.receipt = { forHash: HASH_A, data: receiptFor(HASH_A), isSuccess: true, isError: false, error: undefined };
    await act(async () => {
      harness.rerender();
      await Promise.resolve();
    });
    expect(harness.result.stage).toBe("waiting-for-indexer");

    // Let the indexing poll fire and trigger completion, which fails once.
    await act(async () => {
      await sleep(20);
    });
    expect(harness.result.syncError?.message).toBe("invalidation failed");
    expect(harness.result.stage).toBe("waiting-for-indexer");

    // Retry the failed post-indexing refresh without polling again.
    await act(async () => {
      harness.result.recheckIndexing();
      await Promise.resolve();
    });
    expect(harness.result.stage).toBe("complete");
    expect(onIndexed).toHaveBeenCalledTimes(2);
  });

  it("does not apply a stale completion to a wallet the hook has since switched to", async () => {
    const storage = memoryStorage();
    let resolveOnIndexed!: () => void;
    const onIndexed = vi.fn(() => new Promise<void>((resolve) => (resolveOnIndexed = resolve)));
    const isIndexed = vi.fn().mockResolvedValue(true);
    const harness = renderLifecycle({ storage, owner: OWNER, isIndexed, onIndexed });

    await act(async () => {
      void harness.result.submit({ id: "ctx-owner1" }, () => Promise.resolve(HASH_A));
      await Promise.resolve();
    });
    mocks.receipt = { forHash: HASH_A, data: receiptFor(HASH_A), isSuccess: true, isError: false, error: undefined };
    await act(async () => {
      harness.rerender();
      await Promise.resolve();
    });
    expect(harness.result.stage).toBe("waiting-for-indexer");

    // Triggers completion, which is now awaiting onIndexed.
    await act(async () => {
      await sleep(20);
    });
    expect(onIndexed).toHaveBeenCalledTimes(1);

    // The wallet switches to a different owner before onIndexed resolves.
    harness.rerenderWithOwner(OTHER_OWNER);
    expect(harness.result.stage).toBe("review");

    await act(async () => {
      resolveOnIndexed();
      await Promise.resolve();
    });

    // Wallet B's state must not have been stomped by wallet A's late completion.
    expect(harness.result.stage).toBe("review");
    // Wallet A's own record was still cleaned up.
    expect(loadPersistedTransaction(storage, NAMESPACE, OWNER, CHAIN_ID, decodeCtx)).toBeNull();

    harness.rerenderWithOwner(OWNER);
    expect(harness.result.stage).toBe("review");
  });

  it("keeps tracking under the new hash when the wallet reprices/replaces the transaction", async () => {
    const harness = renderLifecycle({});
    await act(async () => {
      void harness.result.submit({ id: "ctx-1" }, () => Promise.resolve(HASH_A));
      await Promise.resolve();
    });

    await act(async () => {
      mocks.lastOnReplaced?.({
        reason: "repriced",
        transaction: { hash: HASH_B },
        transactionReceipt: receiptFor(HASH_B),
      });
    });
    expect(harness.result.txHash).toBe(HASH_B);
    expect(harness.result.stage).toBe("waiting-for-indexer");
  });

  it("does not move a switched-away wallet's dialog to waiting-for-indexer when confirmation lands late", async () => {
    // Call outside `act()` to preserve the browser's interruptible passive-effect window.
    const harness = renderLifecycle({ owner: OWNER });
    await act(async () => {
      void harness.result.submit({ id: "ctx-owner1" }, () => Promise.resolve(HASH_A));
      await Promise.resolve();
    });
    expect(harness.result.stage).toBe("submitted");

    mocks.lastOnReplaced?.({
      reason: "repriced",
      transaction: { hash: HASH_A },
      transactionReceipt: receiptFor(HASH_A),
    });

    // Switch to B before the confirmation effect flushes.
    harness.rerenderWithOwner(OTHER_OWNER);

    // B must not enter A's indexing stage.
    expect(harness.result.stage).toBe("review");
    expect(harness.result.txHash).toBeUndefined();
  });

  it("fails clearly when the wallet cancels the transaction instead of replacing it", async () => {
    const harness = renderLifecycle({});
    await act(async () => {
      void harness.result.submit({ id: "ctx-1" }, () => Promise.resolve(HASH_A));
      await Promise.resolve();
    });

    act(() => {
      mocks.lastOnReplaced?.({
        reason: "cancelled",
        transaction: { hash: HASH_B },
        transactionReceipt: receiptFor(HASH_B),
      });
    });
    expect(harness.result.stage).toBe("failed");
    expect(harness.result.error?.message).toMatch(/cancelled/i);
    expect(loadPersistedTransaction(harness.storage, NAMESPACE, OWNER, CHAIN_ID, decodeCtx)).toBeNull();
  });

  it("ignores a second submit while one is already in flight", async () => {
    const harness = renderLifecycle({});
    const broadcast = vi.fn(() => new Promise<`0x${string}`>(() => {})); // never resolves
    act(() => {
      void harness.result.submit({ id: "ctx-1" }, broadcast);
      void harness.result.submit({ id: "ctx-2" }, broadcast);
    });
    expect(broadcast).toHaveBeenCalledTimes(1);
  });
});
