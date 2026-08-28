import { describe, expect, it } from "vitest";
import type { MockDataset } from "../data/mockDatasets";
import { daysBetween, daysSinceLastWrite, isStale } from "./datasetLifecycle";

const baseDataset: MockDataset = {
  id: "ds-test",
  name: "test",
  rootCid: "bafytest",
  sizeGiB: 1,
  createdAt: "2026-01-01T00:00:00Z",
  lastWriteAt: "2026-08-17T12:00:00Z", // 10 days before MOCK_NOW (2026-08-27T12:00:00Z)
  burnPerDayUSD: 2,
  oneTimeOpsUSD: 0,
  lockedUSD: 100,
};

describe("daysBetween", () => {
  it("measures whole days against the mock clock", () => {
    expect(daysBetween("2026-08-17T12:00:00Z")).toBe(10);
  });

  it("clamps past-to-now at zero for future dates", () => {
    expect(daysBetween("2027-01-01T00:00:00Z")).toBe(0);
  });
});

describe("daysSinceLastWrite / isStale", () => {
  it("measures inactivity from the last write", () => {
    expect(daysSinceLastWrite(baseDataset)).toBe(10);
  });

  it("marks a dataset stale only at 90+ days without a write", () => {
    expect(isStale(baseDataset)).toBe(false);
    expect(isStale({ ...baseDataset, lastWriteAt: "2026-05-27T12:00:00Z" })).toBe(true);
  });
});
