import type { Address, Hash } from "viem";

/**
 * Persists a single transaction so confirmation and indexing can resume
 * after refresh or reconnect. Loaded records are never rebroadcast.
 */
export type PersistedTransactionStage = "submitted" | "confirmed" | "waiting-for-indexer";

export interface PersistedTransaction<TContext> {
  chainId: number;
  /** Caller-defined, JSON-serializable description of what this transaction was for. */
  context: TContext;
  owner: Address;
  savedAt: number;
  stage: PersistedTransactionStage;
  txHash: Hash;
  /** Receipt block used to distinguish this transaction from older indexed state. */
  blockNumber: bigint | null;
}

type Store = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const STAGES: readonly PersistedTransactionStage[] = ["submitted", "confirmed", "waiting-for-indexer"];
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

function storageKey(namespace: string, owner: Address, chainId: number): string {
  return `${namespace}:${chainId}:${owner.toLowerCase()}`;
}

/** Loads a valid record for this owner and chain, or null for invalid data. */
export function loadPersistedTransaction<TContext>(
  storage: Store,
  namespace: string,
  owner: Address,
  chainId: number,
  decodeContext: (value: unknown) => TContext | null,
): PersistedTransaction<TContext> | null {
  const raw = storage.getItem(storageKey(namespace, owner, chainId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.owner !== "string" ||
      parsed.owner.toLowerCase() !== owner.toLowerCase() ||
      typeof parsed.chainId !== "number" ||
      parsed.chainId !== chainId ||
      typeof parsed.txHash !== "string" ||
      !HASH_PATTERN.test(parsed.txHash) ||
      typeof parsed.savedAt !== "number" ||
      typeof parsed.stage !== "string" ||
      !STAGES.includes(parsed.stage as PersistedTransactionStage) ||
      (parsed.blockNumber !== null && (typeof parsed.blockNumber !== "string" || !/^\d+$/.test(parsed.blockNumber)))
    ) {
      return null;
    }

    const context = decodeContext(parsed.context);
    if (context === null) return null;

    return {
      chainId: parsed.chainId,
      context,
      owner: parsed.owner as Address,
      savedAt: parsed.savedAt,
      stage: parsed.stage as PersistedTransactionStage,
      txHash: parsed.txHash as Hash,
      blockNumber: typeof parsed.blockNumber === "string" ? BigInt(parsed.blockNumber) : null,
    };
  } catch {
    return null;
  }
}

/** Saves a record whose context has already been converted to JSON-safe data. */
export function savePersistedTransaction(
  storage: Store,
  namespace: string,
  record: {
    chainId: number;
    context: unknown;
    owner: Address;
    savedAt: number;
    stage: PersistedTransactionStage;
    txHash: Hash;
    blockNumber: bigint | null;
  },
): void {
  storage.setItem(
    storageKey(namespace, record.owner, record.chainId),
    JSON.stringify({ ...record, blockNumber: record.blockNumber === null ? null : record.blockNumber.toString() }),
  );
}

export function clearPersistedTransaction(storage: Store, namespace: string, owner: Address, chainId: number): void {
  storage.removeItem(storageKey(namespace, owner, chainId));
}
