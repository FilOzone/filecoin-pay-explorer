import { describe, expect, it } from "vitest";
import type { MonthWindow, SpendHistory } from "../types";
import { buildSpendSeries } from "./buildSpendSeries";

const INDEXED_EPOCH = 5_000n;

const STORACHA = "0x000000000000000000000000000000000000000a";
const FWSS = "0x000000000000000000000000000000000000000b";

/** Window `n` spans epochs `(n×100, (n+1)×100]` and timestamps `[n×1000, (n+1)×1000)`. */
const makeWindow = (index: number, overrides: Partial<MonthWindow> = {}): MonthWindow => ({
  label: `M${index}`,
  fullLabel: `Month ${index}`,
  startEpoch: BigInt(index) * 100n,
  endEpoch: BigInt(index + 1) * 100n,
  startTimestamp: BigInt(index) * 1_000n,
  endTimestamp: BigInt(index + 1) * 1_000n,
  isPartial: false,
  ...overrides,
});

const makeHistory = (overrides: Partial<SpendHistory> = {}): SpendHistory => ({
  periods: [],
  oneTimePayments: [],
  ...overrides,
});

describe("buildSpendSeries", () => {
  it("returns one row per window, carrying its labels through", () => {
    const windows = [makeWindow(1), makeWindow(2, { isPartial: true })];
    const rows = buildSpendSeries(makeHistory(), windows, INDEXED_EPOCH);

    expect(rows.map((row) => row.label)).toEqual(["M1", "M2"]);
    expect(rows.map((row) => row.fullLabel)).toEqual(["Month 1", "Month 2"]);
    expect(rows.map((row) => row.isPartial)).toEqual([false, true]);
  });

  it("totals to zero for records that contribute to no month", () => {
    // The caller reads emptiness off the totals, so a history that only carries
    // non-contributing records — a zero-rate period, or one outside the range —
    // has to come back as zeros rather than as arbitrary bars.
    const windows = [makeWindow(1), makeWindow(2)];
    const history = makeHistory({
      periods: [
        { rate: 0n, startEpoch: 0n, untilEpoch: null, operatorAddress: STORACHA },
        { rate: 50n, startEpoch: 900n, untilEpoch: 950n, operatorAddress: FWSS },
      ],
    });

    const rows = buildSpendSeries(history, windows, INDEXED_EPOCH);

    expect(rows.every((row) => row.total === 0n)).toBe(true);
    expect(rows.every((row) => row.byOperator.length === 0)).toBe(true);
  });

  it("renders a month with no activity as a zero row rather than dropping it", () => {
    const windows = [makeWindow(1), makeWindow(2)];
    const history = makeHistory({
      periods: [{ rate: 10n, startEpoch: 200n, untilEpoch: null, operatorAddress: STORACHA }],
    });

    const rows = buildSpendSeries(history, windows, INDEXED_EPOCH);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ streaming: 0n, oneTime: 0n, total: 0n, byOperator: [] });
    expect(rows[1].streaming).toBe(100n * 10n);
  });

  it("sums concurrent periods from different rails into the same month", () => {
    const windows = [makeWindow(1)];
    const history = makeHistory({
      periods: [
        { rate: 10n, startEpoch: 0n, untilEpoch: null, operatorAddress: STORACHA },
        { rate: 4n, startEpoch: 0n, untilEpoch: null, operatorAddress: STORACHA },
      ],
    });

    // Overlapping rails are meant to be added, not merged — this is why the
    // history is flat rather than grouped by rail.
    expect(buildSpendSeries(history, windows, INDEXED_EPOCH)[0].streaming).toBe(100n * 14n);
  });

  it("bills each side of a mid-month rate change at its own rate", () => {
    const windows = [makeWindow(1)];
    const history = makeHistory({
      periods: [
        { rate: 10n, startEpoch: 0n, untilEpoch: 150n, operatorAddress: STORACHA },
        { rate: 2n, startEpoch: 150n, untilEpoch: null, operatorAddress: STORACHA },
      ],
    });

    // (100, 150] at 10 plus (150, 200] at 2.
    expect(buildSpendSeries(history, windows, INDEXED_EPOCH)[0].streaming).toBe(50n * 10n + 50n * 2n);
  });

  describe("one-time payments", () => {
    it("buckets a payment into the window containing its timestamp", () => {
      const windows = [makeWindow(1), makeWindow(2)];
      const history = makeHistory({
        oneTimePayments: [{ amount: 70n, timestamp: 2_500n, operatorAddress: STORACHA }],
      });

      const rows = buildSpendSeries(history, windows, INDEXED_EPOCH);

      expect(rows[0].oneTime).toBe(0n);
      expect(rows[1].oneTime).toBe(70n);
    });

    it("counts a payment on a window boundary once, in the window it opens", () => {
      const windows = [makeWindow(1), makeWindow(2)];
      const history = makeHistory({
        oneTimePayments: [{ amount: 70n, timestamp: 2_000n, operatorAddress: STORACHA }],
      });

      const rows = buildSpendSeries(history, windows, INDEXED_EPOCH);

      expect(rows[0].oneTime).toBe(0n);
      expect(rows[1].oneTime).toBe(70n);
    });

    it("ignores payments outside the charted range", () => {
      const windows = [makeWindow(1)];
      const history = makeHistory({
        oneTimePayments: [
          { amount: 70n, timestamp: 500n, operatorAddress: STORACHA },
          { amount: 90n, timestamp: 9_000n, operatorAddress: STORACHA },
        ],
      });

      expect(buildSpendSeries(history, windows, INDEXED_EPOCH)[0].oneTime).toBe(0n);
    });
  });

  describe("by operator", () => {
    it("splits a month across the services that earned it", () => {
      const windows = [makeWindow(1)];
      const history = makeHistory({
        periods: [
          { rate: 10n, startEpoch: 0n, untilEpoch: null, operatorAddress: STORACHA },
          { rate: 3n, startEpoch: 0n, untilEpoch: null, operatorAddress: FWSS },
        ],
      });

      expect(buildSpendSeries(history, windows, INDEXED_EPOCH)[0].byOperator).toEqual([
        { address: STORACHA, amount: 1_000n },
        { address: FWSS, amount: 300n },
      ]);
    });

    it("combines streaming and one-time under the same service", () => {
      const windows = [makeWindow(1)];
      const history = makeHistory({
        periods: [{ rate: 10n, startEpoch: 0n, untilEpoch: null, operatorAddress: STORACHA }],
        oneTimePayments: [{ amount: 55n, timestamp: 1_500n, operatorAddress: STORACHA }],
      });

      expect(buildSpendSeries(history, windows, INDEXED_EPOCH)[0].byOperator).toEqual([
        { address: STORACHA, amount: 1_055n },
      ]);
    });

    it("orders services largest first", () => {
      const windows = [makeWindow(1)];
      const history = makeHistory({
        periods: [
          { rate: 2n, startEpoch: 0n, untilEpoch: null, operatorAddress: STORACHA },
          { rate: 9n, startEpoch: 0n, untilEpoch: null, operatorAddress: FWSS },
        ],
      });

      expect(buildSpendSeries(history, windows, INDEXED_EPOCH)[0].byOperator.map((entry) => entry.address)).toEqual([
        FWSS,
        STORACHA,
      ]);
    });

    it("breaks ties on address so the order is stable across refetches", () => {
      const windows = [makeWindow(1)];
      const history = makeHistory({
        periods: [
          { rate: 5n, startEpoch: 0n, untilEpoch: null, operatorAddress: FWSS },
          { rate: 5n, startEpoch: 0n, untilEpoch: null, operatorAddress: STORACHA },
        ],
      });

      expect(buildSpendSeries(history, windows, INDEXED_EPOCH)[0].byOperator.map((entry) => entry.address)).toEqual([
        STORACHA,
        FWSS,
      ]);
    });

    it("omits a service that contributed nothing to the month", () => {
      const windows = [makeWindow(1)];
      const history = makeHistory({
        periods: [
          { rate: 10n, startEpoch: 0n, untilEpoch: null, operatorAddress: STORACHA },
          // Zero-rate, i.e. created but not yet charging.
          { rate: 0n, startEpoch: 0n, untilEpoch: null, operatorAddress: FWSS },
        ],
      });

      expect(buildSpendSeries(history, windows, INDEXED_EPOCH)[0].byOperator).toEqual([
        { address: STORACHA, amount: 1_000n },
      ]);
    });

    it("sums to the month's total", () => {
      const windows = [makeWindow(1)];
      const history = makeHistory({
        periods: [
          { rate: 10n, startEpoch: 0n, untilEpoch: null, operatorAddress: STORACHA },
          { rate: 3n, startEpoch: 0n, untilEpoch: null, operatorAddress: FWSS },
        ],
        oneTimePayments: [{ amount: 40n, timestamp: 1_500n, operatorAddress: FWSS }],
      });

      const row = buildSpendSeries(history, windows, INDEXED_EPOCH)[0];
      const summed = row.byOperator.reduce((total, entry) => total + entry.amount, 0n);

      expect(summed).toBe(row.total);
    });
  });
});
