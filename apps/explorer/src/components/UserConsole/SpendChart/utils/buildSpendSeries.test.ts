import { describe, expect, it } from "vitest";
import type { MonthWindow, RailSpendInput } from "../types";
import { buildSpendSeries } from "./buildSpendSeries";

const INDEXED_EPOCH = 5_000n;

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

const makeRail = (overrides: Partial<RailSpendInput> = {}): RailSpendInput => ({
  paymentRate: 0n,
  endEpoch: 0n,
  createdAtEpoch: 0n,
  segments: [],
  oneTimePayments: [],
  ...overrides,
});

describe("buildSpendSeries", () => {
  it("returns one row per window, carrying its labels through", () => {
    const windows = [makeWindow(1), makeWindow(2, { isPartial: true })];
    const rows = buildSpendSeries([], windows, INDEXED_EPOCH);

    expect(rows.map((row) => row.label)).toEqual(["M1", "M2"]);
    expect(rows.map((row) => row.fullLabel)).toEqual(["Month 1", "Month 2"]);
    expect(rows.map((row) => row.isPartial)).toEqual([false, true]);
  });

  it("renders a month with no activity as a zero row rather than dropping it", () => {
    const windows = [makeWindow(1), makeWindow(2)];
    const rail = makeRail({ paymentRate: 10n, createdAtEpoch: 200n });

    const rows = buildSpendSeries([rail], windows, INDEXED_EPOCH);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ streaming: 0n, oneTime: 0n, total: 0n });
    expect(rows[1].streaming).toBe(100n * 10n);
  });

  it("sums streaming accrual across every rail", () => {
    const windows = [makeWindow(1)];
    const rails = [makeRail({ paymentRate: 10n }), makeRail({ paymentRate: 25n })];

    expect(buildSpendSeries(rails, windows, INDEXED_EPOCH)[0].streaming).toBe(100n * 35n);
  });

  it("buckets one-time payments into the month containing them", () => {
    const windows = [makeWindow(1), makeWindow(2)];
    const rail = makeRail({
      oneTimePayments: [
        { amount: 7n, timestamp: 1_500n },
        { amount: 11n, timestamp: 2_500n },
      ],
    });

    const rows = buildSpendSeries([rail], windows, INDEXED_EPOCH);

    expect(rows[0].oneTime).toBe(7n);
    expect(rows[1].oneTime).toBe(11n);
  });

  it("counts a payment on a month boundary once, in the month it opens", () => {
    const windows = [makeWindow(1), makeWindow(2)];
    const rail = makeRail({ oneTimePayments: [{ amount: 5n, timestamp: 2_000n }] });

    const rows = buildSpendSeries([rail], windows, INDEXED_EPOCH);

    expect(rows[0].oneTime).toBe(0n);
    expect(rows[1].oneTime).toBe(5n);
  });

  it("ignores payments outside the charted range", () => {
    const windows = [makeWindow(1)];
    const rail = makeRail({
      oneTimePayments: [
        { amount: 5n, timestamp: 500n },
        { amount: 9n, timestamp: 9_000n },
      ],
    });

    expect(buildSpendSeries([rail], windows, INDEXED_EPOCH)[0].oneTime).toBe(0n);
  });

  it("totals the two stacked segments", () => {
    const windows = [makeWindow(1)];
    const rail = makeRail({ paymentRate: 10n, oneTimePayments: [{ amount: 42n, timestamp: 1_500n }] });

    const [row] = buildSpendSeries([rail], windows, INDEXED_EPOCH);

    expect(row.streaming).toBe(1_000n);
    expect(row.oneTime).toBe(42n);
    expect(row.total).toBe(1_042n);
  });

  it("returns zero rows when the account has no rails", () => {
    const rows = buildSpendSeries([], [makeWindow(1)], INDEXED_EPOCH);

    expect(rows[0]).toMatchObject({ streaming: 0n, oneTime: 0n, total: 0n });
  });
});
