import { describe, expect, it } from "vitest";
import { clearPersistedTransaction, loadPersistedTransaction, savePersistedTransaction } from "./persistedTransaction";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const OTHER_OWNER = "0x2222222222222222222222222222222222222222" as const;
const HASH = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const NAMESPACE = "test:namespace:v1";
const CHAIN_ID = 314159;

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

const decodeIdentity = (value: unknown) => (value && typeof value === "object" ? (value as { id: string }) : null);

describe("persistedTransaction", () => {
  it("round-trips a saved record, including a bigint block number", () => {
    const storage = memoryStorage();
    savePersistedTransaction(storage, NAMESPACE, {
      chainId: CHAIN_ID,
      context: { id: "context-1" },
      owner: OWNER,
      savedAt: 123,
      stage: "waiting-for-indexer",
      txHash: HASH,
      blockNumber: 4_242_424n,
    });

    const loaded = loadPersistedTransaction(storage, NAMESPACE, OWNER, CHAIN_ID, decodeIdentity);
    expect(loaded).toEqual({
      chainId: CHAIN_ID,
      context: { id: "context-1" },
      owner: OWNER,
      savedAt: 123,
      stage: "waiting-for-indexer",
      txHash: HASH,
      blockNumber: 4_242_424n,
    });
  });

  it("round-trips a null block number for a record not confirmed yet", () => {
    const storage = memoryStorage();
    savePersistedTransaction(storage, NAMESPACE, {
      chainId: CHAIN_ID,
      context: { id: "context-1" },
      owner: OWNER,
      savedAt: 123,
      stage: "submitted",
      txHash: HASH,
      blockNumber: null,
    });

    expect(loadPersistedTransaction(storage, NAMESPACE, OWNER, CHAIN_ID, decodeIdentity)?.blockNumber).toBeNull();
  });

  it("scopes records by owner, chain, and namespace so they never leak across each other", () => {
    const storage = memoryStorage();
    savePersistedTransaction(storage, NAMESPACE, {
      chainId: CHAIN_ID,
      context: { id: "owner-1" },
      owner: OWNER,
      savedAt: 1,
      stage: "submitted",
      txHash: HASH,
      blockNumber: null,
    });

    expect(loadPersistedTransaction(storage, NAMESPACE, OTHER_OWNER, CHAIN_ID, decodeIdentity)).toBeNull();
    expect(loadPersistedTransaction(storage, NAMESPACE, OWNER, CHAIN_ID + 1, decodeIdentity)).toBeNull();
    expect(loadPersistedTransaction(storage, "other:namespace:v1", OWNER, CHAIN_ID, decodeIdentity)).toBeNull();
    expect(loadPersistedTransaction(storage, NAMESPACE, OWNER, CHAIN_ID, decodeIdentity)).not.toBeNull();
  });

  it("rejects a malformed or tampered record instead of throwing", () => {
    const storage = memoryStorage();
    storage.setItem(`${NAMESPACE}:${CHAIN_ID}:${OWNER.toLowerCase()}`, "not json");
    expect(loadPersistedTransaction(storage, NAMESPACE, OWNER, CHAIN_ID, decodeIdentity)).toBeNull();

    storage.setItem(
      `${NAMESPACE}:${CHAIN_ID}:${OWNER.toLowerCase()}`,
      JSON.stringify({
        chainId: CHAIN_ID,
        context: {},
        owner: OWNER,
        savedAt: 1,
        stage: "not-a-stage",
        txHash: HASH,
        blockNumber: null,
      }),
    );
    expect(loadPersistedTransaction(storage, NAMESPACE, OWNER, CHAIN_ID, decodeIdentity)).toBeNull();

    storage.setItem(
      `${NAMESPACE}:${CHAIN_ID}:${OWNER.toLowerCase()}`,
      JSON.stringify({
        chainId: CHAIN_ID,
        context: {},
        owner: OWNER,
        savedAt: 1,
        stage: "submitted",
        txHash: "0xnope",
        blockNumber: null,
      }),
    );
    expect(loadPersistedTransaction(storage, NAMESPACE, OWNER, CHAIN_ID, decodeIdentity)).toBeNull();

    storage.setItem(
      `${NAMESPACE}:${CHAIN_ID}:${OWNER.toLowerCase()}`,
      JSON.stringify({
        chainId: CHAIN_ID,
        context: {},
        owner: OWNER,
        savedAt: 1,
        stage: "confirmed",
        txHash: HASH,
        blockNumber: "not-a-number",
      }),
    );
    expect(loadPersistedTransaction(storage, NAMESPACE, OWNER, CHAIN_ID, decodeIdentity)).toBeNull();
  });

  it("rejects a record whose context the caller's decoder doesn't trust", () => {
    const storage = memoryStorage();
    savePersistedTransaction(storage, NAMESPACE, {
      chainId: CHAIN_ID,
      context: "not an object",
      owner: OWNER,
      savedAt: 1,
      stage: "submitted",
      txHash: HASH,
      blockNumber: null,
    });
    expect(loadPersistedTransaction(storage, NAMESPACE, OWNER, CHAIN_ID, decodeIdentity)).toBeNull();
  });

  it("clears only the targeted record", () => {
    const storage = memoryStorage();
    savePersistedTransaction(storage, NAMESPACE, {
      chainId: CHAIN_ID,
      context: { id: "a" },
      owner: OWNER,
      savedAt: 1,
      stage: "submitted",
      txHash: HASH,
      blockNumber: null,
    });
    savePersistedTransaction(storage, NAMESPACE, {
      chainId: CHAIN_ID,
      context: { id: "b" },
      owner: OTHER_OWNER,
      savedAt: 1,
      stage: "submitted",
      txHash: HASH,
      blockNumber: null,
    });

    clearPersistedTransaction(storage, NAMESPACE, OWNER, CHAIN_ID);

    expect(loadPersistedTransaction(storage, NAMESPACE, OWNER, CHAIN_ID, decodeIdentity)).toBeNull();
    expect(loadPersistedTransaction(storage, NAMESPACE, OTHER_OWNER, CHAIN_ID, decodeIdentity)).not.toBeNull();
  });
});
