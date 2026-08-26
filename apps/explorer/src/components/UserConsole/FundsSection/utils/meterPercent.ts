import { maxUint256 } from "viem";

/**
 * Runway past this point is filed under "plenty": the bar pins full and the
 * duration label carries the difference. Wide enough that a healthy account
 * (30 days or more) still has visible bar left to lose.
 */
const RUNWAY_HORIZON_DAYS = 90n;

const SECONDS_PER_DAY = 24n * 60n * 60n;

const FULL_BAR = 100;

/**
 * Fill for the runway bar, 0–100.
 *
 * No active spend pins full: the runway is as long as the scale can show, which
 * is what `aria-valuenow` should then report. Exhausted funds read empty for the
 * same reason — the bar measures runway remaining, and pinning it full would
 * hand assistive tech `aria-valuenow="100"` next to `aria-valuetext="Expired"`.
 * The emergency-tinted track stays visible at zero, so the row is still a rail
 * with a reading rather than a blank.
 */
export const getRunwayPercent = (fundedUntilTimestamp: bigint, currentTimestamp: bigint): number => {
  if (fundedUntilTimestamp === maxUint256) return FULL_BAR;
  if (fundedUntilTimestamp <= currentTimestamp) return 0;

  const secondsRemaining = fundedUntilTimestamp - currentTimestamp;
  const horizonSeconds = RUNWAY_HORIZON_DAYS * SECONDS_PER_DAY;
  if (secondsRemaining >= horizonSeconds) return FULL_BAR;

  return Number((secondsRemaining * 100n) / horizonSeconds);
};

/**
 * Share of the balance held in lockup, 0–100, truncated down.
 *
 * Clamped because the meter must stay a meter: the contract holds
 * `funds >= lockupCurrent`, but a bar wider than its track would be a rendering
 * bug rather than a reading.
 */
export const getLockedPercent = (lockedAmount: bigint, funds: bigint): number => {
  if (funds <= 0n) return 0;
  const percent = Number((lockedAmount * 100n) / funds);
  return Math.min(percent, FULL_BAR);
};
