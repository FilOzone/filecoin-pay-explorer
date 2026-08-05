import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keccak256, toBytes } from "viem";
import {
  type AuthorizationEvent,
  buildEnvSnippet,
  deriveKeyStatus,
  EXPIRY_PRESETS,
  foldAuthorizationEvents,
  isScopeActive,
  parseInventoryFile,
  SESSION_KEY_SCOPES,
  type SessionKeyRecord,
  serializeInventory,
} from "./sessionKeys.ts";

const CREATE_PREIMAGE =
  "CreateDataSet(uint256 clientDataSetId,address payee,MetadataEntry[] metadata)MetadataEntry(string key,string value)";
const ADD_PREIMAGE =
  "AddPieces(uint256 clientDataSetId,uint256 nonce,Cid[] pieceData,PieceMetadata[] pieceMetadata)" +
  "Cid(bytes data)" +
  "MetadataEntry(string key,string value)" +
  "PieceMetadata(uint256 pieceIndex,MetadataEntry[] metadata)";

const SIGNER = "0x8ba1f109551bD432803012645Ac136ddd64DBA72" as const;
const ACCOUNT = "0xF39FD6e51aad88F6F4ce6aB8827279cffFb92266" as const;

describe("scopes", () => {
  it("has exactly the two v1 scopes", () => {
    assert.deepEqual(
      SESSION_KEY_SCOPES.map((s) => s.id),
      ["createDataSet", "addPieces"],
    );
  });

  it("typehashes match keccak256 of the FWSS SignatureVerificationLib preimages", () => {
    const byId = Object.fromEntries(SESSION_KEY_SCOPES.map((s) => [s.id, s.typehash]));
    assert.equal(byId.createDataSet, keccak256(toBytes(CREATE_PREIMAGE)));
    assert.equal(byId.addPieces, keccak256(toBytes(ADD_PREIMAGE)));
  });
});

describe("deriveKeyStatus", () => {
  const now = 1_000_000n;
  it("any future scope expiry means active", () => {
    assert.equal(deriveKeyStatus([now + 10n, 0n], now), "active");
    assert.equal(deriveKeyStatus([now + 10n, now - 10n], now), "active");
  });
  it("all zero means revoked (caller maps file-imports to notFound)", () => {
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

describe("expiry presets", () => {
  it("offers 7, 30, 90 days and no 'never' option", () => {
    assert.deepEqual(
      EXPIRY_PRESETS.map((p) => p.seconds),
      [7 * 86400, 30 * 86400, 90 * 86400],
    );
    assert.ok(EXPIRY_PRESETS.every((p) => p.seconds > 0));
  });
});

describe("inventory file", () => {
  const keys: SessionKeyRecord[] = [
    {
      name: "ci-uploader",
      sessionKeyPublic: SIGNER,
      scopes: ["addPieces"],
      createdAt: 1753795200000,
      source: "created",
    },
  ];

  it("uses accountAddress / sessionKeys / sessionKeyPublic field names", () => {
    const parsed = JSON.parse(serializeInventory("calibration", ACCOUNT, keys));
    assert.equal(parsed.accountAddress, ACCOUNT);
    assert.ok(Array.isArray(parsed.sessionKeys));
    assert.equal(parsed.sessionKeys[0].sessionKeyPublic, SIGNER);
    assert.equal(parsed.identity, undefined);
    assert.equal(parsed.keys, undefined);
  });

  it("round-trips, carries no secret material, and marks entries as file-sourced", () => {
    const json = serializeInventory("calibration", ACCOUNT, keys);
    assert.doesNotMatch(json, /[0-9a-fA-F]{64}/, "must not contain any 32-byte hex secret");
    const parsed = parseInventoryFile(json, { network: "calibration", accountAddress: ACCOUNT });
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].sessionKeyPublic, SIGNER);
    assert.equal(parsed[0].source, "file");
  });

  it("accepts account address in any case", () => {
    const json = serializeInventory("calibration", ACCOUNT.toLowerCase(), keys);
    assert.equal(parseInventoryFile(json, { network: "calibration", accountAddress: ACCOUNT }).length, 1);
  });

  it("rejects a file for a different wallet", () => {
    const json = serializeInventory("calibration", SIGNER, keys);
    assert.throws(
      () => parseInventoryFile(json, { network: "calibration", accountAddress: ACCOUNT }),
      /different wallet/,
    );
  });

  it("rejects a file for a different network", () => {
    const json = serializeInventory("mainnet", ACCOUNT, keys);
    assert.throws(() => parseInventoryFile(json, { network: "calibration", accountAddress: ACCOUNT }), /network/);
  });

  it("rejects unknown versions and malformed entries", () => {
    assert.throws(
      () => parseInventoryFile('{"version":2}', { network: "calibration", accountAddress: ACCOUNT }),
      /version/,
    );
    const bad = JSON.stringify({
      version: 1,
      network: "calibration",
      accountAddress: ACCOUNT,
      sessionKeys: [{ name: "x", sessionKeyPublic: "not-an-address", scopes: ["addPieces"], createdAt: 1 }],
    });
    assert.throws(
      () => parseInventoryFile(bad, { network: "calibration", accountAddress: ACCOUNT }),
      /sessionKeyPublic/,
    );
    const badScope = JSON.stringify({
      version: 1,
      network: "calibration",
      accountAddress: ACCOUNT,
      sessionKeys: [{ name: "x", sessionKeyPublic: SIGNER, scopes: ["terminate"], createdAt: 1 }],
    });
    assert.throws(() => parseInventoryFile(badScope, { network: "calibration", accountAddress: ACCOUNT }), /scope/);
  });

  it("treats name as optional, defaulting to (unnamed)", () => {
    const noName = JSON.stringify({
      version: 1,
      network: "calibration",
      accountAddress: ACCOUNT,
      sessionKeys: [{ sessionKeyPublic: SIGNER, scopes: ["addPieces"], createdAt: 1 }],
    });
    const parsed = parseInventoryFile(noName, { network: "calibration", accountAddress: ACCOUNT });
    assert.equal(parsed[0].name, "(unnamed)");
  });

  it("rejects garbage json", () => {
    assert.throws(() => parseInventoryFile("not json", { network: "calibration", accountAddress: ACCOUNT }));
  });
});

describe("env snippet", () => {
  it("contains SESSION_KEY_PRIVATE, SESSION_KEY_ADDRESS, ACCOUNT_WALLET_ADDRESS and no SDK naming", () => {
    const pk = `0x${"ab".repeat(32)}`;
    const snippet = buildEnvSnippet(pk, SIGNER, ACCOUNT);
    assert.match(snippet, new RegExp(`SESSION_KEY_PRIVATE=${pk}`));
    assert.match(snippet, new RegExp(`SESSION_KEY_ADDRESS=${SIGNER}`));
    assert.match(snippet, new RegExp(`ACCOUNT_WALLET_ADDRESS=${ACCOUNT}`));
    assert.doesNotMatch(snippet, /Synapse SDK/);
  });
});

describe("foldAuthorizationEvents (chain import)", () => {
  const ev = (over: Partial<AuthorizationEvent>): AuthorizationEvent => ({
    signer: SIGNER,
    expiry: 100n,
    scopes: ["addPieces"],
    origin: "test-key",
    timestamp: 1000,
    ...over,
  });

  it("folds login+revoke into one record keeping name, first-seen date, and scope union", () => {
    const records = foldAuthorizationEvents([
      ev({ scopes: ["createDataSet"], origin: "first-name", timestamp: 1000 }),
      ev({ scopes: ["addPieces"], origin: "renamed", timestamp: 2000 }),
      ev({ expiry: 0n, scopes: ["createDataSet", "addPieces"], origin: "revoke-origin", timestamp: 3000 }),
    ]);
    assert.equal(records.length, 1);
    assert.equal(records[0].name, "renamed"); // latest grant names the key; revoke origin ignored
    assert.equal(records[0].createdAt, 1000);
    assert.deepEqual([...records[0].scopes].sort(), ["addPieces", "createDataSet"]);
    assert.equal(records[0].source, "chain");
  });

  it("keeps separate signers separate and skips events with only unknown scopes", () => {
    const other = "0x174ffd8633A5E00796c011891B923E483d9344F2" as const;
    const records = foldAuthorizationEvents([
      ev({}),
      ev({ signer: other, origin: "other-key" }),
      ev({ signer: "0x75340862E5480Ec81C56106f4A25e876178cB771", scopes: [] }), // unknown-scope-only event
    ]);
    assert.equal(records.length, 2);
    assert.deepEqual(records.map((r) => r.name).sort(), ["other-key", "test-key"]);
  });

  it("names unnamed grants defensively", () => {
    const records = foldAuthorizationEvents([ev({ origin: "" })]);
    assert.equal(records[0].name, "(unnamed)");
  });
});
