import assert from "node:assert/strict";
import { keccak256, toBytes } from "viem";
import { describe, it } from "vitest";
import {
  buildEnvSnippet,
  buildLoginArgs,
  buildRevokeArgs,
  deriveKeyStatus,
  deriveSessionKeys,
  EXPIRY_PRESETS,
  existingKeyPrefill,
  hasUniformExpiry,
  isScopeActive,
  normalizeKeyName,
  pickRevokeTarget,
  resolveExpiry,
  type ScopeId,
  SESSION_KEY_SCOPES,
  sanitizeRecords,
} from "./sessionKeys";

const CREATE_PREIMAGE =
  "CreateDataSet(uint256 clientDataSetId,address payee,MetadataEntry[] metadata)MetadataEntry(string key,string value)";
const ADD_PREIMAGE =
  "AddPieces(uint256 clientDataSetId,uint256 nonce,Cid[] pieceData,PieceMetadata[] pieceMetadata)" +
  "Cid(bytes data)" +
  "MetadataEntry(string key,string value)" +
  "PieceMetadata(uint256 pieceIndex,MetadataEntry[] metadata)";
const REMOVE_PREIMAGE = "SchedulePieceRemovals(uint256 clientDataSetId,uint256[] pieceIds)";
const TERMINATE_PREIMAGE = "TerminateService(uint256 dataSetId)";

const SIGNER = "0x8ba1f109551bD432803012645Ac136ddd64DBA72" as const;
const ACCOUNT = "0xF39FD6e51aad88F6F4ce6aB8827279cffFb92266" as const;

describe("scopes", () => {
  it("has exactly the four FWSS scopes, upload scopes first", () => {
    assert.deepEqual(
      SESSION_KEY_SCOPES.map((s) => s.id),
      ["createDataSet", "addPieces", "schedulePieceRemovals", "terminateService"],
    );
  });

  it("typehashes match keccak256 of the FWSS SignatureVerificationLib preimages", () => {
    const byId = Object.fromEntries(SESSION_KEY_SCOPES.map((s) => [s.id, s.typehash]));
    assert.equal(byId.createDataSet, keccak256(toBytes(CREATE_PREIMAGE)));
    assert.equal(byId.addPieces, keccak256(toBytes(ADD_PREIMAGE)));
    assert.equal(byId.schedulePieceRemovals, keccak256(toBytes(REMOVE_PREIMAGE)));
    assert.equal(byId.terminateService, keccak256(toBytes(TERMINATE_PREIMAGE)));
  });

  it("flags exactly the destructive scopes", () => {
    assert.deepEqual(
      SESSION_KEY_SCOPES.filter((s) => s.destructive).map((s) => s.id),
      ["schedulePieceRemovals", "terminateService"],
    );
  });
});

describe("deriveKeyStatus", () => {
  const now = 1_000_000n;
  it("any future scope expiry means active", () => {
    assert.equal(deriveKeyStatus([now + 10n, 0n], now), "active");
    assert.equal(deriveKeyStatus([now + 10n, now - 10n], now), "active");
  });
  it("all zero means revoked", () => {
    assert.equal(deriveKeyStatus([0n, 0n], now), "revoked");
  });
  it("no future and at least one nonzero past means expired", () => {
    assert.equal(deriveKeyStatus([now - 1n, 0n], now), "expired");
    assert.equal(deriveKeyStatus([now - 1n, now - 2n], now), "expired");
  });
  it("expiry equal to now counts as active (contract check is >= block.timestamp)", () => {
    assert.equal(deriveKeyStatus([now], now), "active");
    assert.equal(isScopeActive(now, now), true);
    assert.equal(isScopeActive(now - 1n, now), false);
  });
});

describe("hasUniformExpiry", () => {
  it("true when every granted scope shares one expiry", () => {
    assert.equal(hasUniformExpiry(["createDataSet", "addPieces"], { createDataSet: 100n, addPieces: 100n }), true);
  });
  it("false once granted scopes carry different expiries", () => {
    assert.equal(hasUniformExpiry(["createDataSet", "addPieces"], { createDataSet: 100n, addPieces: 200n }), false);
  });
  it("missing expiry is treated as 0n, so it diverges from any nonzero peer", () => {
    assert.equal(hasUniformExpiry(["createDataSet", "addPieces"], { createDataSet: 100n }), false);
  });
  it("a single scope and all-zero (revoked) scopes are uniform", () => {
    assert.equal(hasUniformExpiry(["createDataSet"], { createDataSet: 100n }), true);
    assert.equal(hasUniformExpiry(["createDataSet", "addPieces"], { createDataSet: 0n, addPieces: 0n }), true);
  });
});

describe("expiry presets", () => {
  it("offers 7, 30, 90 days and no 'never' option", () => {
    assert.deepEqual(
      EXPIRY_PRESETS.map((p) => p.seconds),
      [7 * 86400, 30 * 86400, 90 * 86400],
    );
    assert.ok(EXPIRY_PRESETS.every((p) => p.seconds > 0));
  });
});

describe("env snippet", () => {
  it("emits the SESSION_KEY and WALLET_ADDRESS dotenv lines filecoin-pin reads, plus a session-address comment", () => {
    const pk = `0x${"ab".repeat(32)}`;
    const snippet = buildEnvSnippet(pk, SIGNER, ACCOUNT);
    assert.match(snippet, new RegExp(`^SESSION_KEY=${pk}$`, "m"));
    assert.match(snippet, new RegExp(`^WALLET_ADDRESS=${ACCOUNT}$`, "m"));
    assert.match(snippet, new RegExp(`^# session address: ${SIGNER}$`, "m"));
    // old names gone — filecoin-pin's reader only understands the new ones
    assert.doesNotMatch(snippet, /SESSION_KEY_PRIVATE|SESSION_KEY_ADDRESS|ACCOUNT_WALLET_ADDRESS/);
    assert.doesNotMatch(snippet, /Synapse SDK/);
    // every non-comment line is KEY=VALUE so the CLI parser never throws
    for (const line of snippet.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;
      assert.match(trimmed, /^[A-Z_]+=\S+$/);
    }
  });
});

describe("call encoding", () => {
  const CREATE = "0x25ebf20299107c91b4624d5bac3a16d32cabf0db23b450ee09ab7732983b1dc9";
  const ADD = "0x954bdc254591a7eab1b73f03842464d9283a08352772737094d710a4428fd183";
  const TERMINATE = "0x522bd88a11de1cdc6574394dde7a21ae488ff13e16e7408d0ea721dd8479dffc";

  it("login is (signer, expiry, typehashes in scope order, name)", () => {
    assert.deepEqual(buildLoginArgs(SIGNER, 1_700_000_000n, ["createDataSet", "addPieces"], "ci"), [
      SIGNER,
      1_700_000_000n,
      [CREATE, ADD],
      "ci",
    ]);
    assert.deepEqual(buildLoginArgs(SIGNER, 1n, ["addPieces", "createDataSet"], "")[2], [ADD, CREATE]);
  });

  it("revoke is (signer, typehashes, name) with no expiry", () => {
    assert.deepEqual(buildRevokeArgs(SIGNER, ["terminateService"], "ci"), [SIGNER, [TERMINATE], "ci"]);
  });
});

describe("pickRevokeTarget", () => {
  const chosen = { target: "key-a", identity: { network: "calibration", account: ACCOUNT } };

  it("offers the target while the same wallet and network are connected, case-insensitively", () => {
    assert.equal(pickRevokeTarget(chosen, { network: "calibration", account: ACCOUNT }), "key-a");
    assert.equal(
      pickRevokeTarget(chosen, { network: "calibration", account: ACCOUNT.toLowerCase() as `0x${string}` }),
      "key-a",
    );
  });

  it("drops the target after a wallet or network switch, and with nothing chosen", () => {
    assert.equal(pickRevokeTarget(chosen, { network: "calibration", account: SIGNER }), null);
    assert.equal(pickRevokeTarget(chosen, { network: "mainnet", account: ACCOUNT }), null);
    assert.equal(pickRevokeTarget(null, { network: "calibration", account: ACCOUNT }), null);
  });
});

describe("sanitizeRecords", () => {
  const good = { name: "ci", sessionKeyPublic: SIGNER, scopes: ["addPieces"], createdAt: 1 };

  it("passes well-formed records through unchanged", () => {
    assert.deepEqual(sanitizeRecords([good]), [good]);
  });

  it("returns [] for non-array payloads", () => {
    assert.deepEqual(sanitizeRecords({ length: 1 }), []);
    assert.deepEqual(sanitizeRecords("[]"), []);
    assert.deepEqual(sanitizeRecords(null), []);
  });

  it("drops records with a malformed address or no scope array", () => {
    assert.deepEqual(sanitizeRecords([{ ...good, sessionKeyPublic: "0xnot-an-address" }]), []);
    // Mixed case with a wrong checksum: viem would throw on the read, so the record is rejected here.
    assert.deepEqual(sanitizeRecords([{ ...good, sessionKeyPublic: `${SIGNER.slice(0, -1)}a` }]), []);
    assert.equal(sanitizeRecords([{ ...good, sessionKeyPublic: SIGNER.toLowerCase() }]).length, 1);
    assert.deepEqual(sanitizeRecords([{ ...good, scopes: "addPieces" }]), []);
  });

  it("strips unknown scope ids and drops records left with none", () => {
    assert.deepEqual(sanitizeRecords([{ ...good, scopes: ["evil", "addPieces"] }])[0]?.scopes, ["addPieces"]);
    assert.deepEqual(sanitizeRecords([{ ...good, scopes: ["evil"] }]), []);
  });

  it("rejects inherited property names as scope ids", () => {
    // "constructor" in SCOPE_BY_ID is true via Object.prototype; an own-property check is required.
    assert.deepEqual(sanitizeRecords([{ ...good, scopes: ["constructor", "toString", "addPieces"] }])[0]?.scopes, [
      "addPieces",
    ]);
    assert.deepEqual(sanitizeRecords([{ ...good, scopes: ["constructor"] }]), []);
  });

  it("coerces missing name/createdAt instead of crashing", () => {
    const [rec] = sanitizeRecords([{ sessionKeyPublic: SIGNER, scopes: ["addPieces"] }]);
    assert.equal(rec?.name, "");
    assert.equal(rec?.createdAt, 0);
  });

  it("re-normalizes a stored name on read", () => {
    const [rec] = sanitizeRecords([{ ...good, name: "  ci\u202e.env " }]);
    assert.equal(rec?.name, "ci.env");
  });
});

describe("normalizeKeyName", () => {
  it("strips control and bidi-override characters", () => {
    assert.equal(normalizeKeyName("ci\u202Evne.yek"), "civne.yek");
    assert.equal(normalizeKeyName("a\u0000b\nc\u200F"), "abc");
  });

  it("trims and caps at 64 characters", () => {
    assert.equal(normalizeKeyName("  ci  "), "ci");
    assert.equal(normalizeKeyName("x".repeat(80)).length, 64);
  });
});

describe("resolveExpiry", () => {
  const nowMs = 1_700_000_000_123;
  const nowSec = 1_700_000_000n;

  it("adds the preset's days to now", () => {
    assert.equal(resolveExpiry("0", "", nowMs), nowSec + 7n * 86400n);
    assert.equal(resolveExpiry("1", "", nowMs), nowSec + 30n * 86400n);
    assert.equal(resolveExpiry("2", "", nowMs), nowSec + 90n * 86400n);
  });

  it("treats a custom date as the absolute end of that local day", () => {
    const endOfDay = BigInt(Math.floor(new Date("2100-01-02T23:59:59").getTime() / 1000));
    assert.equal(resolveExpiry("custom", "2100-01-02", nowMs), endOfDay);
  });

  it("rejects a custom date in the past, an empty custom date, and an unknown preset", () => {
    assert.equal(resolveExpiry("custom", "2000-01-01", nowMs), null);
    assert.equal(resolveExpiry("custom", "", nowMs), null);
    assert.equal(resolveExpiry("99", "", nowMs), null);
  });
});

describe("deriveSessionKeys", () => {
  const now = 1_000_000n;
  const nowMs = Number(now) * 1000;
  const ok = (result: bigint) => ({ status: "success" as const, result });
  const keyA = {
    name: "a",
    sessionKeyPublic: SIGNER,
    scopes: ["createDataSet", "addPieces"] as ScopeId[],
    createdAt: 1,
  };
  const keyB = { name: "b", sessionKeyPublic: ACCOUNT, scopes: ["terminateService"] as ScopeId[], createdAt: 1 };

  it("walks the flat read list in record and scope order", () => {
    const [a, b] = deriveSessionKeys([keyA, keyB], [ok(now + 10n), ok(0n), ok(now - 10n)], now, nowMs);
    assert.deepEqual(a.scopeExpiries, { createDataSet: now + 10n, addPieces: 0n });
    assert.deepEqual(a.scopeActive, { createDataSet: true, addPieces: false });
    assert.equal(a.status, "active");
    assert.equal(a.maxExpiry, now + 10n);
    assert.deepEqual(b.scopeExpiries, { terminateService: now - 10n });
    assert.equal(b.status, "expired");
  });

  it("is unknown until every scope has a successful read", () => {
    const [a] = deriveSessionKeys([keyA], [ok(now + 10n), { status: "failure" }], now, nowMs);
    assert.equal(a.status, "unknown");
    assert.equal(deriveSessionKeys([keyA], undefined, now, nowMs)[0].status, "unknown");
  });

  it("flips from active to expired when only the clock moves", () => {
    const reads = [ok(now + 10n), ok(now + 10n)];
    assert.equal(deriveSessionKeys([keyA], reads, now, nowMs)[0].status, "active");
    assert.equal(deriveSessionKeys([keyA], reads, now + 11n, nowMs)[0].status, "expired");
  });

  it("treats an all-zero read on a fresh key as unknown only until its login receipt is seen", () => {
    const fresh = { ...keyA, createdAt: nowMs - 60_000, txHash: "0xabc" };
    const zeros = [ok(0n), ok(0n)];
    assert.equal(deriveSessionKeys([fresh], zeros, now, nowMs)[0].status, "unknown");
    // Receipt seen: a zero read is a real revoke, even seconds after creation.
    assert.equal(deriveSessionKeys([fresh], zeros, now, nowMs, new Set([SIGNER.toLowerCase()]))[0].status, "revoked");
    // No login was sent from here (synced or imported record): nothing to wait for.
    assert.equal(deriveSessionKeys([{ ...fresh, txHash: undefined }], zeros, now, nowMs)[0].status, "revoked");
    // Old record: the grace has lapsed regardless.
    assert.equal(deriveSessionKeys([{ ...keyA, txHash: "0xabc" }], zeros, now, nowMs)[0].status, "revoked");
  });
});

describe("sanitizeRecords chain-sync fields", () => {
  it("preserves source and revokedAt from synced records", () => {
    const synced = {
      name: "imported",
      sessionKeyPublic: SIGNER,
      scopes: ["addPieces"],
      createdAt: 1,
      source: "chain",
      revokedAt: 2,
    };
    assert.deepEqual(sanitizeRecords([synced]), [synced]);
  });

  it("drops forged source/revokedAt values instead of trusting them", () => {
    const [rec] = sanitizeRecords([
      { name: "x", sessionKeyPublic: SIGNER, scopes: ["addPieces"], createdAt: 1, source: "evil", revokedAt: "soon" },
    ]);
    assert.equal("source" in rec, false);
    assert.equal("revokedAt" in rec, false);
  });
});

describe("existingKeyPrefill", () => {
  const base = { name: "ci", maxExpiry: 1_000n };

  it("re-authorizes an expired key: same name, no inherited expiry, so a new one is picked", () => {
    assert.deepEqual(existingKeyPrefill({ ...base, status: "expired" }), { name: "ci", expirySec: null });
  });

  it("keeps the expiry of an active key so added scopes line up with it", () => {
    assert.deepEqual(existingKeyPrefill({ ...base, status: "active" }), { name: "ci", expirySec: 1_000n });
  });

  it("inherits nothing from a revoked or unresolved key", () => {
    assert.deepEqual(existingKeyPrefill({ ...base, status: "revoked" }), { name: "ci", expirySec: null });
    assert.deepEqual(existingKeyPrefill({ ...base, status: "unknown" }), { name: "ci", expirySec: null });
  });

  it("returns null when the list does not know the signer", () => {
    assert.equal(existingKeyPrefill(undefined), null);
  });
});
