import { describe, expect, it } from "vitest";
import { pickFundingHelper } from "./funding-helper";

const ready = {
  hasAlternative: false,
  hasBalances: true,
  hasInsufficientGas: false,
  holdsUsdcSomewhere: true,
  isScanning: false,
  isSourceResolved: true,
  isUsdcShort: false,
};

describe("pickFundingHelper", () => {
  it("says nothing until the balances and the source are known", () => {
    expect(pickFundingHelper({ ...ready, hasBalances: false, isUsdcShort: true })).toBeNull();
    expect(pickFundingHelper({ ...ready, isSourceResolved: false, isUsdcShort: true })).toBeNull();
  });

  it("points to another network before offering to sell USDC", () => {
    expect(pickFundingHelper({ ...ready, isUsdcShort: true, hasAlternative: true })).toBe("elsewhere");
    expect(pickFundingHelper({ ...ready, isUsdcShort: true, hasAlternative: true, isScanning: true })).toBe(
      "elsewhere",
    );
  });

  it("waits for the scan before calling the wallet short or empty", () => {
    expect(pickFundingHelper({ ...ready, isUsdcShort: true, isScanning: true })).toBeNull();
    expect(pickFundingHelper({ ...ready, isUsdcShort: true })).toBe("insufficient");
    expect(pickFundingHelper({ ...ready, isUsdcShort: true, holdsUsdcSomewhere: false })).toBe("empty");
  });

  it("raises gas only once the USDC is there", () => {
    expect(pickFundingHelper({ ...ready, hasInsufficientGas: true })).toBe("gas");
    expect(pickFundingHelper({ ...ready, hasInsufficientGas: true, isUsdcShort: true })).toBe("insufficient");
    expect(pickFundingHelper(ready)).toBeNull();
  });
});
