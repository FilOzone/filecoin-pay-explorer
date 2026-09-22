import { describe, expect, it } from "vitest";
import { formatBytes, formatFutureTimestamp, formatTokenCeiling } from "./formatter";

/**
 * Boundary tests for the unit the function picks. The absolute calendar day a
 * timestamp lands on depends on the runner's timezone, so the date cases assert
 * the *shape* of the output — that is what identifies the branch taken, and it
 * holds in any timezone.
 */

const MINUTE = 60n;
const HOUR = 60n * MINUTE;
const DAY = 24n * HOUR;

/** Mid-year and mid-day, so no case sits near a midnight or new-year edge. */
const NOW = BigInt(Math.floor(Date.UTC(2026, 5, 15, 12, 0, 0) / 1000));

const inSeconds = (seconds: bigint) => formatFutureTimestamp(NOW + seconds, NOW);

/** "Jun 16" — a date with the year omitted. */
const DATE_WITHOUT_YEAR = /^[A-Z][a-z]{2} \d{1,2}$/;
/** "Jul 20, 2027" — a date carrying the year. */
const DATE_WITH_YEAR = /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/;

describe("formatFutureTimestamp", () => {
  describe("non-future timestamps", () => {
    it("reports a timestamp in the past as expired", () => {
      expect(inSeconds(-1n)).toBe("Expired");
      expect(inSeconds(-10n * DAY)).toBe("Expired");
    });

    it("reports the present moment as expired", () => {
      expect(inSeconds(0n)).toBe("Expired");
    });

    it("collapses under a minute to now", () => {
      expect(inSeconds(1n)).toBe("Now");
      expect(inSeconds(59n)).toBe("Now");
    });
  });

  describe("minutes below the first hour", () => {
    it("counts whole minutes", () => {
      expect(inSeconds(MINUTE)).toBe("1m");
      expect(inSeconds(59n * MINUTE)).toBe("59m");
    });
  });

  describe("the hour boundary", () => {
    it("switches to hours at exactly one hour", () => {
      expect(inSeconds(HOUR)).toBe("1h 0m");
    });

    it("keeps hours through the second hour rather than counting past 60 minutes", () => {
      expect(inSeconds(HOUR + 59n * MINUTE)).toBe("1h 59m");
    });

    it("counts hours and remainder minutes up to the day boundary", () => {
      expect(inSeconds(2n * HOUR)).toBe("2h 0m");
      expect(inSeconds(23n * HOUR + 59n * MINUTE)).toBe("23h 59m");
    });
  });

  describe("the day boundary", () => {
    it("switches to a date at exactly one day", () => {
      expect(inSeconds(DAY)).toMatch(DATE_WITHOUT_YEAR);
    });

    it("stays a date through the second day rather than counting past 24 hours", () => {
      expect(inSeconds(DAY + 23n * HOUR)).toMatch(DATE_WITHOUT_YEAR);
      expect(inSeconds(2n * DAY)).toMatch(DATE_WITHOUT_YEAR);
    });
  });

  describe("the year in a date", () => {
    it("omits the year for a date in the current year", () => {
      expect(inSeconds(30n * DAY)).toMatch(DATE_WITHOUT_YEAR);
    });

    it("keeps the year once the date falls outside the current year", () => {
      expect(inSeconds(400n * DAY)).toMatch(DATE_WITH_YEAR);
    });
  });

  describe("the far horizon", () => {
    it("gives an approximate year count from ten years out", () => {
      expect(inSeconds(3650n * DAY)).toBe("~10 years");
      expect(inSeconds(4015n * DAY)).toBe("~11 years");
    });

    it("still gives a date just below ten years", () => {
      expect(inSeconds(3600n * DAY)).toMatch(DATE_WITH_YEAR);
    });
  });

  it("defaults the reference point to now", () => {
    const twoHoursFromNow = BigInt(Math.floor(Date.now() / 1000)) + 2n * HOUR;

    expect(formatFutureTimestamp(twoHoursFromNow)).toMatch(/^1h 59m$|^2h 0m$/);
  });
});

describe("formatBytes", () => {
  const KiB = 1024n;
  const MiB = 1024n * KiB;
  const GiB = 1024n * MiB;
  const TiB = 1024n * GiB;

  it("shows zero and negative sizes as 0 B", () => {
    expect(formatBytes(0n)).toBe("0 B");
    expect(formatBytes(-1n)).toBe("0 B");
  });

  it("stays in the unit below one full unit up", () => {
    expect(formatBytes(KiB - 1n)).toBe("1023 B");
    expect(formatBytes(MiB - 1n)).toBe("1024.00 KiB");
  });

  it("switches units at exactly one unit", () => {
    expect(formatBytes(KiB)).toBe("1.00 KiB");
    expect(formatBytes(MiB)).toBe("1.00 MiB");
    expect(formatBytes(GiB)).toBe("1.00 GiB");
    expect(formatBytes(TiB)).toBe("1.00 TiB");
  });

  it("picks the largest unit the size clears", () => {
    expect(formatBytes(2n * TiB + 512n * GiB)).toBe("2.50 TiB");
  });
});

describe("formatTokenCeiling", () => {
  it("ceils without converting the amount to a number", () => {
    expect(formatTokenCeiling(1_003_010_000_000_000_000n, 18, "USDFC", 4)).toBe("1.0031 USDFC");
    expect(formatTokenCeiling(1_003_000_000_000_000_000n, 18, "USDFC", 4)).toBe("1.003 USDFC");
  });
});
