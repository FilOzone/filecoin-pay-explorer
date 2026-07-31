/**
 * Single source of truth for the actionable alert severity tiers, ordered from
 * least to most urgent. The db column enum, the email template, and the account
 * health tiers all derive from this so they can't drift apart.
 */
export const ALERT_LEVELS = ["warning", "critical", "emergency"] as const;

export type AlertLevel = (typeof ALERT_LEVELS)[number];
