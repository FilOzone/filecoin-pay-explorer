import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { type DecodedAuthorizationEvent, foldAuthorizationEvents, mergeSyncedRecords } from "./sessionKeySync";
import { type ScopeId, SESSION_KEY_SCOPES } from "./sessionKeys";

const CREATE_TYPEHASH = SESSION_KEY_SCOPES[0].typehash;
const ADD_TYPEHASH = SESSION_KEY_SCOPES[1].typehash;
const REMOVE_TYPEHASH = SESSION_KEY_SCOPES[2].typehash;
const UNKNOWN_TYPEHASH = `0x${"ab".repeat(32)}` as const;

const SIGNER_A = "0x8ba1f109551bD432803012645Ac136ddd64DBA72";
const SIGNER_B = "0x000000000000000000000000000000000000b2";

function fold(events: DecodedAuthorizationEvent[]) {
  return foldAuthorizationEvents(events, SESSION_KEY_SCOPES);
}

function event(overrides: Partial<DecodedAuthorizationEvent>): DecodedAuthorizationEvent {
  return {
    signer: SIGNER_A,
    expiry: 1_000n,
    permissions: [CREATE_TYPEHASH],
    origin: "test-app",
    timestamp: 1_000,
    blockNumber: 1n,
    logIndex: 0,
    ...overrides,
  };
}

describe("foldAuthorizationEvents", () => {
  it("names the key after the latest login's origin, not the first", () => {
    const events = [
      event({ origin: "first-app", timestamp: 100, blockNumber: 1n }),
      event({ origin: "second-app", timestamp: 200, blockNumber: 2n }),
    ];
    const { records } = fold(events);
    assert.equal(records.length, 1);
    assert.equal(records[0].name, "second-app");
  });

  it("unions scopes granted across every login, not just the latest", () => {
    const events = [
      event({ permissions: [CREATE_TYPEHASH], blockNumber: 1n, timestamp: 100 }),
      event({ permissions: [ADD_TYPEHASH, REMOVE_TYPEHASH], blockNumber: 2n, timestamp: 200 }),
    ];
    const { records } = fold(events);
    assert.equal(records.length, 1);
    assert.deepEqual(new Set(records[0].scopes), new Set(["createDataSet", "addPieces", "schedulePieceRemovals"]));
  });

  it("folds a revoke into revokedAt and keeps the scopes from the grants", () => {
    const events = [
      event({ expiry: 1_000n, permissions: [CREATE_TYPEHASH], blockNumber: 1n, timestamp: 100 }),
      event({ expiry: 0n, permissions: [CREATE_TYPEHASH], blockNumber: 2n, timestamp: 300 }),
    ];
    const { records } = fold(events);
    assert.equal(records.length, 1);
    assert.equal(records[0].revokedAt, 300 * 1000);
    assert.deepEqual(records[0].scopes, ["createDataSet"]);
  });

  it("takes the createdAt from the first grant, ignoring a later revoke's timing", () => {
    const events = [
      event({ expiry: 1_000n, blockNumber: 1n, timestamp: 50 }),
      event({ expiry: 0n, blockNumber: 2n, timestamp: 999 }),
    ];
    const { records } = fold(events);
    assert.equal(records[0].createdAt, 50 * 1000);
  });

  it("omits revokedAt entirely when the signer was never revoked", () => {
    const { records } = fold([event({})]);
    assert.equal("revokedAt" in records[0], false);
  });

  it("skips and counts a signer whose grants never contain a recognized scope", () => {
    const events = [
      event({ signer: SIGNER_A, permissions: [CREATE_TYPEHASH] }),
      event({ signer: SIGNER_B, permissions: [UNKNOWN_TYPEHASH] }),
    ];
    const { records, skippedUnrecognized } = fold(events);
    assert.equal(records.length, 1);
    assert.equal(records[0].sessionKeyPublic, SIGNER_A);
    assert.equal(skippedUnrecognized, 1);
  });

  it("ignores a revoke-only signer with no grant at all", () => {
    const { records, skippedUnrecognized } = fold([event({ expiry: 0n })]);
    assert.equal(records.length, 0);
    assert.equal(skippedUnrecognized, 0);
  });

  it("marks every folded record with source: chain", () => {
    const { records } = fold([event({})]);
    assert.equal(records[0].source, "chain");
  });
});

describe("mergeSyncedRecords", () => {
  const synced = (overrides: Record<string, unknown> = {}) => ({
    name: "chain-app",
    sessionKeyPublic: SIGNER_A as `0x${string}`,
    scopes: ["createDataSet"] as ScopeId[],
    createdAt: 100,
    source: "chain" as const,
    ...overrides,
  });

  it("adds a synced signer the local inventory doesn't have", () => {
    const { merged, addedCount } = mergeSyncedRecords([], [synced()]);
    assert.equal(addedCount, 1);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].source, "chain");
  });

  it("dedupes case-insensitively and lets the local record win entirely", () => {
    const local = [
      {
        name: "my-local-name",
        sessionKeyPublic: SIGNER_A.toUpperCase() as `0x${string}`,
        scopes: ["terminateService"] as ScopeId[],
        createdAt: 1,
      },
    ];
    const { merged, addedCount } = mergeSyncedRecords(local, [synced({ name: "chain-name" })]);
    assert.equal(addedCount, 0);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].name, "my-local-name");
    assert.equal(merged[0].source, undefined);
  });

  it("reports 0 added when everything is already up to date", () => {
    const local = [synced()];
    const { addedCount } = mergeSyncedRecords(local, [synced()]);
    assert.equal(addedCount, 0);
  });
});

describe("re-authorization consequences (PR3)", () => {
  const grant = (signer: string, origin: string, ts: number, permissions: string[] = [ADD_TYPEHASH]) => ({
    signer,
    expiry: 100n,
    permissions,
    origin,
    timestamp: ts,
    blockNumber: BigInt(ts),
    logIndex: 0,
  });

  it("fold keeps the created name when a later re-auth carries an empty origin", () => {
    const { records } = foldAuthorizationEvents(
      [grant("0xAA", "ci-uploader", 100), grant("0xAA", "", 200)],
      SESSION_KEY_SCOPES,
    );
    assert.equal(records[0]?.name, "ci-uploader");
  });

  it("fold still honors a deliberate later rename", () => {
    const { records } = foldAuthorizationEvents(
      [grant("0xAA", "old", 100), grant("0xAA", "new", 200)],
      SESSION_KEY_SCOPES,
    );
    assert.equal(records[0]?.name, "new");
  });

  it("merge heals an empty local name and unions scopes from chain", () => {
    const local = [
      { name: "", sessionKeyPublic: "0xAA" as const, scopes: ["schedulePieceRemovals" as const], createdAt: 5 },
    ];
    const synced = [
      {
        name: "ci-uploader",
        sessionKeyPublic: "0xAA" as const,
        scopes: ["createDataSet" as const, "addPieces" as const],
        createdAt: 1,
        source: "chain" as const,
      },
    ];
    const { merged, addedCount, updatedCount } = mergeSyncedRecords(local, synced);
    assert.equal(addedCount, 0);
    assert.equal(updatedCount, 1);
    assert.equal(merged[0]?.name, "ci-uploader");
    assert.deepEqual(merged[0]?.scopes.sort(), ["addPieces", "createDataSet", "schedulePieceRemovals"]);
    assert.equal(merged[0]?.createdAt, 5);
  });

  it("merge leaves complete local records untouched and reports zero updates", () => {
    const local = [{ name: "kept", sessionKeyPublic: "0xAA" as const, scopes: ["addPieces" as const], createdAt: 5 }];
    const synced = [
      {
        name: "chain",
        sessionKeyPublic: "0xAA" as const,
        scopes: ["addPieces" as const],
        createdAt: 1,
        source: "chain" as const,
      },
    ];
    const { merged, updatedCount } = mergeSyncedRecords(local, synced);
    assert.equal(updatedCount, 0);
    assert.equal(merged[0]?.name, "kept");
  });
});
