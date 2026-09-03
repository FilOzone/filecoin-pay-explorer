import { describe, expect, it } from "vitest";
import { pickFundingHelper } from "./funding-helper";

const ready = {
  hasAlternative: false,
  hasBalances: true,
  hasInsufficientGas: false,
  holdsTokensSomewhere: true,
  isScanning: false,
  isSourceResolved: true,
  isTokenShort: false,
};

describe("pickFundingHelper", () => {
  it("says nothing until the balances and the source are known", () => {
    expect(pickFundingHelper({ ...ready, hasBalances: false, isTokenShort: true })).toBeNull();
    expect(pickFundingHelper({ ...ready, isSourceResolved: false, isTokenShort: true })).toBeNull();
  });

  it("points to another network before offering to buy USDC", () => {
    expect(pickFundingHelper({ ...ready, isTokenShort: true, hasAlternative: true })).toBe("elsewhere");
    expect(pickFundingHelper({ ...ready, isTokenShort: true, hasAlternative: true, isScanning: true })).toBe(
      "elsewhere",
    );
  });

  it("waits for the scan before calling the wallet short or empty", () => {
    expect(pickFundingHelper({ ...ready, isTokenShort: true, isScanning: true })).toBeNull();
    expect(pickFundingHelper({ ...ready, isTokenShort: true })).toBe("insufficient");
    expect(pickFundingHelper({ ...ready, isTokenShort: true, holdsTokensSomewhere: false })).toBe("empty");
  });

  it("raises gas only once the USDC is there", () => {
    expect(pickFundingHelper({ ...ready, hasInsufficientGas: true })).toBe("gas");
    expect(pickFundingHelper({ ...ready, hasInsufficientGas: true, isTokenShort: true })).toBe("insufficient");
    expect(pickFundingHelper(ready)).toBeNull();
  });
});
