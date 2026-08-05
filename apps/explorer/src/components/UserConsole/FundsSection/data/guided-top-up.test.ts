import { describe, expect, it } from "vitest";
import { EPOCHS_PER_DAY } from "./funding-runway";
import { calculateProjectedFundingRunway, parseTopUpAmount } from "./guided-top-up";

const rate = 10_000_000_000_000n;
const now = 1_767_225_600n;

describe("guided top-up", () => {
  it("parses an editable 18-decimal USDFC amount", () => {
    expect(parseTopUpAmount("1.25")).toBe(1_250_000_000_000_000_000n);
    expect(parseTopUpAmount("0")).toBeNull();
    expect(parseTopUpAmount("not-a-number")).toBeNull();
  });

  it("projects a deposit from the existing Funds row", () => {
    const projected = calculateProjectedFundingRunway(
      {
        funds: 0n,
        lockupCurrent: rate * EPOCHS_PER_DAY,
        lockupLastSettledUntilTimestamp: now,
        lockupRate: rate,
      },
      rate * EPOCHS_PER_DAY * 366n,
      now,
    );

    expect(projected.status).toBe("long-term-funded");
    expect(projected.suggestedTopUp).toBe(0n);
  });
});
