import { TIME_CONSTANTS } from "@filoz/synapse-sdk";

/** Runway-based health tiers, ordered by urgency. */
export type HealthTier = "healthy" | "warning" | "critical" | "emergency";

/** Runway thresholds in whole days. A tier fires when runway is strictly below its value. */
export type HealthThresholds = {
  warning: number;
  critical: number;
  emergency: number;
};

/**
 * The subset of the Synapse account summary (`synapse.payments.accountSummary`)
 * this derivation needs.
 */
export type AccountSummary = {
  /** Epochs until the account enters deficit; `maxUint256` when nothing is spent, `0n` when already in deficit. */
  runwayInEpochs: bigint;
  /** Aggregate per-epoch lockup rate; `0n` means no active storage spend. */
  lockupRatePerEpoch: bigint;
  /** Outstanding obligation the account can't cover; `> 0n` means it is already in deficit. */
  debt: bigint;
  /** The epoch the summary was evaluated at. */
  epoch: bigint;
};

export type AccountHealth = {
  tier: HealthTier;
  /** Whole days of runway (floored). `Infinity` when there is no active spend. */
  runwayDays: number;
  /** Absolute epoch funds run out (`epoch + runwayInEpochs`); `null` when there is no active spend. */
  fundedUntilEpoch: bigint | null;
};

export const EPOCHS_PER_DAY = TIME_CONSTANTS.EPOCHS_PER_DAY;

/**
 * Default runway thresholds (days) — the single source of truth for the tier
 * cut-offs.
 */
export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  warning: 30,
  critical: 7,
  emergency: 3,
};

/**
 * Derives account health from a Synapse account summary.
 *
 * Runway comes straight from the SDK's `runwayInEpochs` (reserve-aware, the same
 * value the filecoin-pin `payments status` command reports).
 * Tiers are compared in epoch-space so the day-threshold
 * boundaries stay exact rather than being distorted by day truncation.
 */
export function deriveAccountHealth(summary: AccountSummary, thresholds: HealthThresholds): AccountHealth {
  // No active storage spend → nothing can run out.
  if (summary.lockupRatePerEpoch === 0n) {
    return { tier: "healthy", runwayDays: Number.POSITIVE_INFINITY, fundedUntilEpoch: null };
  }

  // Already in deficit: funds no longer cover active rails, so a provider can
  // terminate at any time even though the user can still top up. Most urgent.
  if (summary.debt > 0n || summary.runwayInEpochs === 0n) {
    return { tier: "emergency", runwayDays: 0, fundedUntilEpoch: summary.epoch };
  }

  const runway = summary.runwayInEpochs;
  const health = {
    runwayDays: Number(runway / EPOCHS_PER_DAY),
    fundedUntilEpoch: summary.epoch + runway,
  };

  if (runway < BigInt(thresholds.emergency) * EPOCHS_PER_DAY) return { tier: "emergency", ...health };
  if (runway < BigInt(thresholds.critical) * EPOCHS_PER_DAY) return { tier: "critical", ...health };
  if (runway < BigInt(thresholds.warning) * EPOCHS_PER_DAY) return { tier: "warning", ...health };
  return { tier: "healthy", ...health };
}
