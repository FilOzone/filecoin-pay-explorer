import type { DataSet, Rail } from "@filecoin-pay/types";
import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { describe, expect, it } from "vitest";
import { daysInactive, isStale, STALE_AFTER_DAYS, wastedSpend } from "./staleness";

const DAY = 86_400n;
const NOW = 2_000_000_000n;

type RailSet = Pick<DataSet, "pdpRail" | "cacheMissRail" | "cdnRail" | "lastWriteAt">;

const rail = (paymentRate: string, state: Rail["state"] = "ACTIVE", endEpoch: string = "0") =>
  ({ paymentRate, state, endEpoch }) as unknown as Rail;

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
    expect(daysInactive((NOW - 5n * DAY) as unknown as bigint, NOW)).toBe(5n);
    expect(daysInactive(String(NOW - 5n * DAY) as unknown as bigint, NOW)).toBe(5n);
  });
});

describe("isStale", () => {
  it("is false just under the threshold", () => {
    expect(isStale(NOW - (BigInt(STALE_AFTER_DAYS) * DAY - 1n), NOW)).toBe(false);
  });

  it("is true at exactly the threshold", () => {
    expect(isStale(NOW - BigInt(STALE_AFTER_DAYS) * DAY, NOW)).toBe(true);
  });
});

describe("wastedSpend", () => {
  it("scales the monthly rate by the fraction of a month inactive", () => {
    const dataSet = { pdpRail: rail("10"), lastWriteAt: NOW - 15n * DAY } as RailSet;
    const monthlySpend = 10n * TIME_CONSTANTS.EPOCHS_PER_MONTH;

    expect(wastedSpend(dataSet, 0n, NOW)).toBe((monthlySpend * 15n) / 30n);
  });

  it("is undefined when the underlying monthly spend can't be determined yet", () => {
    const dataSet = {
      pdpRail: rail("10", "TERMINATED", "500"),
      lastWriteAt: NOW - 15n * DAY,
    } as RailSet;

    expect(wastedSpend(dataSet, undefined, NOW)).toBeUndefined();
  });
});
