import assert from "node:assert/strict";
import { getAddress } from "viem";
import { describe, it } from "vitest";
import { parseAuthorizeParam, parseNetworkParam, parseScopesParam, presetScopeStates } from "./authorizeParam";

const LOWERCASE = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const CHECKSUMMED = getAddress(LOWERCASE); // 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

describe("parseAuthorizeParam", () => {
  it("accepts a valid checksummed address unchanged", () => {
    assert.deepEqual(parseAuthorizeParam(CHECKSUMMED), { address: CHECKSUMMED });
  });

  it("checksums an all-lowercase hex address", () => {
    assert.deepEqual(parseAuthorizeParam(LOWERCASE), { address: CHECKSUMMED });
  });

  it("reports an all-uppercase hex address as a bad checksum, as viem does", () => {
    assert.deepEqual(parseAuthorizeParam(`0x${LOWERCASE.slice(2).toUpperCase()}`), { error: "bad-checksum" });
  });

  it("reports a mixed-case address with a wrong checksum", () => {
    assert.deepEqual(parseAuthorizeParam("0xF39FD6e51aad88F6F4ce6aB8827279cffFb92266"), { error: "bad-checksum" });
  });

  it("reports junk text, script tags, ENS names, and short hex as not an address", () => {
    for (const input of ["not-an-address", "<script>alert(1)</script>", "vitalik.eth", "0x1234"]) {
      assert.deepEqual(parseAuthorizeParam(input), { error: "not-an-address" });
    }
  });

  it("returns null for the empty string, whitespace, null, and undefined", () => {
    assert.equal(parseAuthorizeParam(""), null);
    assert.equal(parseAuthorizeParam("   "), null);
    assert.equal(parseAuthorizeParam(null), null);
    assert.equal(parseAuthorizeParam(undefined), null);
  });

  it("never throws, even on hostile input", () => {
    for (const input of ["0x", "0xgg".padEnd(42, "g"), "javascript:alert(1)", "%3Cscript%3E", "0x0000"]) {
      assert.doesNotThrow(() => parseAuthorizeParam(input));
      assert.deepEqual(parseAuthorizeParam(input), { error: "not-an-address" });
    }
  });
});

describe("parseScopesParam", () => {
  it("parses a comma-separated list into canonical scope ids", () => {
    assert.deepEqual(parseScopesParam("addPieces,schedulePieceRemovals"), ["addPieces", "schedulePieceRemovals"]);
  });

  it("matches case-insensitively and returns canonical ids", () => {
    assert.deepEqual(parseScopesParam("ADDPIECES,terminateservice"), ["addPieces", "terminateService"]);
  });

  it("returns ids in canonical scope order regardless of input order", () => {
    assert.deepEqual(parseScopesParam("terminateService,createDataSet"), ["createDataSet", "terminateService"]);
  });

  it("drops unknown entries but keeps valid ones", () => {
    assert.deepEqual(parseScopesParam("addPieces,notAScope"), ["addPieces"]);
  });

  it("dedupes repeated ids", () => {
    assert.deepEqual(parseScopesParam("addPieces,addPieces"), ["addPieces"]);
  });

  it("tolerates whitespace around entries", () => {
    assert.deepEqual(parseScopesParam(" addPieces , createDataSet "), ["createDataSet", "addPieces"]);
  });

  it("returns null when nothing valid remains", () => {
    assert.equal(parseScopesParam("nope,alsoNope"), null);
  });

  it("returns null for empty, null, and undefined", () => {
    assert.equal(parseScopesParam(""), null);
    assert.equal(parseScopesParam(null), null);
    assert.equal(parseScopesParam(undefined), null);
  });

  it("never throws on hostile input", () => {
    for (const input of ["<script>alert(1)</script>", "javascript:x", ",,,,", "%2Cx", "0x1234"]) {
      assert.doesNotThrow(() => parseScopesParam(input));
      assert.equal(parseScopesParam(input), null);
    }
  });
});

describe("presetScopeStates", () => {
  it("checks requested non-destructive scopes", () => {
    const states = presetScopeStates(["createDataSet", "addPieces"]);
    assert.equal(states.createDataSet, "checked");
    assert.equal(states.addPieces, "checked");
  });

  it("leaves requested destructive scopes unchecked but marked as requested", () => {
    const states = presetScopeStates(["addPieces", "terminateService", "schedulePieceRemovals"]);
    assert.equal(states.terminateService, "requested-unchecked");
    assert.equal(states.schedulePieceRemovals, "requested-unchecked");
    assert.equal(states.addPieces, "checked");
  });

  it("locks off scopes the request did not name", () => {
    const states = presetScopeStates(["createDataSet"]);
    assert.equal(states.addPieces, "locked-off");
    assert.equal(states.terminateService, "locked-off");
    assert.equal(states.schedulePieceRemovals, "locked-off");
  });

  it("covers every known scope id", () => {
    assert.deepEqual(Object.keys(presetScopeStates([])).sort(), [
      "addPieces",
      "createDataSet",
      "schedulePieceRemovals",
      "terminateService",
    ]);
  });
});

describe("parseNetworkParam", () => {
  it("accepts the two known networks, case-insensitively", () => {
    assert.equal(parseNetworkParam("calibration"), "calibration");
    assert.equal(parseNetworkParam("Mainnet"), "mainnet");
  });

  it("returns null for unknown, empty, and missing values", () => {
    assert.equal(parseNetworkParam("devnet"), null);
    assert.equal(parseNetworkParam(""), null);
    assert.equal(parseNetworkParam(null), null);
    assert.equal(parseNetworkParam(undefined), null);
  });
});
