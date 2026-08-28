"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import { useReadContracts } from "wagmi";
import { getChain } from "@/constants/chains";
import type { Network } from "@/types";
import { fetchAuthorizationEvents } from "@/utils/sessionKeyChain";
import { foldAuthorizationEvents, mergeSyncedRecords } from "@/utils/sessionKeySync";
import {
  deriveKeyStatus,
  isScopeActive,
  SCOPE_BY_ID,
  type ScopeId,
  SESSION_KEY_SCOPES,
  type SessionKeyRecord,
  type SessionKeyStatus,
  sanitizeRecords,
} from "@/utils/sessionKeys";

export interface SessionKeyWithStatus extends SessionKeyRecord {
  /** "unknown" until the first chain read resolves. */
  status: SessionKeyStatus | "unknown";
  scopeExpiries: Partial<Record<ScopeId, bigint>>;
  /** Latest expiry across granted scopes (0n if revoked/never). */
  maxExpiry: bigint;
  scopeActive: Partial<Record<ScopeId, boolean>>;
}

export interface SyncFromChainResult {
  addedCount: number;
  /** Existing records healed from chain history */
  updatedCount: number;
  skippedUnrecognized: number;
}

const storageKey = (network: Network, account: Hex) => `fp-session-keys:${network}:${account.toLowerCase()}`;

function loadRecords(network: Network, account: Hex): SessionKeyRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(network, account));
    // sanitizeRecords: localStorage is same-origin-writable and schema-drifts
    // across releases; a malformed record must never crash the revoke page.
    return raw ? sanitizeRecords(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/**
 * Local inventory of session keys created in this browser; status is ALWAYS
 * read live from SessionKeyRegistry.authorizationExpiry so Active/Expired/Revoked
 * never lies. Secrets are never stored — only the public address, name, and scopes.
 */
export function useSessionKeys(network: Network, account: Hex) {
  const [records, setRecords] = useState<SessionKeyRecord[]>(() => loadRecords(network, account));

  // Reload when wallet or network changes.
  useEffect(() => {
    setRecords(loadRecords(network, account));
  }, [network, account]);

  const persist = useCallback(
    (next: SessionKeyRecord[]) => {
      setRecords(next);
      window.localStorage.setItem(storageKey(network, account), JSON.stringify(next));
    },
    [network, account],
  );

  const registry = useMemo(() => getChain(network).contracts.sessionKeyRegistry, [network]);

  const contracts = useMemo(
    () =>
      records.flatMap((record) =>
        record.scopes.map((scopeId) => ({
          address: registry.address as Hex,
          abi: registry.abi,
          functionName: "authorizationExpiry" as const,
          args: [account, record.sessionKeyPublic, SCOPE_BY_ID[scopeId].typehash] as const,
        })),
      ),
    [records, registry, account],
  );

  const { data: reads, refetch: refetchStatuses } = useReadContracts({
    contracts,
    query: { enabled: records.length > 0, refetchInterval: 30_000 },
  });

  const keys: SessionKeyWithStatus[] = useMemo(() => {
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    let cursor = 0;
    return records.map((record) => {
      const scopeExpiries: Partial<Record<ScopeId, bigint>> = {};
      const scopeActive: Partial<Record<ScopeId, boolean>> = {};
      const expiries: bigint[] = [];
      let resolved = true;
      for (const scopeId of record.scopes) {
        const read = reads?.[cursor];
        cursor += 1;
        if (read?.status === "success" && typeof read.result === "bigint") {
          scopeExpiries[scopeId] = read.result;
          scopeActive[scopeId] = isScopeActive(read.result, nowSec);
          expiries.push(read.result);
        } else {
          resolved = false;
        }
      }
      const maxExpiry = expiries.reduce((max, e) => (e > max ? e : max), 0n);
      let status: SessionKeyWithStatus["status"] =
        resolved && expiries.length > 0 ? deriveKeyStatus(expiries, nowSec) : "unknown";
      // A just-created key reads all-zero until its login tx confirms (~1 epoch).
      if (status === "revoked" && Date.now() - record.createdAt < 3 * 60_000) status = "unknown";
      return { ...record, status, scopeExpiries, scopeActive, maxExpiry };
    });
  }, [records, reads]);

  /**
   * Adds a key, or merges into the existing record for the same address:
   * re-authorizing (add-scopes flow) must union scopes and keep the original
   * creation time, or the record under-reports what the key actually holds.
   */
  const addKey = useCallback(
    (record: SessionKeyRecord) => {
      const existing = records.find((r) => r.sessionKeyPublic.toLowerCase() === record.sessionKeyPublic.toLowerCase());
      const merged = existing
        ? {
            ...existing,
            ...record,
            scopes: [...new Set([...existing.scopes, ...record.scopes])],
            createdAt: existing.createdAt || record.createdAt,
            name: existing.name || record.name,
          }
        : record;
      persist([
        merged,
        ...records.filter((r) => r.sessionKeyPublic.toLowerCase() !== record.sessionKeyPublic.toLowerCase()),
      ]);
    },
    [records, persist],
  );

  /** Removes a key from the local inventory (used when a login tx fails after optimistic add). */
  const removeKey = useCallback(
    (sessionKeyPublic: Hex) => {
      persist(records.filter((r) => r.sessionKeyPublic.toLowerCase() !== sessionKeyPublic.toLowerCase()));
    },
    [records, persist],
  );

  /**
   * Imports session-key history from the registry's onchain event log. Only
   * ever adds signers this browser doesn't already know about — an existing
   * local record always wins over the synced version of the same address.
   */
  const syncFromChain = useCallback(async (): Promise<SyncFromChainResult> => {
    const events = await fetchAuthorizationEvents(network, registry, account);
    const { records: synced, skippedUnrecognized } = foldAuthorizationEvents(events, SESSION_KEY_SCOPES);
    const { merged, addedCount, updatedCount } = mergeSyncedRecords(records, synced);
    if (addedCount > 0 || updatedCount > 0) {
      persist(merged);
      refetchStatuses();
    }
    return { addedCount, updatedCount, skippedUnrecognized };
  }, [network, account, registry, records, persist, refetchStatuses]);

  return {
    keys,
    addKey,
    removeKey,
    syncFromChain,
    refetchStatuses,
    registry,
  };
}
