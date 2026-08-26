import { maxUint256 } from "viem";
import { describe, expect, it } from "vitest";
import { deriveFundsHealth } from "./fundsHealth";

const NOW = 1_700_000_000n;
const DAY = 24n * 60n * 60n;

const healthAt = (secondsFromNow: bigint) => deriveFundsHealth(NOW + secondsFromNow, NOW);

describe("deriveFundsHealth", () => {
  it("reports healthy with no runway figure when there is no active spend", () => {
    expect(deriveFundsHealth(maxUint256, NOW)).toEqual({
      tier: "healthy",
      daysRemaining: null,
      isExpired: false,
    });
  });

  it("reports emergency and expired when funding runs out exactly now", () => {
    expect(deriveFundsHealth(NOW, NOW)).toEqual({
      tier: "emergency",
      daysRemaining: 0,
      isExpired: true,
    });
  });

  it("reports emergency and expired when funding already ran out", () => {
    expect(healthAt(-DAY)).toEqual({
      tier: "emergency",
      daysRemaining: 0,
      isExpired: true,
    });
  });

  it("reports emergency just under the 3 day threshold", () => {
    expect(healthAt(3n * DAY - 1n)).toEqual({
      tier: "emergency",
      daysRemaining: 2,
      isExpired: false,
    });
  });

  it("reports critical exactly at the 3 day threshold", () => {
    expect(healthAt(3n * DAY)).toEqual({
      tier: "critical",
      daysRemaining: 3,
      isExpired: false,
    });
  });

  it("reports critical just under the 7 day threshold", () => {
    expect(healthAt(7n * DAY - 1n)).toEqual({
      tier: "critical",
      daysRemaining: 6,
      isExpired: false,
    });
  });

  it("reports warning exactly at the 7 day threshold", () => {
    expect(healthAt(7n * DAY)).toEqual({
      tier: "warning",
      daysRemaining: 7,
      isExpired: false,
    });
  });

  it("reports warning just under the 30 day threshold", () => {
    expect(healthAt(30n * DAY - 1n)).toEqual({
      tier: "warning",
      daysRemaining: 29,
      isExpired: false,
    });
  });

  it("reports healthy exactly at the 30 day threshold", () => {
    expect(healthAt(30n * DAY)).toEqual({
      tier: "healthy",
      daysRemaining: 30,
      isExpired: false,
    });
  });

  it("reports healthy well beyond the 30 day threshold", () => {
    expect(healthAt(365n * DAY)).toEqual({
      tier: "healthy",
      daysRemaining: 365,
      isExpired: false,
    });
  });

  it("floors partial days rather than rounding them up", () => {
    expect(healthAt(10n * DAY + DAY / 2n)).toEqual({
      tier: "warning",
      daysRemaining: 10,
      isExpired: false,
    });
  });
});
