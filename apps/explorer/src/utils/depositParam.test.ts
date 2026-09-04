import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { parseDepositLink, parseDepositParam, parseOperatorParam, resolveOperator } from "./depositParam";

describe("parseDepositParam", () => {
  it("accepts whole and fractional amounts as typed", () => {
    assert.equal(parseDepositParam("2"), "2");
    assert.equal(parseDepositParam("1.5"), "1.5");
    assert.equal(parseDepositParam(" 0.25 "), "0.25");
  });

  it("rejects zero, negatives, exponents, hex, and junk", () => {
    for (const input of ["0", "0.0", "-1", "1e3", "0x10", "two", "1,5", ".5", "5.", "007", "", "Infinity", "NaN"]) {
      assert.equal(parseDepositParam(input), null, input);
    }
  });

  it("rejects more than 18 fraction digits", () => {
    assert.equal(parseDepositParam(`1.${"1".repeat(19)}`), null);
    assert.equal(parseDepositParam(`1.${"1".repeat(18)}`), `1.${"1".repeat(18)}`);
  });

  it("returns null for null and undefined", () => {
    assert.equal(parseDepositParam(null), null);
    assert.equal(parseDepositParam(undefined), null);
  });
});

describe("parseOperatorParam", () => {
  it("accepts fwss case-insensitively", () => {
    assert.equal(parseOperatorParam("fwss"), "fwss");
    assert.equal(parseOperatorParam("FWSS"), "fwss");
  });

  it("returns null for unknown operators and raw addresses", () => {
    assert.equal(parseOperatorParam("0x8408502033c418e1bbc97ce9ac48e5528f371a9f"), null);
    assert.equal(parseOperatorParam("someone"), null);
    assert.equal(parseOperatorParam(""), null);
    assert.equal(parseOperatorParam(null), null);
  });
});

describe("parseDepositLink", () => {
  const link = (query: string) => parseDepositLink(new URLSearchParams(query));

  it("reads a complete CLI funding link", () => {
    assert.deepEqual(link("deposit=2&operator=fwss&network=calibration"), {
      amount: "2",
      operator: "fwss",
      network: "calibration",
    });
  });

  it("refuses a link missing or misspelling any of the three, so nothing partial is prefilled", () => {
    assert.equal(link("operator=fwss&network=calibration"), null);
    assert.equal(link("deposit=junk&operator=fwss&network=calibration"), null);
    assert.equal(link("deposit=2&network=calibration"), null);
    assert.equal(link("deposit=2&operator=fwss"), null);
    assert.equal(link("deposit=2&operator=fwss&network=calibraiton"), null);
    assert.equal(link(""), null);
  });
});

describe("resolveOperator", () => {
  it("maps fwss to the FWSS contract for each network", () => {
    assert.equal(resolveOperator("fwss", "mainnet"), "0x8408502033C418E1bbC97cE9ac48E5528F371A9f");
    assert.equal(resolveOperator("fwss", "calibration"), "0x02925630df557F957f70E112bA06e50965417CA0");
  });
});
