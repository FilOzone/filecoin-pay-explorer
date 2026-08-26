/**
 * Pure fold/merge logic for importing session-key history from the
 * SessionKeyRegistry's `AuthorizationsUpdated` events. The fetch + decode
 * client lives in `hooks/useSessionKeys.ts`; this module stays free of `@/`
 * imports and side effects so its logic stays unit-testable in isolation.
 */

import type { ScopeId, SessionKeyRecord } from "./sessionKeys";

/**
 * One decoded `AuthorizationsUpdated` log, already scoped to a single
 * wallet's identity (the caller is responsible for that filtering — see
 * the client-side re-check in `useSessionKeys.ts`).
 */
export interface DecodedAuthorizationEvent {
  /** The session key address the login/revoke applies to. */
  signer: string;
  /** 0n means every permission below was revoked, not granted. */
  expiry: bigint;
  /** Permission typehashes granted or revoked by this event. */
  permissions: string[];
  origin: string;
  /** Unix seconds. */
  timestamp: number;
  blockNumber: bigint;
  logIndex: number;
}

export interface SyncedSessionKeyRecord extends SessionKeyRecord {
  source: "chain";
}

export interface FoldResult {
  records: SyncedSessionKeyRecord[];
  /** Signers whose grants never included a recognized FWSS scope. */
  skippedUnrecognized: number;
}

/** Chain order: earlier block first, then earlier log index within a block. */
function compareEvents(a: DecodedAuthorizationEvent, b: DecodedAuthorizationEvent): number {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
  return a.logIndex - b.logIndex;
}

/**
 * Folds every `AuthorizationsUpdated` event ever emitted for one wallet's
 * identity into one inventory row per signer (session key address).
 *
 * - `name` is the origin string of the latest login (an event with `expiry > 0`).
 * - `scopes` is the union of every recognized scope ever granted, across all logins.
 * - `createdAt` is the timestamp of the first grant.
 * - `revokedAt` is the timestamp of the latest revoke (`expiry === 0`), if one exists.
 *
 * A signer whose grants never contain a scope this app recognizes is dropped
 * rather than imported with an empty scope list, and counted separately so
 * the caller can report it.
 */
export function foldAuthorizationEvents(
  events: DecodedAuthorizationEvent[],
  recognizedScopes: { id: ScopeId; typehash: string }[],
): FoldResult {
  const typehashToScopeId: Record<string, ScopeId> = Object.fromEntries(
    recognizedScopes.map((scope) => [scope.typehash.toLowerCase(), scope.id]),
  );
  const bySigner = new Map<string, DecodedAuthorizationEvent[]>();
  for (const event of events) {
    const key = event.signer.toLowerCase();
    const existing = bySigner.get(key);
    if (existing) existing.push(event);
    else bySigner.set(key, [event]);
  }

  const records: SyncedSessionKeyRecord[] = [];
  let skippedUnrecognized = 0;

  for (const [, signerEvents] of bySigner) {
    // One chain-order sort; filtering preserves it for both partitions.
    signerEvents.sort(compareEvents);
    const grants = signerEvents.filter((event) => event.expiry !== 0n);
    const revokes = signerEvents.filter((event) => event.expiry === 0n);
    if (grants.length === 0) continue;

    const scopes = new Set<ScopeId>();
    for (const grant of grants) {
      for (const typehash of grant.permissions) {
        const scopeId = typehashToScopeId[typehash.toLowerCase()];
        if (scopeId) scopes.add(scopeId);
      }
    }

    if (scopes.size === 0) {
      skippedUnrecognized += 1;
      continue;
    }

    const firstGrant = grants[0];
    const latestGrant = grants[grants.length - 1];
    const latestRevoke = revokes.length > 0 ? revokes[revokes.length - 1] : undefined;

    records.push({
      name: latestGrant.origin,
      sessionKeyPublic: firstGrant.signer as `0x${string}`,
      scopes: [...scopes],
      createdAt: firstGrant.timestamp * 1000,
      source: "chain",
      ...(latestRevoke ? { revokedAt: latestRevoke.timestamp * 1000 } : {}),
    });
  }

  return { records, skippedUnrecognized };
}

export interface MergeResult {
  merged: SessionKeyRecord[];
  addedCount: number;
}

/**
 * Merges synced records into the local inventory. Dedupes by session-key
 * address, case-insensitively; a local record always wins in full — sync
 * only ever adds signers the browser's local inventory doesn't already have.
 */
export function mergeSyncedRecords(local: SessionKeyRecord[], synced: SyncedSessionKeyRecord[]): MergeResult {
  const localAddresses = new Set(local.map((record) => record.sessionKeyPublic.toLowerCase()));
  // fold yields one record per signer, so synced needs no dedupe of its own.
  const toAdd = synced.filter((record) => !localAddresses.has(record.sessionKeyPublic.toLowerCase()));

  return { merged: [...local, ...toAdd], addedCount: toAdd.length };
}
