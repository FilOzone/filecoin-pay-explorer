import { describe, expect, it } from "vitest";
import { EPOCH_DURATION } from "@/utils/constants";
import { buildMonthWindows, MONTHS_SHOWN } from "./buildMonthWindows";

const GENESIS = 0n;

// Labels are locale- and timezone-dependent, so assert their shape rather than
// literals: the runner's timezone differs from CI's.
const SHORT_MONTH = /^\S.*$/;
const MONTH_WITH_YEAR = /\d{4}/;

const secondsOf = (date: Date) => BigInt(Math.floor(date.getTime() / 1_000));

describe("buildMonthWindows", () => {
  it("returns six months ending with the one `now` falls in", () => {
    const now = new Date(2026, 7, 21, 12, 0, 0);
    const windows = buildMonthWindows(now, GENESIS);

    expect(windows).toHaveLength(MONTHS_SHOWN);

    const last = windows[MONTHS_SHOWN - 1];
    expect(last.startTimestamp).toBe(secondsOf(new Date(2026, 7, 1)));
    expect(last.endTimestamp).toBe(secondsOf(new Date(2026, 8, 1)));
  });

  it("orders windows oldest first", () => {
    const windows = buildMonthWindows(new Date(2026, 7, 21), GENESIS);

    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].startTimestamp > windows[i - 1].startTimestamp).toBe(true);
    }
  });

  it("tiles the range with no gap and no overlap", () => {
    const windows = buildMonthWindows(new Date(2026, 7, 21), GENESIS);

    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].startEpoch).toBe(windows[i - 1].endEpoch);
      expect(windows[i].startTimestamp).toBe(windows[i - 1].endTimestamp);
    }
  });

  it("rolls the year back when the range straddles January", () => {
    const now = new Date(2026, 1, 15);
    const windows = buildMonthWindows(now, GENESIS);

    expect(windows[0].startTimestamp).toBe(secondsOf(new Date(2025, 8, 1)));
    expect(windows[MONTHS_SHOWN - 1].startTimestamp).toBe(secondsOf(new Date(2026, 1, 1)));
  });

  it("marks only the current month partial", () => {
    const windows = buildMonthWindows(new Date(2026, 7, 21), GENESIS);

    expect(windows.slice(0, MONTHS_SHOWN - 1).every((window) => !window.isPartial)).toBe(true);
    expect(windows[MONTHS_SHOWN - 1].isPartial).toBe(true);
  });

  it("labels every month, carrying a year on the long form", () => {
    const windows = buildMonthWindows(new Date(2026, 7, 21), GENESIS);

    for (const window of windows) {
      expect(window.label).toMatch(SHORT_MONTH);
      expect(window.fullLabel).toMatch(MONTH_WITH_YEAR);
    }
  });

  it("anchors epochs on genesis rather than on the current time", () => {
    const now = new Date(2026, 7, 21);
    const genesis = secondsOf(new Date(2020, 0, 1));
    const windows = buildMonthWindows(now, genesis);

    const first = windows[0];
    expect(first.startEpoch).toBe((first.startTimestamp - genesis) / BigInt(EPOCH_DURATION));
  });

  it("honours a caller-supplied month count", () => {
    expect(buildMonthWindows(new Date(2026, 7, 21), GENESIS, 3)).toHaveLength(3);
  });
});
