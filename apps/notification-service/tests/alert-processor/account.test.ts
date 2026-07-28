import { maxUint256 } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The on-chain read is the only boundary — stub it, run everything else for real.
const { getAccountSummary } = vi.hoisted(() => ({ getAccountSummary: vi.fn() }));
vi.mock("@filoz/synapse-core/pay", () => ({ getAccountSummary }));

import {
  type AccountSummary,
  accountHealth,
  DEFAULT_HEALTH_THRESHOLDS,
  deriveAccountHealth,
  EPOCHS_PER_DAY,
  readAccountSummary,
} from "../../alert-processor/account";

const days = (n: number): bigint => BigInt(n) * EPOCHS_PER_DAY;

describe("deriveAccountHealth", () => {
  const defaultAccountSummary: AccountSummary = {
    runwayInEpochs: days(100),
    lockupRatePerEpoch: 1_000n,
    debt: 0n,
    epoch: 6_228_656n,
  };

  // A healthy, actively-spending account with plenty of runway; tests override
  // only the fields they care about.
  function summary(overrides: Partial<AccountSummary> = {}): AccountSummary {
    return { ...defaultAccountSummary, ...overrides };
  }

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

describe("readAccountSummary / accountHealth", () => {
  const client = {} as never; // getAccountSummary is stubbed; the client is never touched

  // The full SDK summary shape; the read should keep only the four fields the
  // health derivation needs and drop the rest.
  function sdkSummary(overrides: Record<string, bigint> = {}) {
    return {
      funds: 500n,
      availableFunds: 400n,
      debt: 0n,
      lockupRatePerEpoch: 1_000n,
      lockupRatePerMonth: 90_000n,
      totalLockup: 10n,
      totalFixedLockup: 2n,
      totalRateBasedLockup: 8n,
      runwayInEpochs: days(100),
      grossCoverageInEpochs: days(120),
      epoch: 6_228_656n,
      ...overrides,
    };
  }

  beforeEach(() => {
    getAccountSummary.mockReset();
  });

  it("narrows the SDK summary to the fields health derivation needs", async () => {
    getAccountSummary.mockResolvedValue(sdkSummary());

    const summary = await readAccountSummary(client, "0xabc");

    expect(summary).toEqual({
      runwayInEpochs: days(100),
      lockupRatePerEpoch: 1_000n,
      debt: 0n,
      epoch: 6_228_656n,
    });
  });

  it("reads the summary for the wallet it was asked about", async () => {
    getAccountSummary.mockImplementation((_c: unknown, { address }: { address: string }) =>
      Promise.resolve(sdkSummary({ debt: address === "0xdebtor" ? 42n : 0n })),
    );

    const debtor = await readAccountSummary(client, "0xdebtor");
    const solvent = await readAccountSummary(client, "0xsolvent");

    expect(debtor.debt).toBe(42n);
    expect(solvent.debt).toBe(0n);
  });

  it("reads and derives the tier in one call", async () => {
    getAccountSummary.mockResolvedValue(sdkSummary({ runwayInEpochs: days(20) }));

    const health = await accountHealth(client, "0xabc");

    expect(health.tier).toBe("warning");
  });
});
