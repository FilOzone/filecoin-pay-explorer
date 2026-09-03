import { maxUint256 } from "viem";
import { describe, expect, it } from "vitest";
import { daysToEpochs, formatLockupPeriod } from "./lockup-period";

describe("lockup periods", () => {
  it("converts typed days to epochs and rejects anything that is not a positive number", () => {
    expect(["1", "0.5", "30", "", "abc", "0", "-1", " 2 "].map(daysToEpochs)).toEqual([
      2880n,
      1440n,
      86_400n,
      null,
      null,
      null,
      null,
      5760n,
    ]);
  });

  it("describes epoch counts in days, with the sentinels as no limit", () => {
    expect([2880n, 86_400n, 4320n, 100n, 2n ** 64n - 1n, maxUint256].map(formatLockupPeriod)).toEqual([
      "1 day",
      "30 days",
      "1.5 days",
      "under a day",
      "no limit",
      "no limit",
    ]);
  });
});
