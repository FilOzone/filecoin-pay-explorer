import { describe, expect, it } from "vitest";
import type { MockDataset } from "../data/mockDatasets";
import { daysBetween, daysInactive, daysUntil, isStale, wastedSpendUSD } from "./datasetLifecycle";

const baseDataset: MockDataset = {
  id: "ds-test",
  name: "test",
  rootCid: "bafytest",
  sizeGiB: 1,
  createdAt: "2026-01-01T00:00:00Z",
  lastWriteAt: "2026-08-17T12:00:00Z", // 10 days before MOCK_NOW (2026-08-27T12:00:00Z)
  fundedUntil: "2026-09-06T12:00:00Z", // 10 days after MOCK_NOW
  burnPerDayUSD: 2,
  lockedUSD: 100,
  provingStatus: "healthy",
};

describe("daysBetween / daysUntil", () => {
  it("measures whole days against the mock clock", () => {
    expect(daysBetween("2026-08-17T12:00:00Z")).toBe(10);
    expect(daysUntil("2026-09-06T12:00:00Z")).toBe(10);
  });

  it("clamps past-to-now at zero for future dates", () => {
    expect(daysBetween("2027-01-01T00:00:00Z")).toBe(0);
  });

  it("goes negative for an already-passed funded-until", () => {
    expect(daysUntil("2026-08-20T12:00:00Z")).toBe(-7);
  });
});

describe("daysInactive", () => {
  it("uses last write when the dataset has no FilBeam retrieval signal", () => {
    expect(daysInactive(baseDataset)).toBe(10);
  });

  it("uses the most recent of write and retrieval when FilBeam data exists", () => {
    const retrievedRecently: MockDataset = {
      ...baseDataset,
      retrieval: { lastRetrievedAt: "2026-08-25T12:00:00Z", successRate: 1 },
    };
    expect(daysInactive(retrievedRecently)).toBe(2);

    const retrievedLongAgo: MockDataset = {
      ...baseDataset,
      retrieval: { lastRetrievedAt: "2026-01-01T00:00:00Z", successRate: 1 },
    };
    // Write (10 days ago) is more recent than retrieval: still 10, not 238.
    expect(daysInactive(retrievedLongAgo)).toBe(10);
  });
});

describe("isStale / wastedSpendUSD", () => {
  it("marks a dataset stale only at 90+ days without activity", () => {
    expect(isStale(baseDataset)).toBe(false);
    expect(isStale({ ...baseDataset, lastWriteAt: "2026-05-27T12:00:00Z" })).toBe(true);
  });

  it("charges waste as burn per day times days inactive", () => {
    expect(wastedSpendUSD(baseDataset)).toBe(20);
  });
});
