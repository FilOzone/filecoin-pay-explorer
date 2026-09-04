/**
 * Pure fold/merge logic for importing session-key history from the
 * SessionKeyRegistry's `AuthorizationsUpdated` events. The fetch + decode
 * client lives in `utils/sessionKeyChain.ts`; this module stays free of `@/`
 * imports and side effects so its logic stays unit-testable in isolation.
 */

import { normalizeKeyName, type ScopeId, type SessionKeyRecord } from "./sessionKeys";

/**
 * One decoded `AuthorizationsUpdated` log, already scoped to a single
 * wallet's identity (the caller is responsible for that filtering — see
 * the client-side re-check in `sessionKeyChain.ts`).
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
 * - `name` is the latest NON-EMPTY origin across logins: re-authorizations
 *   (add-scopes flow, remediation links) often carry an empty origin, and an
 *   empty string must never erase the name the key was created with.
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
    const latestRevoke = revokes.length > 0 ? revokes[revokes.length - 1] : undefined;
    const latestNamedGrant = [...grants].reverse().find((grant) => grant.origin !== "");

    records.push({
      // Origin is written by whoever made the grant, so it gets the same cleanup as typed names.
      name: normalizeKeyName(latestNamedGrant?.origin ?? ""),
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
  /** Existing records whose empty name, scope list, or revoke time the chain filled in. */
  updatedCount: number;
}

/**
 * Merges synced records into the local inventory, deduped by session-key
 * address (case-insensitive). Local records win for everything they know —
 * name, createdAt — but the chain fills what they lack: an empty name is
 * healed and scopes are unioned, since a local record only witnessed the
 * grants made in this browser and re-authorization means it can
 * under-report what the key actually holds.
 */
export function mergeSyncedRecords(local: SessionKeyRecord[], synced: SyncedSessionKeyRecord[]): MergeResult {
  const syncedByAddress: Record<string, SyncedSessionKeyRecord> = Object.fromEntries(
    synced.map((record) => [record.sessionKeyPublic.toLowerCase(), record]),
  );
  let updatedCount = 0;
  const healed = local.map((record) => {
    const fromChain = syncedByAddress[record.sessionKeyPublic.toLowerCase()];
    if (!fromChain) return record;
    const scopes = [...new Set([...record.scopes, ...fromChain.scopes])];
    const name = record.name || fromChain.name;
    const revokedAt = record.revokedAt ?? fromChain.revokedAt;
    if (scopes.length === record.scopes.length && name === record.name && revokedAt === record.revokedAt) {
      return record;
    }
    updatedCount += 1;
    return { ...record, name, scopes, ...(revokedAt !== undefined ? { revokedAt } : {}) };
  });

  const localAddresses = new Set(local.map((record) => record.sessionKeyPublic.toLowerCase()));
  // fold yields one record per signer, so synced needs no dedupe of its own.
  const toAdd = synced.filter((record) => !localAddresses.has(record.sessionKeyPublic.toLowerCase()));

  return { merged: [...healed, ...toAdd], addedCount: toAdd.length, updatedCount };
}
