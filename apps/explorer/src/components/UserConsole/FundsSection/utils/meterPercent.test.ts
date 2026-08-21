import { maxUint256 } from "viem";
import { describe, expect, it } from "vitest";
import { getLockedPercent, getRunwayPercent } from "./meterPercent";

const NOW = 1_700_000_000n;
const DAY = 24n * 60n * 60n;

const runwayIn = (days: bigint) => getRunwayPercent(NOW + days * DAY, NOW);

describe("getRunwayPercent", () => {
  it("pins full when there is no active spend", () => {
    expect(getRunwayPercent(maxUint256, NOW)).toBe(100);
  });

  it("reads empty once funding has run out", () => {
    // Pinning full here would contradict the "Expired" reading the row shows.
    expect(getRunwayPercent(NOW, NOW)).toBe(0);
    expect(runwayIn(-1n)).toBe(0);
  });

  it("fills proportionally inside the 90 day horizon", () => {
    expect(runwayIn(45n)).toBe(50);
    expect(runwayIn(9n)).toBe(10);
    expect(runwayIn(30n)).toBe(33);
  });

  it("pins full at the horizon and beyond", () => {
    expect(runwayIn(90n)).toBe(100);
    expect(runwayIn(365n)).toBe(100);
  });

  it("truncates a partial percent down rather than rounding", () => {
    // 30/90 is 33.33…, and one second short of 45 days is still under half.
    expect(runwayIn(30n)).toBe(33);
    expect(getRunwayPercent(NOW + 45n * DAY - 1n, NOW)).toBe(49);
  });

  it("stays within 0 and 100 either side of the horizon", () => {
    for (const days of [-100n, 0n, 1n, 44n, 89n, 90n, 10_000n]) {
      const percent = runwayIn(days);
      expect(percent).toBeGreaterThanOrEqual(0);
      expect(percent).toBeLessThanOrEqual(100);
    }
  });
});

describe("getLockedPercent", () => {
  it("reads zero when the account holds no balance", () => {
    expect(getLockedPercent(0n, 0n)).toBe(0);
    // Guards a divide by zero rather than describing a reachable state.
    expect(getLockedPercent(10n, 0n)).toBe(0);
  });

  it("reads the share of the balance held in lockup", () => {
    expect(getLockedPercent(50n, 100n)).toBe(50);
    expect(getLockedPercent(0n, 100n)).toBe(0);
    expect(getLockedPercent(100n, 100n)).toBe(100);
  });

  it("truncates a fractional percent down", () => {
    // 2.181 of 2.277 is 95.78…, shown as 95.
    expect(getLockedPercent(2_181n, 2_277n)).toBe(95);
    expect(getLockedPercent(999n, 1_000n)).toBe(99);
  });

  it("clamps above the balance so the fill cannot outrun its track", () => {
    expect(getLockedPercent(150n, 100n)).toBe(100);
  });

  it("handles values beyond Number.MAX_SAFE_INTEGER", () => {
    expect(getLockedPercent(10n ** 24n / 4n, 10n ** 24n)).toBe(25);
  });
});
