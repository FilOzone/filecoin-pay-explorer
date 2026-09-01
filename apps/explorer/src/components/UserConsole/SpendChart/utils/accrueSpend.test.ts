import { describe, expect, it } from "vitest";
import type { RailSpendInput } from "../types";
import { accrueRailInWindow, epochsApplicable } from "./accrueSpend";

const RATE = 100n;

/** A rail that has run at one rate since epoch 0, with nothing queued. */
const makeRail = (overrides: Partial<RailSpendInput> = {}): RailSpendInput => ({
  paymentRate: RATE,
  endEpoch: 0n,
  createdAtEpoch: 0n,
  segments: [],
  oneTimePayments: [],
  ...overrides,
});

// One month-sized window, well inside an indexed epoch far ahead of it.
const WINDOW_START = 1_000n;
const WINDOW_END = 1_100n;
const INDEXED_EPOCH = 5_000n;

describe("epochsApplicable", () => {
  it("counts the intersection without an off-by-one", () => {
    // (1000, 1100] ∩ (1000, 1100] is 100 epochs, not 101.
    expect(epochsApplicable({ startEpoch: 1_000n, untilEpoch: 1_100n, rate: RATE }, WINDOW_START, WINDOW_END)).toBe(
      100n,
    );
  });

  it("clamps a segment that overhangs both ends of the window", () => {
    expect(epochsApplicable({ startEpoch: 0n, untilEpoch: 9_000n, rate: RATE }, WINDOW_START, WINDOW_END)).toBe(100n);
  });

  it("returns zero for a segment that ends before the window opens", () => {
    expect(epochsApplicable({ startEpoch: 0n, untilEpoch: 500n, rate: RATE }, WINDOW_START, WINDOW_END)).toBe(0n);
  });

  it("returns zero for a segment that starts after the window closes", () => {
    expect(epochsApplicable({ startEpoch: 2_000n, untilEpoch: 3_000n, rate: RATE }, WINDOW_START, WINDOW_END)).toBe(0n);
  });

  it("returns zero for a segment touching only the exclusive start boundary", () => {
    expect(epochsApplicable({ startEpoch: 900n, untilEpoch: 1_000n, rate: RATE }, WINDOW_START, WINDOW_END)).toBe(0n);
  });
});

describe("accrueRailInWindow", () => {
  it("bills a full window at the current rate when nothing is queued", () => {
    expect(accrueRailInWindow(makeRail(), WINDOW_START, WINDOW_END, INDEXED_EPOCH)).toBe(100n * RATE);
  });

  // The regression that matters: an empty queue is the *default* state, because
  // a rail's first rate-set writes no segment. Without the `createdAtEpoch`
  // floor this billed the whole window instead of the part the rail existed for.
  it("bills only from creation for a rail with no rate changes created mid-window", () => {
    const rail = makeRail({ createdAtEpoch: 1_050n });
    expect(accrueRailInWindow(rail, WINDOW_START, WINDOW_END, INDEXED_EPOCH)).toBe(50n * RATE);
  });

  it("bills nothing for a rail created after the window closed", () => {
    const rail = makeRail({ createdAtEpoch: 2_000n });
    expect(accrueRailInWindow(rail, WINDOW_START, WINDOW_END, INDEXED_EPOCH)).toBe(0n);
  });

  it("stops a terminated rail at exactly endEpoch", () => {
    const rail = makeRail({ endEpoch: 1_040n });
    expect(accrueRailInWindow(rail, WINDOW_START, WINDOW_END, INDEXED_EPOCH)).toBe(40n * RATE);
  });

  it("still reports historical months for a rail terminated after them", () => {
    const rail = makeRail({ endEpoch: 4_000n });
    expect(accrueRailInWindow(rail, WINDOW_START, WINDOW_END, INDEXED_EPOCH)).toBe(100n * RATE);
  });

  // A finalized rail is zeroed out on chain, but the subgraph keeps the last
  // active rate, so its history stays readable. Pins that: were `paymentRate`
  // ever to arrive as `0n` for a finalized rail, this months-old window would
  // report nothing instead of what the rail had scheduled.
  it("still bills a finalized rail's history at its last active rate", () => {
    const finalized = makeRail({ endEpoch: 1_040n, paymentRate: RATE });
    expect(accrueRailInWindow(finalized, WINDOW_START, WINDOW_END, INDEXED_EPOCH)).toBe(40n * RATE);
  });

  it("bills nothing for a rail that ended entirely before the window", () => {
    const rail = makeRail({ endEpoch: 900n });
    expect(accrueRailInWindow(rail, WINDOW_START, WINDOW_END, INDEXED_EPOCH)).toBe(0n);
  });

  it("bills each segment of a mid-window rate change at its own rate", () => {
    // 40 epochs at 100, then the current rate of 250 for the remaining 60.
    const rail = makeRail({
      paymentRate: 250n,
      segments: [{ startEpoch: 1_000n, untilEpoch: 1_040n, rate: 100n }],
    });
    expect(accrueRailInWindow(rail, WINDOW_START, WINDOW_END, INDEXED_EPOCH)).toBe(40n * 100n + 60n * 250n);
  });

  it("is independent of the order segments arrive in", () => {
    const segments = [
      { startEpoch: 1_000n, untilEpoch: 1_030n, rate: 100n },
      { startEpoch: 1_030n, untilEpoch: 1_070n, rate: 200n },
    ];
    const inOrder = makeRail({ paymentRate: 300n, segments });
    const reversed = makeRail({ paymentRate: 300n, segments: [...segments].reverse() });

    const expected = 30n * 100n + 40n * 200n + 30n * 300n;
    expect(accrueRailInWindow(inOrder, WINDOW_START, WINDOW_END, INDEXED_EPOCH)).toBe(expected);
    expect(accrueRailInWindow(reversed, WINDOW_START, WINDOW_END, INDEXED_EPOCH)).toBe(expected);
  });

  it("accrues the current month only to the indexed epoch, not to month end", () => {
    const chainHead = 1_060n;
    expect(accrueRailInWindow(makeRail(), WINDOW_START, WINDOW_END, chainHead)).toBe(60n * RATE);
  });

  it("bills nothing for a zero-rate rail", () => {
    expect(accrueRailInWindow(makeRail({ paymentRate: 0n }), WINDOW_START, WINDOW_END, INDEXED_EPOCH)).toBe(0n);
  });

  it("bills only the historical segment when the rail has since dropped to zero rate", () => {
    const rail = makeRail({
      paymentRate: 0n,
      segments: [{ startEpoch: 1_000n, untilEpoch: 1_020n, rate: 500n }],
    });
    expect(accrueRailInWindow(rail, WINDOW_START, WINDOW_END, INDEXED_EPOCH)).toBe(20n * 500n);
  });

  // Activation → settlement → rate change. Settlement advances `settledUpto`,
  // and the first rate change enqueues its segment from there rather than from
  // activation, so the epochs in between belong to no segment at all. Reading
  // only the stored segments bills 7_000 here instead of 12_000.
  describe("a rail settled before its first rate change", () => {
    // Created 900, ran at 100, settled through 1_050, changed to 200 at 1_080.
    const settledThenChanged = makeRail({
      createdAtEpoch: 900n,
      paymentRate: 200n,
      segments: [{ startEpoch: 1_050n, untilEpoch: 1_080n, rate: 100n }],
    });

    it("bills the epochs between activation and the first segment", () => {
      // (1000,1050] and (1050,1080] both at 100, then (1080,1100] at 200.
      expect(accrueRailInWindow(settledThenChanged, WINDOW_START, WINDOW_END, INDEXED_EPOCH)).toBe(
        50n * 100n + 30n * 100n + 20n * 200n,
      );
    });

    it("does not report a month lying entirely before the first segment as zero", () => {
      // The rail was charging all through this month; only the queue is silent.
      expect(accrueRailInWindow(settledThenChanged, 900n, 1_000n, INDEXED_EPOCH)).toBe(100n * 100n);
    });

    it("still honours the creation floor inside the reconstructed interval", () => {
      const created = makeRail({
        createdAtEpoch: 1_020n,
        paymentRate: 200n,
        segments: [{ startEpoch: 1_050n, untilEpoch: 1_080n, rate: 100n }],
      });
      expect(accrueRailInWindow(created, WINDOW_START, WINDOW_END, INDEXED_EPOCH)).toBe(
        30n * 100n + 30n * 100n + 20n * 200n,
      );
    });

    it("reconstructs from the earliest segment whatever order they arrive in", () => {
      const segments = [
        { startEpoch: 1_060n, untilEpoch: 1_080n, rate: 300n },
        { startEpoch: 1_050n, untilEpoch: 1_060n, rate: 100n },
      ];
      const reversed = makeRail({ createdAtEpoch: 900n, paymentRate: 200n, segments });
      // The leading interval must take 100 — the rate of the *earliest* segment,
      // not of whichever element happens to be first in the array.
      expect(accrueRailInWindow(reversed, WINDOW_START, WINDOW_END, INDEXED_EPOCH)).toBe(
        50n * 100n + 10n * 100n + 20n * 300n + 20n * 200n,
      );
    });
  });

  it("combines the creation floor with a rate change inside the same window", () => {
    const rail = makeRail({
      createdAtEpoch: 1_020n,
      paymentRate: 250n,
      // Overhangs the creation floor, so only the part after it may be billed.
      segments: [{ startEpoch: 1_000n, untilEpoch: 1_060n, rate: 100n }],
    });
    expect(accrueRailInWindow(rail, WINDOW_START, WINDOW_END, INDEXED_EPOCH)).toBe(40n * 100n + 40n * 250n);
  });
});
