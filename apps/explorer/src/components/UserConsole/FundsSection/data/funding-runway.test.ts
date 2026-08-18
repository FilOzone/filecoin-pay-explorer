import { TIME_CONSTANTS } from "@filoz/synapse-sdk";
import { describe, expect, it } from "vitest";
import {
  calculateFundingRunway,
  calculateProjectedFundingRunway,
  EPOCHS_PER_DAY,
  FUNDING_TARGETS,
  type FundingAccountSummary,
  formatFundedThrough,
  formatSuggestedTopUp,
  formatUsdfcAmount,
  ONE_YEAR_EPOCHS,
  parseFundingAmount,
  roundUpUnits,
} from "./funding-runway";

const rate = 10n;
const epoch = 1_000n;
const genesisTimestamp = 1_598_306_400;
const bufferEpochs = TIME_CONSTANTS.EPOCHS_PER_HOUR / 4n;

function summary(runwayInEpochs: bigint, overrides: Partial<FundingAccountSummary> = {}): FundingAccountSummary {
  return {
    availableFunds: rate * runwayInEpochs,
    debt: 0n,
    epoch,
    lockupRatePerEpoch: rate,
    runwayInEpochs,
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
    expect(calculateFundingRunway(summary(runwayInEpochs), ONE_YEAR_EPOCHS, genesisTimestamp).status).toBe(status);
  });

  it("uses the SDK summary and selected target", () => {
    const current = summary(EPOCHS_PER_DAY);
    const month = calculateFundingRunway(current, FUNDING_TARGETS.month.epochs, genesisTimestamp);
    const year = calculateFundingRunway(current, FUNDING_TARGETS.year.epochs, genesisTimestamp);

    expect(month.suggestedTopUp).toBe(rate * (FUNDING_TARGETS.month.epochs - EPOCHS_PER_DAY + bufferEpochs));
    expect(year.suggestedTopUp).toBe(rate * (FUNDING_TARGETS.year.epochs - EPOCHS_PER_DAY + bufferEpochs));
    expect(year.fundedThroughTimestamp).toBe(
      BigInt(genesisTimestamp) + (epoch + EPOCHS_PER_DAY) * BigInt(TIME_CONSTANTS.EPOCH_DURATION),
    );
  });

  it("includes debt and handles accounts without active spend", () => {
    const underfunded = summary(0n, { availableFunds: 0n, debt: 50n });
    expect(calculateFundingRunway(underfunded, FUNDING_TARGETS.month.epochs, genesisTimestamp).suggestedTopUp).toBe(
      50n + rate * (FUNDING_TARGETS.month.epochs + bufferEpochs),
    );

    expect(
      calculateFundingRunway(
        summary(0n, { availableFunds: 0n, lockupRatePerEpoch: 0n }),
        FUNDING_TARGETS.year.epochs,
        genesisTimestamp,
      ),
    ).toMatchObject({ fundedThroughTimestamp: null, status: "no-active-spend", suggestedTopUp: 0n });
  });

  it("projects a deposit without reimplementing settlement", () => {
    const projected = calculateProjectedFundingRunway(
      summary(EPOCHS_PER_DAY),
      rate * ONE_YEAR_EPOCHS,
      FUNDING_TARGETS.year.epochs,
      genesisTimestamp,
    );

    expect(projected.status).toBe("long-term-funded");
    expect(projected.suggestedTopUp).toBe(0n);
    expect(formatFundedThrough(projected, true)).toMatch(/^~/);
  });
});

describe("suggested top-up formatting", () => {
  it("rounds the suggestion up so the runway still reaches the target", () => {
    expect(formatSuggestedTopUp(1_562_290_695_640_047_227n)).toBe("1.57");
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
