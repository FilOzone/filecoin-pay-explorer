import { describe, expect, it } from "vitest";
import { formatDuration } from "./formatDuration";

describe("formatDuration", () => {
  it("reports sub-day runway without claiming it is gone", () => {
    expect(formatDuration(0)).toBe("less than a day");
  });

  it("reports a single day in the singular", () => {
    expect(formatDuration(1)).toBe("1 day");
  });

  it("reports exact days below the month boundary", () => {
    expect(formatDuration(12)).toBe("12 days");
  });

  it("still reports exact days at 29", () => {
    expect(formatDuration(29)).toBe("29 days");
  });

  it("switches to truncated months at 30", () => {
    expect(formatDuration(30)).toBe("+1 month");
  });

  it("truncates months down rather than rounding to the nearest", () => {
    expect(formatDuration(89)).toBe("+2 months");
  });

  it("still reports months at 364", () => {
    expect(formatDuration(364)).toBe("+12 months");
  });

  it("switches to truncated years at 365", () => {
    expect(formatDuration(365)).toBe("+1 year");
  });

  it("truncates years down rather than rounding to the nearest", () => {
    expect(formatDuration(5 * 365 + 364)).toBe("+5 years");
  });
});
