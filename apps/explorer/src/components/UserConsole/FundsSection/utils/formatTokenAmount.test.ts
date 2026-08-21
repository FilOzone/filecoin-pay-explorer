import { describe, expect, it } from "vitest";
import { formatTokenAmount } from "./formatTokenAmount";

/** 18 decimals, matching USDFC. */
const token = (whole: string) => BigInt(whole);

describe("formatTokenAmount", () => {
  it("renders an exact zero as a bare 0, not a padded one", () => {
    expect(formatTokenAmount(0n, 18)).toBe("0");
  });

  it("pads a whole number out to three decimals", () => {
    expect(formatTokenAmount(token("38000000000000000000"), 18)).toBe("38.000");
  });

  it("keeps the trailing zero on a two-decimal value", () => {
    expect(formatTokenAmount(token("38880000000000000000"), 18)).toBe("38.880");
  });

  it("groups thousands", () => {
    expect(formatTokenAmount(token("1500500000000000000000"), 18)).toBe("1,500.500");
  });

  describe("rounding direction", () => {
    // 38.8809… — the fourth decimal decides which way it breaks.
    const value = token("38880900000000000000");

    it("truncates by default, so a balance is never overstated", () => {
      expect(formatTokenAmount(value, 18)).toBe("38.880");
      expect(formatTokenAmount(value, 18, "down")).toBe("38.880");
    });

    it("rounds up when asked, so an amount owed is never understated", () => {
      expect(formatTokenAmount(value, 18, "up")).toBe("38.881");
    });

    it("leaves an exact value alone in both directions", () => {
      const exact = token("38880000000000000000");
      expect(formatTokenAmount(exact, 18, "down")).toBe("38.880");
      expect(formatTokenAmount(exact, 18, "up")).toBe("38.880");
    });
  });

  describe("amounts below the shown precision", () => {
    // 0.0004 — real, but smaller than the last decimal shown.
    const dust = token("400000000000000");

    it("flags a truncated dust balance instead of claiming it is zero", () => {
      expect(formatTokenAmount(dust, 18)).toBe("< 0.001");
    });

    it("flags the smallest possible non-zero balance", () => {
      expect(formatTokenAmount(1n, 18)).toBe("< 0.001");
    });

    it("lifts dust owed to the first shown decimal rather than hiding it", () => {
      expect(formatTokenAmount(dust, 18, "up")).toBe("0.001");
      expect(formatTokenAmount(1n, 18, "up")).toBe("0.001");
    });
  });

  describe("tokens with unusual decimals", () => {
    it("handles a token with fewer decimals than we display", () => {
      // 2-decimal token holding 12.34.
      expect(formatTokenAmount(1234n, 2)).toBe("12.340");
    });

    it("handles a token with no decimals", () => {
      expect(formatTokenAmount(7n, 0)).toBe("7.000");
    });

    it("handles a token with exactly three decimals", () => {
      expect(formatTokenAmount(7005n, 3)).toBe("7.005");
    });

    it("accepts the bigint decimals the subgraph types declare", () => {
      expect(formatTokenAmount(token("38880000000000000000"), 18n)).toBe("38.880");
    });
  });

  it("accepts the raw strings the GraphQL layer actually returns", () => {
    expect(formatTokenAmount("38880000000000000000", 18)).toBe("38.880");
  });

  it("stays exact past the float precision limit", () => {
    // 123456789012.345678901234567890 — unrepresentable as a double.
    expect(formatTokenAmount(token("123456789012345678901234567890"), 18)).toBe("123,456,789,012.345");
  });
});
