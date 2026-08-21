import type { HealthTier } from "./fundsHealth";

/**
 * The one palette for runway severity, shared by the overview cards and the
 * runway meter so the two never drift apart on screen.
 *
 * Color is never the sole signal: each surface also communicates the
 * remaining duration, expiry, or no-recurring-charge state in text.
 */

/**
 * Text color for a tier. Runs two steps darker than the palette's fill hue.
 *
 * Dark mode keeps the light tints: there the same hues sit on a dark fill, where
 * a light value is the legible one.
 */
export const TIER_VALUE_CLASSNAME: Record<HealthTier, string> = {
  healthy: "text-[#15803D] dark:text-[#4ADE80]",
  warning: "text-[#B45309] dark:text-[#FCD34D]",
  critical: "text-[#9A3412] dark:text-[#FDBA74]",
  emergency: "text-[#B91C1C] dark:text-[#FCA5A5]",
};

/**
 * Card tint for a tier. Fills are the palette hues at partial alpha rather than
 * lighter hex values, so the tint stays the design's color and its strength is
 * one number to turn.
 *
 * No border override here on purpose: a tinted card keeps the shared
 * `border-border` token, so it sits in the same frame as its untinted siblings.
 */
export const TIER_CARD_CLASSNAME: Record<HealthTier, string> = {
  healthy: "bg-[#DCFCE7]/60 dark:bg-[#16A34A]/15",
  warning: "bg-[#FEF3C7]/60 dark:bg-[#F59E0B]/15",
  critical: "bg-[#FECAB5]/60 dark:bg-[#F97316]/15",
  emergency: "bg-[#FEE2E2]/60 dark:bg-[#DC2626]/15",
};

/** Solid meter fill: the palette hue itself, light-valued in dark mode like the text. */
export const TIER_BAR_CLASSNAME: Record<HealthTier, string> = {
  healthy: "bg-[#16A34A] dark:bg-[#4ADE80]",
  warning: "bg-[#F59E0B] dark:bg-[#FCD34D]",
  critical: "bg-[#F97316] dark:bg-[#FDBA74]",
  emergency: "bg-[#DC2626] dark:bg-[#FCA5A5]",
};

/** Meter track: the same hue as its fill at low alpha, so a part-filled bar reads as one bar. */
export const TIER_TRACK_CLASSNAME: Record<HealthTier, string> = {
  healthy: "bg-[#16A34A]/15 dark:bg-[#4ADE80]/20",
  warning: "bg-[#F59E0B]/15 dark:bg-[#FCD34D]/20",
  critical: "bg-[#F97316]/15 dark:bg-[#FDBA74]/20",
  emergency: "bg-[#DC2626]/15 dark:bg-[#FCA5A5]/20",
};
