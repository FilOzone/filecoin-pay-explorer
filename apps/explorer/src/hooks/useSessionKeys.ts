"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import { useReadContracts } from "wagmi";
import { getChain } from "@/constants/chains";
import type { Network } from "@/types";
import {
  deriveKeyStatus,
  isScopeActive,
  parseInventoryFile,
  SCOPE_BY_ID,
  type ScopeId,
  type SessionKeyRecord,
  type SessionKeyStatus,
  scanChainForSessionKeys,
  serializeInventory,
} from "@/utils/sessionKeys";

export interface SessionKeyWithStatus extends SessionKeyRecord {
  /** "unknown" until the first chain read resolves. */
  status: SessionKeyStatus | "unknown";
  scopeExpiries: Partial<Record<ScopeId, bigint>>;
  /** Latest expiry across granted scopes (0n if revoked/never). */
  maxExpiry: bigint;
  scopeActive: Partial<Record<ScopeId, boolean>>;
}

const storageKey = (network: Network, account: Hex) => `fp-session-keys:${network}:${account.toLowerCase()}`;

function loadRecords(network: Network, account: Hex): SessionKeyRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(network, account));
    return raw ? (JSON.parse(raw) as SessionKeyRecord[]) : [];
  } catch {
    return [];
  }
}

/**
 * Local inventory of session keys: the list is local (created here +
 * imported files + chain scans), but status is ALWAYS read live from
 * SessionKeyRegistry.authorizationExpiry so Active/Expired/Revoked never lies.
 * File-imported keys whose scopes all read 0 show "notFound" instead of
 * "revoked" — the console has no history proving they ever existed.
 */
export function useSessionKeys(network: Network, account: Hex) {
  const [records, setRecords] = useState<SessionKeyRecord[]>(() => loadRecords(network, account));
  const [isScanning, setIsScanning] = useState(false);

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
      if (status === "revoked") {
        // A file-imported key with all-zero reads is indistinguishable from
        // never-granted -> "notFound". Chain-imported keys keep "revoked":
        // their event history proves they existed.
        if (record.source === "file") status = "notFound";
        // A just-created key reads all-zero until its login tx confirms (~1 epoch).
        else if (record.source === "created" && Date.now() - record.createdAt < 3 * 60_000) status = "unknown";
      }
      return { ...record, status, scopeExpiries, scopeActive, maxExpiry };
    });
  }, [records, reads]);

  const addKey = useCallback(
    (record: SessionKeyRecord) => {
      persist([
        record,
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

  const exportInventory = useCallback(() => serializeInventory(network, account, records), [network, account, records]);

  const mergeRecords = useCallback(
    (incoming: SessionKeyRecord[]) => {
      const known = new Set(records.map((r) => r.sessionKeyPublic.toLowerCase()));
      const fresh = incoming.filter((r) => !known.has(r.sessionKeyPublic.toLowerCase()));
      if (fresh.length > 0) persist([...fresh, ...records]);
      return fresh.length;
    },
    [records, persist],
  );

  /** Merges an inventory file; returns the number of newly added keys. Throws with a user-facing message on invalid files. */
  const importInventory = useCallback(
    (json: string) => mergeRecords(parseInventoryFile(json, { network, accountAddress: account })),
    [network, account, mergeRecords],
  );

  /** Scans AuthorizationsUpdated history (Filfox RPC); returns the number of newly discovered keys. */
  const importFromChain = useCallback(async () => {
    setIsScanning(true);
    try {
      return mergeRecords(await scanChainForSessionKeys(network, registry.address as Hex, account));
    } finally {
      setIsScanning(false);
    }
  }, [network, registry, account, mergeRecords]);

  return {
    keys,
    addKey,
    removeKey,
    exportInventory,
    importInventory,
    importFromChain,
    isScanning,
    refetchStatuses,
    registry,
  };
}
