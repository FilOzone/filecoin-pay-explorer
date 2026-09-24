import { describe, expect, it } from "vitest";
import { resolveSnoozeUntil, snoozeDateRange } from "./snooze";

const NOW_MS = new Date("2026-09-24T10:00:00").getTime();
const NOW_SEC = BigInt(Math.floor(NOW_MS / 1000));
const DAY = 86_400n;

const endOfLocalDay = (date: string) => BigInt(Math.floor(new Date(`${date}T23:59:59`).getTime() / 1000));

describe("resolveSnoozeUntil", () => {
  it("adds the preset's days to now", () => {
    expect(resolveSnoozeUntil("0", "", NOW_MS)).toBe(NOW_SEC + 30n * DAY);
    expect(resolveSnoozeUntil("1", "", NOW_MS)).toBe(NOW_SEC + 90n * DAY);
    expect(resolveSnoozeUntil("2", "", NOW_MS)).toBe(NOW_SEC + 365n * DAY);
  });

  it("accepts custom dates from today up to a year out, as the end of that local day", () => {
    const { min, max } = snoozeDateRange(NOW_MS);
    expect([min, max]).toEqual(["2026-09-24", "2027-09-24"]);

    expect(resolveSnoozeUntil("custom", min, NOW_MS)).toBe(endOfLocalDay(min));
    expect(resolveSnoozeUntil("custom", max, NOW_MS)).toBe(endOfLocalDay(max));
  });

  it("rejects a custom date past a year, in the past, or missing", () => {
    expect(resolveSnoozeUntil("custom", "2027-09-25", NOW_MS)).toBeNull();
    expect(resolveSnoozeUntil("custom", "2026-09-23", NOW_MS)).toBeNull();
    expect(resolveSnoozeUntil("custom", "", NOW_MS)).toBeNull();
  });
});
