import { maxUint256 } from "viem";

/** Runway-based health tiers: "healthy" (nothing to act on) plus the actionable alert levels. */
export type HealthTier = "healthy" | "warning" | "critical" | "emergency";

/**
 * Runway thresholds in whole days. A tier applies when the remaining runway is
 * strictly below its value.
 *
 * Mirrors `DEFAULT_HEALTH_THRESHOLDS` in the notification service so the console
 * and the alert emails agree about when an account is at risk.
 */
export const HEALTH_THRESHOLD_DAYS = {
  warning: 30,
  critical: 7,
  emergency: 3,
} as const;

export type FundsHealth = {
  tier: HealthTier;
  /** Whole days of runway (floored); `null` when there is no active spend. */
  daysRemaining: number | null;
  /** True once funds have run out at `currentTimestamp`. */
  isExpired: boolean;
};

const SECONDS_PER_DAY = 24n * 60n * 60n;

/**
 * Derives the health tier of a token balance from when its funds run out.
 *
 * Compared in timestamp-space (unix seconds), the same space
 * `calculateFundedUntil` produces.
 */
export const deriveFundsHealth = (fundedUntilTimestamp: bigint, currentTimestamp: bigint): FundsHealth => {
  // `maxUint256` means "no clock is ticking" — not "nothing is locked". A zero-rate
  // account can still hold fixed lockup, which the Locked card reports separately.
  //
  // Calling it healthy is safe rather than merely convenient: debt is structurally
  // `0n` whenever `lockupRate === 0n` (see `calculateFundedUntil`), so no
  // debt-bearing account can hide behind this branch. That is also why this
  // derivation needs no debt-first branch to agree with the notification service,
  // which checks debt before spend rate.
  if (fundedUntilTimestamp === maxUint256) {
    return { tier: "healthy", daysRemaining: null, isExpired: false };
  }

  // Funds already exhausted → termination imminent.
  if (fundedUntilTimestamp <= currentTimestamp) {
    return { tier: "emergency", daysRemaining: 0, isExpired: true };
  }

  const secondsRemaining = fundedUntilTimestamp - currentTimestamp;
  const daysRemaining = Number(secondsRemaining / SECONDS_PER_DAY);

  if (secondsRemaining < BigInt(HEALTH_THRESHOLD_DAYS.emergency) * SECONDS_PER_DAY) {
    return { tier: "emergency", daysRemaining, isExpired: false };
  }
  if (secondsRemaining < BigInt(HEALTH_THRESHOLD_DAYS.critical) * SECONDS_PER_DAY) {
    return { tier: "critical", daysRemaining, isExpired: false };
  }
  if (secondsRemaining < BigInt(HEALTH_THRESHOLD_DAYS.warning) * SECONDS_PER_DAY) {
    return { tier: "warning", daysRemaining, isExpired: false };
  }

  return { tier: "healthy", daysRemaining, isExpired: false };
};
