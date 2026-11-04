import type { DataSet } from "@filecoin-pay/types";
import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { describe, expect, it } from "vitest";
import { daysInactive, rankStaleDataSets } from "./staleness";

const DAY = 86_400n;
const NOW = 2_000_000_000n;

// Subgraph BigInt fields arrive as decimal strings.
const dataSet = (id: string, paymentRate: string, daysAgo: bigint, state = "ACTIVE") =>
  ({
    id,
    lastWriteAt: String(NOW - daysAgo * DAY),
    pdpRail: { paymentRate, state, endEpoch: "500" },
  }) as unknown as DataSet;

describe("daysInactive", () => {
  it("is zero right at the last write", () => {
    expect(daysInactive(NOW, NOW)).toBe(0n);
  });

  it("floors to whole days", () => {
    expect(daysInactive(NOW - DAY - 1n, NOW)).toBe(1n);
    expect(daysInactive(NOW - 2n * DAY + 1n, NOW)).toBe(1n);
  });

  it("never goes negative for a last-write time in the future", () => {
    expect(daysInactive(NOW + DAY, NOW)).toBe(0n);
  });

  it("converts a wire-format string lastWriteAt before subtracting", () => {
    expect(daysInactive(String(NOW - 5n * DAY) as unknown as bigint, NOW)).toBe(5n);
  });
});

describe("rankStaleDataSets", () => {
  it("ranks by monthly spend times days inactive, highest first", () => {
    const cheapButOld = dataSet("0xa", "1", 100n); // weight 100
    const expensive = dataSet("0xb", "20", 30n); // weight 600
    const middle = dataSet("0xc", "10", 40n); // weight 400

    const ranked = rankStaleDataSets([cheapButOld, expensive, middle], 0n, NOW);

    expect(ranked).toEqual([
      { dataSet: expensive, days: 30n, monthlySpend: 20n * TIME_CONSTANTS.EPOCHS_PER_MONTH },
      { dataSet: middle, days: 40n, monthlySpend: 10n * TIME_CONSTANTS.EPOCHS_PER_MONTH },
      { dataSet: cheapButOld, days: 100n, monthlySpend: TIME_CONSTANTS.EPOCHS_PER_MONTH },
    ]);
  });

  it("ranks an unknown spend as zero and keeps input order on ties", () => {
    const terminated = dataSet("0xa", "10", 60n, "TERMINATED");
    const free = dataSet("0xb", "0", 50n);
    const paying = dataSet("0xc", "1", 30n);

    const ranked = rankStaleDataSets([terminated, free, paying], undefined, NOW);

    expect(ranked.map((entry) => entry.dataSet.id)).toEqual(["0xc", "0xa", "0xb"]);
    expect(ranked[1].monthlySpend).toBeUndefined();
  });
});
