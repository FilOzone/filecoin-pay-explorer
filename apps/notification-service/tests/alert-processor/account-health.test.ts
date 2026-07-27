import { maxUint256 } from "viem";
import { describe, expect, it } from "vitest";
import {
  type AccountSummary,
  DEFAULT_HEALTH_THRESHOLDS,
  deriveAccountHealth,
  EPOCHS_PER_DAY,
} from "../../alert-processor/account-health";

const days = (n: number): bigint => BigInt(n) * EPOCHS_PER_DAY;

const defaultAccountSummary: AccountSummary = {
  runwayInEpochs: days(100),
  lockupRatePerEpoch: 1_000n,
  debt: 0n,
  epoch: 6_228_656n,
};

// A healthy, actively-spending account with plenty of runway; tests override
// only the fields they care about.
function summary(overrides: Partial<AccountSummary> = {}): AccountSummary {
  return {
    ...defaultAccountSummary,
    ...overrides,
  };
}

describe("deriveAccountHealth", () => {
  it("reports healthy with infinite runway when nothing is being spent", () => {
    const health = deriveAccountHealth(
      // runwayInEpochs is maxUint256 in this case, but the rate short-circuits it.
      summary({ lockupRatePerEpoch: 0n, runwayInEpochs: maxUint256 }),
      DEFAULT_HEALTH_THRESHOLDS,
    );

    expect(health).toEqual({ tier: "healthy", runwayDays: Number.POSITIVE_INFINITY, fundedUntilEpoch: null });
  });

  it("treats a positive debt as emergency — already in deficit", () => {
    const health = deriveAccountHealth(summary({ debt: 500n, runwayInEpochs: 0n }), DEFAULT_HEALTH_THRESHOLDS);

    expect(health).toEqual({ tier: "emergency", runwayDays: 0, fundedUntilEpoch: defaultAccountSummary.epoch });
  });

  it("treats zero runway as emergency even without recorded debt", () => {
    const health = deriveAccountHealth(summary({ runwayInEpochs: 0n }), DEFAULT_HEALTH_THRESHOLDS);

    expect(health.tier).toBe("emergency");
    expect(health.fundedUntilEpoch).toBe(defaultAccountSummary.epoch);
  });

  it.each([
    [100, "healthy"],
    [30, "healthy"], // strict threshold: exactly 30 days is not yet a warning
    [29, "warning"],
    [7, "warning"], // exactly at the critical cut-off stays warning
    [6, "critical"],
    [3, "critical"], // exactly at the emergency cut-off stays critical
    [2, "emergency"],
  ])("maps %i days of runway to %s", (runwayDays, tier) => {
    const health = deriveAccountHealth(summary({ runwayInEpochs: days(runwayDays) }), DEFAULT_HEALTH_THRESHOLDS);

    expect(health.tier).toBe(tier);
  });

  it("floors runwayDays and returns the absolute fundedUntilEpoch", () => {
    const runwayInEpochs = days(15) + 1_000n; // 15 days plus a partial day
    const health = deriveAccountHealth(summary({ runwayInEpochs, epoch: 1_000_000n }), DEFAULT_HEALTH_THRESHOLDS);

    expect(health.runwayDays).toBe(15);
    expect(health.fundedUntilEpoch).toBe(1_000_000n + runwayInEpochs);
    expect(health.tier).toBe("warning");
  });
});
