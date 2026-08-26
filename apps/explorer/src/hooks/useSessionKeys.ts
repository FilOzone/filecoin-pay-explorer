"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Hex } from "viem";
import { useReadContracts } from "wagmi";
import { getChain } from "@/constants/chains";
import type { Network } from "@/types";
import { fetchAuthorizationEvents } from "@/utils/sessionKeyChain";
import { foldAuthorizationEvents, mergeSyncedRecords } from "@/utils/sessionKeySync";
import {
  deriveSessionKeys,
  isSameIdentity,
  SCOPE_BY_ID,
  SESSION_KEY_SCOPES,
  type SessionKeyRecord,
  sanitizeRecords,
} from "@/utils/sessionKeys";

export type { SessionKeyWithStatus } from "@/utils/sessionKeys";

export interface SyncFromChainResult {
  addedCount: number;
  /** Existing records healed from chain history */
  updatedCount: number;
  skippedUnrecognized: number;
}

const storageKey = (network: Network, account: Hex) => `fp-session-keys:${network}:${account.toLowerCase()}`;

/** The wallet and network a session key inventory belongs to. */
export interface SessionKeysIdentity {
  network: Network;
  account: Hex;
}

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
  const identityRef = useRef<SessionKeysIdentity>({ network, account });
  // Signers whose login receipt was seen, or that have read as active: for
  // them an all-zero read is a real revoke, not a login still confirming.
  const confirmedRef = useRef(new Set<string>());

  // Reload when wallet or network changes.
  useEffect(() => {
    identityRef.current = { network, account };
    setRecords(loadRecords(network, account));
    // Confirmations belong to one inventory: the same signer under another wallet is a different grant.
    confirmedRef.current = new Set();
  }, [network, account]);

  // Writes name the identity that submitted: after a wallet switch mid-login,
  // an off-screen identity is updated in storage only. Updater form so a late
  // callback never writes a list older than the one on screen.
  const persist = useCallback(
    (identity: SessionKeysIdentity, update: (prev: SessionKeyRecord[]) => SessionKeyRecord[]) => {
      setRecords((current) => {
        const onScreen = isSameIdentity(identityRef.current, identity);
        const next = update(onScreen ? current : loadRecords(identity.network, identity.account));
        window.localStorage.setItem(storageKey(identity.network, identity.account), JSON.stringify(next));
        return onScreen ? next : current;
      });
    },
    [],
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

  // Ticks with the poll so a key that expires while the page is open flips to
  // "expired" even when the chain reads come back unchanged.
  const [nowSec, setNowSec] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => {
    const id = window.setInterval(() => setNowSec(BigInt(Math.floor(Date.now() / 1000))), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const keys = useMemo(
    () => deriveSessionKeys(records, reads, nowSec, Date.now(), confirmedRef.current),
    [records, reads, nowSec],
  );
  useEffect(() => {
    for (const key of keys) if (key.status === "active") confirmedRef.current.add(key.sessionKeyPublic.toLowerCase());
  }, [keys]);

  /** Called with the signer when its login receipt lands; lifts the fresh-key grace and re-reads. */
  const markConfirmed = useCallback(
    (sessionKeyPublic: Hex) => {
      confirmedRef.current.add(sessionKeyPublic.toLowerCase());
      refetchStatuses();
    },
    [refetchStatuses],
  );

  // A signer the list already knows keeps its earlier scopes: whole-key revoke
  // sends every scope in the record, so the record must hold all of them.
  const addKey = useCallback(
    (record: SessionKeyRecord, identity: SessionKeysIdentity) => {
      persist(identity, (prev) => {
        const same = (r: SessionKeyRecord) =>
          r.sessionKeyPublic.toLowerCase() === record.sessionKeyPublic.toLowerCase();
        const existing = prev.find(same);
        const merged = existing
          ? {
              ...existing,
              ...record,
              scopes: [...new Set([...existing.scopes, ...record.scopes])],
              createdAt: existing.createdAt || record.createdAt,
              name: existing.name || record.name,
            }
          : record;
        return [merged, ...prev.filter((r) => !same(r))];
      });
    },
    [persist],
  );

  /** Removes a key from the local inventory (used when a login tx fails after optimistic add). */
  const removeKey = useCallback(
    (sessionKeyPublic: Hex, identity: SessionKeysIdentity) => {
      persist(identity, (prev) =>
        prev.filter((r) => r.sessionKeyPublic.toLowerCase() !== sessionKeyPublic.toLowerCase()),
      );
    },
    [persist],
  );

  /**
   * Imports session-key history from the registry's onchain event log. Only
   * ever adds signers this browser doesn't already know about — an existing
   * local record always wins over the synced version of the same address.
   */
  const syncFromChain = useCallback(async (): Promise<SyncFromChainResult> => {
    // Captured before the fetch: the events belong to this wallet even if it switches meanwhile.
    const identity: SessionKeysIdentity = { network, account };
    const events = await fetchAuthorizationEvents(network, registry, account);
    const { records: synced, skippedUnrecognized } = foldAuthorizationEvents(events, SESSION_KEY_SCOPES);
    const { addedCount, updatedCount } = mergeSyncedRecords(records, synced);
    if (addedCount > 0 || updatedCount > 0) {
      persist(identity, (prev) => mergeSyncedRecords(prev, synced).merged);
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
    markConfirmed,
    registry,
  };
}
