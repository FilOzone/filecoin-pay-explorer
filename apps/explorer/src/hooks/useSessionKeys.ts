"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import { useReadContracts } from "wagmi";
import { getChain } from "@/constants/chains";
import type { Network } from "@/types";
import { deriveSessionKeys, SCOPE_BY_ID, type SessionKeyRecord, sanitizeRecords } from "@/utils/sessionKeys";

export type { SessionKeyWithStatus } from "@/utils/sessionKeys";

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

  // Updater form so a callback captured by an in-flight transaction never
  // writes a record list older than the one on screen.
  const persist = useCallback(
    (update: (prev: SessionKeyRecord[]) => SessionKeyRecord[]) => {
      setRecords((prev) => {
        const next = update(prev);
        window.localStorage.setItem(storageKey(network, account), JSON.stringify(next));
        return next;
      });
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

  // Ticks with the poll so a key that expires while the page is open flips to
  // "expired" even when the chain reads come back unchanged.
  const [nowSec, setNowSec] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => {
    const id = window.setInterval(() => setNowSec(BigInt(Math.floor(Date.now() / 1000))), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const keys = useMemo(() => deriveSessionKeys(records, reads, nowSec, Date.now()), [records, reads, nowSec]);

  // A signer the list already knows keeps its earlier scopes: whole-key revoke
  // sends every scope in the record, so the record must hold all of them.
  const addKey = useCallback(
    (record: SessionKeyRecord) => {
      persist((prev) => {
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
    (sessionKeyPublic: Hex) => {
      persist((prev) => prev.filter((r) => r.sessionKeyPublic.toLowerCase() !== sessionKeyPublic.toLowerCase()));
    },
    [persist],
  );

  return {
    keys,
    addKey,
    removeKey,
    refetchStatuses,
    registry,
  };
}
