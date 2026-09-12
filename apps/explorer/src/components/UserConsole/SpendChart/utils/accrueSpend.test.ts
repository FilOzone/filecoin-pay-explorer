import { describe, expect, it } from "vitest";
import type { RatePeriod } from "../types";
import { accruePeriodInWindow, epochsApplicable } from "./accrueSpend";

const OPERATOR = "0x0000000000000000000000000000000000000abc";

const period = (rate: bigint, startEpoch: bigint, untilEpoch: bigint | null): RatePeriod => ({
  rate,
  startEpoch,
  untilEpoch,
  operatorAddress: OPERATOR,
});

/** A window well clear of the periods under test, so only the clamp being tested moves. */
const WINDOW_START = 1_000n;
const WINDOW_END = 2_000n;
const INDEXED = 10_000n;

describe("epochsApplicable", () => {
  it("counts the overlap without an off-by-one", () => {
    // (100, 200] against (150, 300] overlaps on (150, 200] — 50 epochs, not 51.
    expect(epochsApplicable(100n, 200n, 150n, 300n)).toBe(50n);
  });

  it("returns zero when the intervals only touch at a boundary", () => {
    // Adjacent intervals share an endpoint; counting it would double-charge the epoch.
    expect(epochsApplicable(100n, 200n, 200n, 300n)).toBe(0n);
  });

  it("returns zero when the intervals are disjoint", () => {
    expect(epochsApplicable(100n, 200n, 500n, 600n)).toBe(0n);
  });

  it("clamps to the narrower interval on both sides", () => {
    expect(epochsApplicable(0n, 10_000n, 1_000n, 2_000n)).toBe(1_000n);
  });
});

describe("accruePeriodInWindow", () => {
  it("bills a period covering the whole window", () => {
    const result = accruePeriodInWindow(period(5n, 0n, 9_000n), WINDOW_START, WINDOW_END, INDEXED);
    expect(result).toBe(5n * 1_000n);
  });

  it("bills only the overlap when the period starts mid-window", () => {
    const result = accruePeriodInWindow(period(5n, 1_400n, 9_000n), WINDOW_START, WINDOW_END, INDEXED);
    expect(result).toBe(5n * 600n);
  });

  it("bills only the overlap when the period ends mid-window", () => {
    const result = accruePeriodInWindow(period(5n, 0n, 1_600n), WINDOW_START, WINDOW_END, INDEXED);
    expect(result).toBe(5n * 600n);
  });

  it("returns zero for a period entirely before the window", () => {
    expect(accruePeriodInWindow(period(5n, 0n, 500n), WINDOW_START, WINDOW_END, INDEXED)).toBe(0n);
  });

  it("returns zero for a period entirely after the window", () => {
    expect(accruePeriodInWindow(period(5n, 5_000n, 6_000n), WINDOW_START, WINDOW_END, INDEXED)).toBe(0n);
  });

  it("returns zero for a zero-rate period, which is how a rail before activation is recorded", () => {
    expect(accruePeriodInWindow(period(0n, 0n, 9_000n), WINDOW_START, WINDOW_END, INDEXED)).toBe(0n);
  });

  describe("open periods", () => {
    it("runs an open period to the indexed epoch", () => {
      // Indexed inside the window, so the bar stops at the data rather than at month end.
      const result = accruePeriodInWindow(period(5n, 0n, null), WINDOW_START, WINDOW_END, 1_700n);
      expect(result).toBe(5n * 700n);
    });

    it("bills an open period for the whole window once the chain is past it", () => {
      const result = accruePeriodInWindow(period(5n, 0n, null), WINDOW_START, WINDOW_END, INDEXED);
      expect(result).toBe(5n * 1_000n);
    });

    it("returns zero for an open period the chain has not reached", () => {
      expect(accruePeriodInWindow(period(5n, 0n, null), WINDOW_START, WINDOW_END, 900n)).toBe(0n);
    });
  });

  describe("termination", () => {
    it("stops at untilEpoch when the rail ended inside the window", () => {
      const result = accruePeriodInWindow(period(5n, 0n, 1_300n), WINDOW_START, WINDOW_END, INDEXED);
      expect(result).toBe(5n * 300n);
    });

    it("clamps a future untilEpoch to the indexed epoch", () => {
      // Termination sets an endEpoch that can be ahead of the chain; the rail is
      // still charging, but only up to what has been indexed.
      const result = accruePeriodInWindow(period(5n, 0n, 9_000n), WINDOW_START, WINDOW_END, 1_200n);
      expect(result).toBe(5n * 200n);
    });
  });
});
