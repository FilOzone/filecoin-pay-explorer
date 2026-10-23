/** Decimal places shown on the overview cards. */
export const FRACTION_DIGITS = 3;

/**
 * Which way to break a value that doesn't land exactly on the last shown decimal.
 *
 * - `down` (truncate) for anything the user *holds*. Rounding a balance up
 *   overstates what they can act on: a withdrawable 38.8809 shown as 38.881
 *   invites a withdrawal that the contract will reject.
 * - `up` for anything the user *owes*. Rounding debt down understates the
 *   obligation, which is the same mistake pointing the other way.
 *
 * Both directions follow one rule: never state the user's position more
 * favourably than it is.
 */
export type AmountRounding = "down" | "up";

/** Non-zero, but smaller than the last decimal we show. */
const BELOW_PRECISION = `< 0.${"0".repeat(FRACTION_DIGITS - 1)}1`;

/**
 * Formats a raw on-chain amount for display: fixed decimals, grouped thousands,
 * no token symbol.
 *
 * Works entirely in bigint space rather than converting to a float first, so the
 * digits shown are the digits on chain even for balances past `Number`'s 2^53
 * precision limit.
 *
 * Expects a non-negative amount — callers render the sign themselves (the debt
 * figure is stored positive and displayed negative).
 */
export const formatTokenAmount = (
  value: bigint | string,
  tokenDecimals: bigint | number,
  rounding: AmountRounding = "down",
): string => {
  const raw = BigInt(value);
  const magnitude = raw < 0n ? -raw : raw;

  // Exactly nothing reads as "0", not "0.000" — a padded zero looks like a
  // rounded-away dust balance, which is the one thing it isn't.
  if (magnitude === 0n) return "0";

  const decimals = Number(tokenDecimals);

  // Rescale to units of the smallest shown decimal, keeping the discarded
  // remainder so we know whether the value was exact.
  let scaled: bigint;
  let remainder = 0n;
  if (decimals > FRACTION_DIGITS) {
    const divisor = 10n ** BigInt(decimals - FRACTION_DIGITS);
    scaled = magnitude / divisor;
    remainder = magnitude % divisor;
  } else {
    scaled = magnitude * 10n ** BigInt(FRACTION_DIGITS - decimals);
  }

  if (rounding === "up" && remainder > 0n) {
    scaled += 1n;
  }

  // Truncation wiped out a real, non-zero amount. Saying "0.000" would claim the
  // balance is empty; the threshold says "you have some, just less than we show".
  if (scaled === 0n) return BELOW_PRECISION;

  const unit = scaled / 10n ** BigInt(FRACTION_DIGITS);
  const fraction = scaled % 10n ** BigInt(FRACTION_DIGITS);

  return `${unit.toLocaleString("en-US")}.${fraction.toString().padStart(FRACTION_DIGITS, "0")}`;
};
