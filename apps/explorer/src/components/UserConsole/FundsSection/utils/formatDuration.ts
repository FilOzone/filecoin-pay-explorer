/** Calendar-free approximations: the label is a rough magnitude, not a date calculation. */
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;

const pluralize = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;

/**
 * Formats a whole number of days as a single truncated-down unit.
 *
 * Days stay exact below a month because every health tier is sub-month
 * (30/7/3 days), so that is the range where a day either way changes what the
 * user should do. Past a month the exact day count stops being actionable and
 * the `+` earns its place: above the meter's 90-day horizon the bar is pinned
 * full, leaving the label as the only thing separating `+3 months` from
 * `+5 years`.
 *
 * Truncating down matches the funds cards' convention — never state the user's
 * position more favourably than it is.
 *
 * Expects a non-negative day count; expiry is a state the caller labels itself.
 */
export const formatDuration = (days: number): string => {
  // Sub-day runway is real but unquantifiable at this precision; "0 days" would
  // read as expired, which it is not.
  if (days < 1) return "less than a day";
  if (days < DAYS_PER_MONTH) return pluralize(days, "day");
  if (days < DAYS_PER_YEAR) return `+${pluralize(Math.floor(days / DAYS_PER_MONTH), "month")}`;
  return `+${pluralize(Math.floor(days / DAYS_PER_YEAR), "year")}`;
};
