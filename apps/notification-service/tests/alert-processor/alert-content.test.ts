import { describe, expect, it } from "vitest";
import { type AccountSummary, DEFAULT_HEALTH_THRESHOLDS, deriveAccountHealth } from "../../alert-processor/account";
import { buildAlertContent } from "../../alert-processor/alert-content";

const NOW = Math.floor(new Date("2026-01-15T00:00:00Z").getTime() / 1000);
const EPOCHS_PER_DAY = 2880n;
const RATE = 10_000_000_000_000_000n; // 0.01 USDFC/epoch (1e16 base units)

describe("buildAlertContent", () => {
  it("derives display values for a wallet with runway left (warning)", () => {
    const summary: AccountSummary = {
      epoch: 1000n,
      runwayInEpochs: 20n * EPOCHS_PER_DAY, // 20 days
      lockupRatePerEpoch: RATE,
      debt: 0n,
    };
    const health = deriveAccountHealth(summary, DEFAULT_HEALTH_THRESHOLDS);
    expect(health.tier).toBe("warning");

    const content = buildAlertContent(summary, health, NOW);

    expect(content.daysRemaining).toBe(20);
    // 20 days of epochs * 30s/epoch after 2026-01-15 → 2026-02-04.
    expect(content.fundedUntilSec).toBe(NOW + 20 * 24 * 60 * 60);
    expect(content.fundedUntil).toBe("February 4, 2026");
  });

  it("treats an in-deficit account as 0 days remaining (emergency)", () => {
    const summary: AccountSummary = {
      epoch: 1000n,
      runwayInEpochs: 0n,
      lockupRatePerEpoch: RATE,
      debt: 5n * 10n ** 18n, // 5 USDFC owed
    };
    const health = deriveAccountHealth(summary, DEFAULT_HEALTH_THRESHOLDS);
    expect(health.tier).toBe("emergency");

    const content = buildAlertContent(summary, health, NOW);

    expect(content.daysRemaining).toBe(0);
    expect(content.fundedUntilSec).toBe(NOW);
    expect(content.fundedUntil).toBe("January 15, 2026");
  });

  it("keeps daysRemaining consistent with fundedUntil across a UTC midnight boundary", () => {
    // 20:00 UTC with 12h of runway → funds run out at 08:00 the next UTC day.
    const now = Math.floor(new Date("2026-01-15T20:00:00Z").getTime() / 1000);
    const summary: AccountSummary = {
      epoch: 1000n,
      runwayInEpochs: EPOCHS_PER_DAY / 2n, // 0.5 day = 12h
      lockupRatePerEpoch: RATE,
      debt: 0n,
    };
    const health = deriveAccountHealth(summary, DEFAULT_HEALTH_THRESHOLDS);

    const content = buildAlertContent(summary, health, now);

    // Funds run out on the 16th, so the day count must match it — not floor(0.5) = 0.
    expect(content.fundedUntil).toBe("January 16, 2026");
    expect(content.daysRemaining).toBe(1);
  });
});
