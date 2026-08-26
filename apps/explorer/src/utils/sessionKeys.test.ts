import assert from "node:assert/strict";
import { keccak256, toBytes } from "viem";
import { describe, it } from "vitest";
import {
  buildEnvSnippet,
  deriveKeyStatus,
  EXPIRY_PRESETS,
  hasUniformExpiry,
  isScopeActive,
  normalizeKeyName,
  SESSION_KEY_SCOPES,
  sanitizeRecords,
} from "./sessionKeys.ts";

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
  });
  it("isScopeActive matches contract semantics", () => {
    assert.equal(isScopeActive(now, now), true);
    assert.equal(isScopeActive(now - 1n, now), false);
    assert.equal(isScopeActive(0n, now), false);
  });
});

describe("hasUniformExpiry", () => {
  it("true when every granted scope shares one expiry", () => {
    assert.equal(hasUniformExpiry(["createDataSet", "addPieces"], { createDataSet: 100n, addPieces: 100n }), true);
  });
  it("true for a single scope", () => {
    assert.equal(hasUniformExpiry(["createDataSet"], { createDataSet: 100n }), true);
  });
  it("false once granted scopes carry different expiries", () => {
    assert.equal(hasUniformExpiry(["createDataSet", "addPieces"], { createDataSet: 100n, addPieces: 200n }), false);
  });
  it("missing expiry is treated as 0n, so it diverges from any nonzero peer", () => {
    assert.equal(hasUniformExpiry(["createDataSet", "addPieces"], { createDataSet: 100n }), false);
  });
  it("all-zero (revoked) scopes are uniform", () => {
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
  it("is byte-compatible with ~/.filecoin-session-key.env: SESSION_KEY, WALLET_ADDRESS, session-address comment", () => {
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
    assert.deepEqual(sanitizeRecords([{ ...good, scopes: "addPieces" }]), []);
  });

  it("strips unknown scope ids and drops records left with none", () => {
    assert.deepEqual(sanitizeRecords([{ ...good, scopes: ["evil", "addPieces"] }])[0]?.scopes, ["addPieces"]);
    assert.deepEqual(sanitizeRecords([{ ...good, scopes: ["evil"] }]), []);
  });

  it("coerces missing name/createdAt instead of crashing", () => {
    const [rec] = sanitizeRecords([{ sessionKeyPublic: SIGNER, scopes: ["addPieces"] }]);
    assert.equal(rec?.name, "");
    assert.equal(rec?.createdAt, 0);
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
