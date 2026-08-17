import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAddress } from "viem";
import { parseAuthorizeParam } from "./authorizeParam.ts";

const LOWERCASE = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const CHECKSUMMED = getAddress(LOWERCASE); // 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

describe("parseAuthorizeParam", () => {
  it("accepts a valid checksummed address unchanged", () => {
    assert.equal(parseAuthorizeParam(CHECKSUMMED), CHECKSUMMED);
  });

  it("checksums an all-lowercase hex address", () => {
    assert.equal(parseAuthorizeParam(LOWERCASE), CHECKSUMMED);
  });

  it("rejects a mixed-case address with a wrong checksum", () => {
    assert.equal(parseAuthorizeParam("0xF39FD6e51aad88F6F4ce6aB8827279cffFb92266"), null);
  });

  it("rejects junk text", () => {
    assert.equal(parseAuthorizeParam("not-an-address"), null);
  });

  it("rejects a script tag", () => {
    assert.equal(parseAuthorizeParam("<script>alert(1)</script>"), null);
  });

  it("rejects an ENS name", () => {
    assert.equal(parseAuthorizeParam("vitalik.eth"), null);
  });

  it("rejects short hex", () => {
    assert.equal(parseAuthorizeParam("0x1234"), null);
  });

  it("rejects the empty string", () => {
    assert.equal(parseAuthorizeParam(""), null);
  });

  it("returns null for null", () => {
    assert.equal(parseAuthorizeParam(null), null);
  });

  it("returns null for undefined", () => {
    assert.equal(parseAuthorizeParam(undefined), null);
  });

  it("never throws, even on hostile input", () => {
    for (const input of ["0x", "0xgg".padEnd(42, "g"), "javascript:alert(1)", "%3Cscript%3E", "0x0000"]) {
      assert.doesNotThrow(() => parseAuthorizeParam(input));
      assert.equal(parseAuthorizeParam(input), null);
    }
  });
});
