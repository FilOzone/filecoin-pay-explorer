import { describe, expect, it } from "vitest";
import {
  calculateFundingRunway,
  calculateProjectedFundingRunway,
  EPOCHS_PER_DAY,
  type FundingPosition,
  formatFundedThrough,
  formatSuggestedTopUp,
  formatUsdfcAmount,
  ONE_YEAR_EPOCHS,
  parseFundingAmount,
  roundUpUnits,
} from "./funding-runway";

const rate = 10n;
const now = 1_000_000n;

function position(runwayInEpochs: bigint, overrides: Partial<FundingPosition> = {}): FundingPosition {
  return {
    funds: rate * runwayInEpochs,
    lockupCurrent: 0n,
    lockupLastSettledUntilTimestamp: now,
    lockupRate: rate,
    ...overrides,
  };
}

describe("calculateFundingRunway", () => {
  it.each([
    [ONE_YEAR_EPOCHS, "long-term-funded"],
    [ONE_YEAR_EPOCHS - 1n, "funded"],
    [30n * EPOCHS_PER_DAY, "funded"],
    [30n * EPOCHS_PER_DAY - 1n, "low"],
    [7n * EPOCHS_PER_DAY, "low"],
    [7n * EPOCHS_PER_DAY - 1n, "urgent"],
    [EPOCHS_PER_DAY, "urgent"],
    [EPOCHS_PER_DAY - 1n, "critical"],
  ] as const)("maps %i epochs to %s", (runwayInEpochs, status) => {
    expect(calculateFundingRunway(position(runwayInEpochs), now).status).toBe(status);
  });

  it("uses the Funds row settlement anchor", () => {
    const runwayInEpochs = 100n * EPOCHS_PER_DAY;
    const result = calculateFundingRunway(position(runwayInEpochs), now);

    expect(result.fundedThroughTimestamp).toBe(now + runwayInEpochs * 30n);
    expect(result.suggestedTopUp).toBe(rate * (ONE_YEAR_EPOCHS - runwayInEpochs));
  });

  it("accounts for time since settlement and accounts without active spend", () => {
    const settledYesterday = position(ONE_YEAR_EPOCHS, {
      lockupLastSettledUntilTimestamp: now - 24n * 60n * 60n,
    });
    expect(calculateFundingRunway(settledYesterday, now).status).toBe("funded");

    expect(calculateFundingRunway(position(0n, { funds: -1n, lockupRate: 0n }), now)).toMatchObject({
      status: "critical",
      suggestedTopUp: 1n,
    });
    expect(calculateFundingRunway(position(0n, { lockupRate: 0n }), now)).toMatchObject({
      fundedThroughTimestamp: null,
      status: "no-active-spend",
      suggestedTopUp: 0n,
    });
  });

  it("projects deposits and labels future dates as estimates", () => {
    const current = position(EPOCHS_PER_DAY);
    const projected = calculateProjectedFundingRunway(current, rate * EPOCHS_PER_DAY, now);

    expect(projected.fundedThroughTimestamp).toBe(now + 2n * EPOCHS_PER_DAY * 30n);
    expect(formatFundedThrough(projected, now, true)).toMatch(/^~/);
  });
});

describe("suggested top-up formatting", () => {
  it("rounds the suggestion up so the runway still reaches the target", () => {
    // 1.562290695640047227 USDFC -> "1.57" (rounded up, never down)
    expect(formatSuggestedTopUp(1_562_290_695_640_047_227n)).toBe("1.57");
    // already exact at 2dp stays put
    expect(formatSuggestedTopUp(1_500_000_000_000_000_000n)).toBe("1.5");
    expect(formatSuggestedTopUp(0n)).toBe("");
    expect(formatSuggestedTopUp(-5n)).toBe("");
  });

  it("rounds up to a chosen precision without dropping below the input", () => {
    expect(roundUpUnits(1_562_290_695_640_047_227n, 18, 2)).toBe(1_570_000_000_000_000_000n);
    expect(roundUpUnits(1_000_000_000_000_000_000n, 18, 2)).toBe(1_000_000_000_000_000_000n);
  });

  it("caps display precision without changing the deposited amount", () => {
    expect(formatUsdfcAmount(1_562_290_695_640_047_227n)).toBe("1.562291");
  });

  it("parses only positive funding amounts at the token precision", () => {
    expect(parseFundingAmount("1.25", 6)).toBe(1_250_000n);
    expect(parseFundingAmount("0", 18)).toBeNull();
    expect(parseFundingAmount("not-a-number", 18)).toBeNull();
  });
});
