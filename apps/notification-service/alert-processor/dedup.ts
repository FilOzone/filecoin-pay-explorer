import { z } from "zod";
import type { DB } from "../shared/db/client";
import { type AlertLevel, notificationLog } from "../shared/db/schema";

const ALERT_PREFIX = "alert:";
const SECONDS_PER_DAY = 86_400;

// Higher number = more severe. Drives escalation vs de-escalation decisions.
const SEVERITY: Record<AlertLevel, number> = {
  warning: 0,
  critical: 1,
  emergency: 2,
};

/**
 * Days a fired alert suppresses the same tier for a wallet before we re-alert on
 * a still-unresolved incident. Doubles as the KV key's TTL, so an abandoned
 * incident self-expires. A more severe tier has a shorter window so a worsening
 * account is nudged sooner.
 */
export const RE_ALERT_WINDOWS: Record<AlertLevel, number> = {
  warning: 16,
  critical: 5,
  emergency: 2,
};

/** The most recent alert sent to a wallet — one record is its whole alert state. */
export type AlertState = {
  tier: AlertLevel;
  /** Unix seconds the alert was sent. */
  sentAt: number;
};

const storedSchema = z.object({
  tier: z.enum(["warning", "critical", "emergency"]),
  sentAt: z.number(),
});

/** KV key. `wallet` must already be lowercased by the caller. */
export function alertKey(wallet: string): string {
  return `${ALERT_PREFIX}${wallet}`;
}

/**
 * Pure decision: given the last alert we sent (or null) and the tier observed
 * now, should we send one? Returns `true` to send, `false` to suppress.
 * - No prior alert -> send (new incident).
 * - More severe than last -> send (escalation).
 * - Less severe than last -> suppress (we already warned more severely; a lower
 *   alert right after would be noise).
 * - Same tier -> send only once its window has elapsed, so a sustained incident
 *   re-alerts on a cadence instead of on every 12h tick.
 */
export function shouldSend(previous: AlertState | null, tier: AlertLevel, nowSec: number): boolean {
  if (!previous) return true;
  if (SEVERITY[tier] > SEVERITY[previous.tier]) return true;
  if (SEVERITY[tier] < SEVERITY[previous.tier]) return false;
  const windowSec = RE_ALERT_WINDOWS[tier] * SECONDS_PER_DAY;
  return nowSec - previous.sentAt >= windowSec;
}

/** Reads a wallet's alert state; null when absent or malformed. */
export async function getAlertState(kv: KVNamespace, wallet: string): Promise<AlertState | null> {
  const raw = await kv.get(alertKey(wallet));
  if (!raw) return null;
  try {
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Clears a wallet's alert state on recovery, so a later relapse is treated as a
 * fresh incident rather than being suppressed by the previous alert's window.
 */
export async function clearAlertState(kv: KVNamespace, wallet: string): Promise<void> {
  await kv.delete(alertKey(wallet));
}

export type SentRecord = {
  tier: AlertLevel;
  /** Lowercased wallet address. */
  wallet: string;
  /** Unix seconds the account's funds run out (for the audit log). */
  fundedUntilSec: number;
  /** Unix seconds the alert was sent. */
  sentAtSec: number;
  /** Address the alert email was delivered to. */
  emailSentTo: string;
};

/**
 * Persists a fired alert: appends the durable audit row to notification_log and
 * updates the KV alert state (TTL = the tier's window). D1 is written first so a
 * KV failure can't drop the audit trail.
 */
export async function recordSent(kv: KVNamespace, db: DB, entry: SentRecord): Promise<void> {
  await db.insert(notificationLog).values({
    id: crypto.randomUUID(),
    walletAddress: entry.wallet,
    alertLevel: entry.tier,
    fundedUntil: entry.fundedUntilSec,
    sentAt: entry.sentAtSec,
    emailSentTo: entry.emailSentTo,
  });

  const state: AlertState = { tier: entry.tier, sentAt: entry.sentAtSec };
  await kv.put(alertKey(entry.wallet), JSON.stringify(state), {
    expirationTtl: RE_ALERT_WINDOWS[entry.tier] * SECONDS_PER_DAY,
  });
}
