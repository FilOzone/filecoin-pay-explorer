import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address, Hash, TransactionReceipt } from "viem";
import { useWaitForTransactionReceipt } from "wagmi";
import {
  clearPersistedTransaction,
  loadPersistedTransaction,
  savePersistedTransaction,
} from "@/utils/persistedTransaction";

/**
 * Lifecycle for an on-chain write that must also appear in the subgraph:
 *
 *   review -> awaiting-signature -> submitted -> confirmed
 *          -> waiting-for-indexer -> complete
 *
 * `failed` covers rejected signatures, cancelled transactions, and confirmed
 * reverts. Receipt lookup errors leave the transaction resumable.
 */
export type TransactionLifecycleStage =
  | "review"
  | "awaiting-signature"
  | "submitted"
  | "confirmed"
  | "waiting-for-indexer"
  | "complete"
  | "failed";

const DEFAULT_POLL_INTERVAL_MS = 3_000;
const DEFAULT_POLL_TIMEOUT_MS = 120_000;
const UNSET = Symbol("unset");
const PERSISTENCE_WARNING_MESSAGE =
  "Transaction submitted, but recovery could not be saved. Keep this transaction hash before closing.";

type Storage = Pick<globalThis.Storage, "getItem" | "removeItem" | "setItem">;

export interface UseIndexedTransactionOptions<TContext> {
  /** Namespaced storage prefix unique to this mutation kind, e.g. "filecoin-pay:add-service:v1". */
  namespace: string;
  owner: Address | undefined;
  chainId: number;
  /** Projects `context` into a JSON-safe value (e.g. bigint -> string) for persistence. */
  encodeContext: (context: TContext) => unknown;
  /** Rebuilds a context from persisted JSON, or returns null to reject a record it doesn't trust. */
  decodeContext: (value: unknown) => TContext | null;
  /** Polls until the subgraph has indexed at least the confirmed receipt block. */
  isIndexed: (context: TContext, confirmedBlockNumber: bigint) => Promise<boolean>;
  /** Runs once, the first time `isIndexed` reports true — invalidate/refetch affected queries here. */
  onIndexed: (context: TContext) => Promise<void> | void;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  /** Override for tests; defaults to `window.localStorage`. */
  storage?: Storage;
}

export interface UseIndexedTransactionResult<TContext> {
  stage: TransactionLifecycleStage;
  txHash: Hash | undefined;
  /** Terminal failure from signing, cancellation, or an on-chain revert. */
  error: Error | undefined;
  /** Receipt lookup failure; the transaction remains submitted and recoverable. */
  watchError: Error | undefined;
  /** Recovery state could not be saved; refreshing may lose transaction tracking. */
  persistenceWarning: Error | undefined;
  /** Post-indexing refresh failed and can be retried with `recheckIndexing`. */
  syncError: Error | undefined;
  /** Context loaded from storage for the recovery UI. */
  resumedContext: TContext | null;
  /** Index polling timed out and can be restarted with `recheckIndexing`. */
  indexingTimedOut: boolean;
  /** Starts one wallet submission from `review` or `failed`. */
  submit: (context: TContext, broadcast: () => Promise<Hash>) => Promise<void>;
  /** Retries fetching the receipt after a `watchError`. */
  recheckReceipt: () => void;
  /** Retries indexing or the failed post-indexing refresh. */
  recheckIndexing: () => void;
  /** Clears a failed or complete run back to "review", including the persisted record if any. */
  reset: () => void;
}

/**
 * Tracks one write through confirmation and subgraph indexing. Persisted
 * progress resumes after refresh or reconnect without rebroadcasting.
 */
export function useIndexedTransaction<TContext>(
  options: UseIndexedTransactionOptions<TContext>,
): UseIndexedTransactionResult<TContext> {
  const {
    namespace,
    owner,
    chainId,
    encodeContext,
    decodeContext,
    isIndexed,
    onIndexed,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    pollTimeoutMs = DEFAULT_POLL_TIMEOUT_MS,
  } = options;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the test override is stable; browser storage is resolved once.
  const storage = useMemo<Storage | undefined>(() => {
    if (options.storage) return options.storage;
    if (typeof window === "undefined") return undefined;
    try {
      return window.localStorage;
    } catch {
      // Some privacy settings throw while reading the storage accessor.
      return undefined;
    }
  }, []);

  const [stage, setStage] = useState<TransactionLifecycleStage>("review");
  const [txHash, setTxHash] = useState<Hash | undefined>();
  const [error, setError] = useState<Error | undefined>();
  const [watchError, setWatchError] = useState<Error | undefined>();
  const [persistenceWarning, setPersistenceWarning] = useState<Error | undefined>();
  const [syncError, setSyncError] = useState<Error | undefined>();
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null);
  const [context, setContext] = useState<TContext | null>(null);
  const [resumedContext, setResumedContext] = useState<TContext | null>(null);
  const [pollStartedAt, setPollStartedAt] = useState<number | null>(null);
  const [indexingTimedOut, setIndexingTimedOut] = useState(false);

  const contextRef = useRef(context);
  contextRef.current = context;

  const identity = owner ? `${chainId}:${owner.toLowerCase()}` : null;
  // Live identity for rejecting async results after a wallet or chain change.
  const identityRef = useRef(identity);
  identityRef.current = identity;

  // Identity that owns the tracked hash, used to reject stale receipt results.
  const transactionIdentityRef = useRef<string | null>(null);

  // Synchronous guard against double submissions before state updates flush.
  const submissionInFlightRef = useRef(false);
  useEffect(() => {
    if (stage === "review" || stage === "failed") submissionInFlightRef.current = false;
  }, [stage]);

  // Distinct from `null` so recovery runs once for a disconnected mount.
  const resumedIdentityRef = useRef<string | null | typeof UNSET>(UNSET);
  const confirmedHandledRef = useRef(false);
  const indexedHandledRef = useRef(false);

  // Resume this identity's record, or reset state without deleting another wallet's record.
  // biome-ignore lint/correctness/useExhaustiveDependencies: identity is the intended recovery trigger.
  useEffect(() => {
    if (resumedIdentityRef.current === identity) return;
    resumedIdentityRef.current = identity;

    const record =
      owner && storage ? loadPersistedTransaction(storage, namespace, owner, chainId, decodeContext) : null;

    confirmedHandledRef.current = false;
    indexedHandledRef.current = false;
    setError(undefined);
    setWatchError(undefined);
    setPersistenceWarning(undefined);
    setSyncError(undefined);

    if (!record) {
      transactionIdentityRef.current = null;
      setStage("review");
      setTxHash(undefined);
      setBlockNumber(null);
      setContext(null);
      setResumedContext(null);
      setPollStartedAt(null);
      setIndexingTimedOut(false);
      return;
    }

    transactionIdentityRef.current = identity;
    setStage(record.stage);
    setTxHash(record.txHash);
    setBlockNumber(record.blockNumber);
    setContext(record.context);
    setResumedContext(record.context);
    setPollStartedAt(record.stage === "waiting-for-indexer" ? Date.now() : null);
    setIndexingTimedOut(false);
  }, [identity]);

  // Return storage failures so callers can avoid leaking warnings across wallets.
  const persist = useCallback(
    (
      nextStage: "submitted" | "confirmed" | "waiting-for-indexer",
      hash: Hash,
      forContext: TContext,
      forBlockNumber: bigint | null,
    ): Error | undefined => {
      if (!owner) return undefined;
      if (!storage) return new Error(PERSISTENCE_WARNING_MESSAGE);
      try {
        savePersistedTransaction(storage, namespace, {
          chainId,
          context: encodeContext(forContext),
          owner,
          savedAt: Date.now(),
          stage: nextStage,
          txHash: hash,
          blockNumber: forBlockNumber,
        });
        return undefined;
      } catch (err) {
        console.error("Failed to save transaction recovery state:", err);
        return err instanceof Error ? err : new Error(PERSISTENCE_WARNING_MESSAGE);
      }
    },
    [owner, storage, namespace, chainId, encodeContext],
  );

  // A failed clear leaves a stale but validated record; it does not change the transaction.
  const safeClear = useCallback(
    (forOwner: Address, forChainId: number) => {
      if (!storage) return;
      try {
        clearPersistedTransaction(storage, namespace, forOwner, forChainId);
      } catch (err) {
        console.error("Failed to clear persisted transaction:", err);
      }
    },
    [storage, namespace],
  );

  const submit = useCallback(
    async (newContext: TContext, broadcast: () => Promise<Hash>) => {
      if (submissionInFlightRef.current || (stage !== "review" && stage !== "failed")) return;
      submissionInFlightRef.current = true;

      // Bind the request to the identity active before the wallet prompt.
      const submittingIdentity = identityRef.current;

      setError(undefined);
      setWatchError(undefined);
      setPersistenceWarning(undefined);
      setSyncError(undefined);
      setBlockNumber(null);
      setContext(newContext);
      setResumedContext(null);
      setIndexingTimedOut(false);
      setStage("awaiting-signature");

      let hash: Hash;
      try {
        hash = await broadcast();
      } catch (err) {
        // Do not show this rejection after the user switches wallets.
        if (identityRef.current === submittingIdentity) {
          setStage("failed");
          setError(err instanceof Error ? err : new Error("The transaction request failed."));
        }
        return;
      }

      // `persist` is bound to the owner and chain that started this request.
      const persistenceOutcome = persist("submitted", hash, newContext, null);

      if (identityRef.current !== submittingIdentity) {
        // The original wallet can resume its saved transaction when it reconnects.
        return;
      }

      confirmedHandledRef.current = false;
      transactionIdentityRef.current = submittingIdentity;
      setPersistenceWarning(persistenceOutcome);
      setTxHash(hash);
      setStage("submitted");
    },
    [stage, persist],
  );

  // wagmi may report one confirmation through both replacement and success paths.
  const handleConfirmed = useCallback(
    (hash: Hash, receipt: TransactionReceipt) => {
      if (confirmedHandledRef.current) return;
      confirmedHandledRef.current = true;
      setWatchError(undefined);

      // Query success means a receipt was found; its status can still be reverted.
      if (receipt.status !== "success") {
        if (owner) safeClear(owner, chainId);
        setTxHash(hash);
        setStage("failed");
        setError(new Error("The transaction was reverted on-chain."));
        return;
      }

      setTxHash(hash);
      setBlockNumber(receipt.blockNumber);
      setStage("confirmed");
      // Both callers verify the transaction identity before reaching this point.
      const forContext = contextRef.current;
      if (forContext) setPersistenceWarning(persist("confirmed", hash, forContext, receipt.blockNumber));
    },
    [persist, owner, safeClear, chainId],
  );

  const receiptQuery = useWaitForTransactionReceipt({
    chainId,
    hash: txHash,
    onReplaced: (replacement) => {
      // Re-check because a replacement callback can outlive its originating render.
      if (stage !== "submitted" || transactionIdentityRef.current !== identityRef.current) return;
      if (replacement.reason === "cancelled") {
        if (owner) safeClear(owner, chainId);
        setStage("failed");
        setError(new Error("This transaction was cancelled from your wallet."));
        return;
      }
      handleConfirmed(replacement.transaction.hash, replacement.transactionReceipt);
    },
    query: { enabled: stage === "submitted" && !!txHash },
  });

  // React Query can retain a successful receipt after the watch is disabled.
  // Check both stage and identity before consuming that cached result.
  useEffect(() => {
    if (
      stage !== "submitted" ||
      transactionIdentityRef.current !== identityRef.current ||
      !receiptQuery.isSuccess ||
      !receiptQuery.data
    ) {
      return;
    }
    handleConfirmed(receiptQuery.data.transactionHash, receiptQuery.data);
  }, [stage, receiptQuery.isSuccess, receiptQuery.data, handleConfirmed]);

  // An RPC error does not prove failure. Keep tracking and scope the warning
  // to the identity that submitted the transaction.
  useEffect(() => {
    if (
      stage !== "submitted" ||
      transactionIdentityRef.current !== identityRef.current ||
      !receiptQuery.isError ||
      !receiptQuery.error
    ) {
      return;
    }
    setWatchError(receiptQuery.error);
  }, [stage, receiptQuery.isError, receiptQuery.error]);

  const recheckReceipt = useCallback(() => {
    setWatchError(undefined);
    void receiptQuery.refetch();
  }, [receiptQuery.refetch]);

  // Keep confirmation visible for one render before polling the indexer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the confirmed-stage transition should trigger this.
  useEffect(() => {
    if (
      stage !== "confirmed" ||
      transactionIdentityRef.current !== identityRef.current ||
      !txHash ||
      !context ||
      blockNumber === null
    ) {
      return;
    }
    setPollStartedAt(Date.now());
    setStage("waiting-for-indexer");
    setPersistenceWarning(persist("waiting-for-indexer", txHash, context, blockNumber));
  }, [stage]);

  // A fresh or replacement hash has not completed indexing yet.
  // biome-ignore lint/correctness/useExhaustiveDependencies: txHash is intentionally a pure trigger for this reset.
  useEffect(() => {
    indexedHandledRef.current = false;
  }, [txHash]);

  const indexingQuery = useQuery({
    enabled: stage === "waiting-for-indexer" && !!context && blockNumber !== null,
    queryFn: () => {
      if (!context || blockNumber === null) throw new Error("Missing transaction context to check indexing");
      return isIndexed(context, blockNumber);
    },
    queryKey: ["indexed-transaction", namespace, identity, txHash],
    refetchInterval: (query) => {
      if (query.state.data === true) return false;
      if (pollStartedAt !== null && Date.now() - pollStartedAt > pollTimeoutMs) return false;
      return pollIntervalMs;
    },
    retry: false,
  });

  // Refresh indexed data, then complete only if the same identity is still active.
  const runCompletion = useCallback(
    async (
      forContext: TContext,
      completingIdentity: string | null,
      completingOwner: Address | undefined,
      completingChainId: number,
    ) => {
      try {
        await onIndexed(forContext);
      } catch (err) {
        indexedHandledRef.current = false;
        if (identityRef.current === completingIdentity) {
          setSyncError(err instanceof Error ? err : new Error("Couldn't finish syncing this transaction."));
        }
        return;
      }

      if (completingOwner) safeClear(completingOwner, completingChainId);
      if (identityRef.current !== completingIdentity) return;
      setSyncError(undefined);
      setStage("complete");
    },
    [onIndexed, safeClear],
  );

  useEffect(() => {
    if (indexingQuery.data !== true || indexedHandledRef.current || !context) return;
    indexedHandledRef.current = true;
    setSyncError(undefined);
    void runCompletion(context, identity, owner, chainId);
  }, [indexingQuery.data, context, runCompletion, identity, owner, chainId]);

  // Use a wall-clock timer because query polling may stop without another render.
  useEffect(() => {
    if (stage !== "waiting-for-indexer" || pollStartedAt === null) {
      setIndexingTimedOut(false);
      return;
    }
    const remaining = pollStartedAt + pollTimeoutMs - Date.now();
    if (remaining <= 0) {
      setIndexingTimedOut(true);
      return;
    }
    const timer = setTimeout(() => setIndexingTimedOut(true), remaining);
    return () => clearTimeout(timer);
  }, [stage, pollStartedAt, pollTimeoutMs]);

  const recheckIndexing = useCallback(() => {
    // Indexing already succeeded, so retry only the failed refresh step.
    if (syncError && context) {
      indexedHandledRef.current = true;
      setSyncError(undefined);
      void runCompletion(context, identity, owner, chainId);
      return;
    }
    setPollStartedAt(Date.now());
    setIndexingTimedOut(false);
    void indexingQuery.refetch();
  }, [syncError, context, runCompletion, identity, owner, chainId, indexingQuery.refetch]);

  const reset = useCallback(() => {
    if (owner) safeClear(owner, chainId);
    confirmedHandledRef.current = false;
    indexedHandledRef.current = false;
    submissionInFlightRef.current = false;
    transactionIdentityRef.current = null;
    setStage("review");
    setTxHash(undefined);
    setError(undefined);
    setWatchError(undefined);
    setPersistenceWarning(undefined);
    setSyncError(undefined);
    setBlockNumber(null);
    setContext(null);
    setResumedContext(null);
    setPollStartedAt(null);
    setIndexingTimedOut(false);
  }, [owner, safeClear, chainId]);

  return {
    stage,
    txHash,
    error,
    watchError,
    persistenceWarning,
    syncError,
    resumedContext,
    indexingTimedOut,
    submit,
    recheckReceipt,
    recheckIndexing,
    reset,
  };
}
