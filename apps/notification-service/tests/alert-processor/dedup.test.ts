import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type AlertState,
  alertKey,
  clearAlertState,
  getAlertState,
  RE_ALERT_WINDOWS,
  recordSent,
  shouldSend,
} from "../../alert-processor/dedup";
import { createDb } from "../../shared/db/client";

const WALLET = "0xabcdef1234567890abcdef1234567890abcdef12";
// Fixed instant so window math is deterministic; stored as unix seconds like the code.
const NOW = Math.floor(new Date("2026-01-15T00:00:00Z").getTime() / 1000);
const SECONDS_PER_DAY = 86_400;

function db() {
  return createDb(env.DB);
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM notification_log").run();
  const { keys } = await env.KV.list({ prefix: "alert:" });
  await Promise.all(keys.map((k) => env.KV.delete(k.name)));
});

describe("alertKey", () => {
  it("namespaces by wallet", () => {
    expect(alertKey(WALLET)).toBe(`alert:${WALLET}`);
  });
});

describe("RE_ALERT_WINDOWS", () => {
  it("shrinks the window as severity rises", () => {
    expect(RE_ALERT_WINDOWS.warning).toBeGreaterThan(RE_ALERT_WINDOWS.critical);
    expect(RE_ALERT_WINDOWS.critical).toBeGreaterThan(RE_ALERT_WINDOWS.emergency);
  });
});

describe("shouldSend", () => {
  it("sends when there is no prior alert", () => {
    expect(shouldSend(null, "warning", NOW)).toBe(true);
  });

  it("sends on escalation to a more severe tier", () => {
    const previous: AlertState = { tier: "warning", sentAt: NOW };
    expect(shouldSend(previous, "critical", NOW)).toBe(true);
  });

  it("suppresses de-escalation to a less severe tier", () => {
    const previous: AlertState = { tier: "emergency", sentAt: NOW };
    expect(shouldSend(previous, "warning", NOW)).toBe(false);
  });

  it("suppresses the same tier before its window elapses", () => {
    const previous: AlertState = { tier: "warning", sentAt: NOW - SECONDS_PER_DAY };
    expect(shouldSend(previous, "warning", NOW)).toBe(false);
  });

  it("sends the same tier once its window has elapsed", () => {
    const previous: AlertState = { tier: "warning", sentAt: NOW - RE_ALERT_WINDOWS.warning * SECONDS_PER_DAY };
    expect(shouldSend(previous, "warning", NOW)).toBe(true);
  });

  it("uses the observed tier's window for the cadence check", () => {
    // Two days since an emergency alert: past emergency's 2d window (send), but
    // inside critical's 5d window (suppress) — the current tier decides.
    const sentAt = NOW - 2 * SECONDS_PER_DAY;
    expect(shouldSend({ tier: "emergency", sentAt }, "emergency", NOW)).toBe(true);
    expect(shouldSend({ tier: "critical", sentAt }, "critical", NOW)).toBe(false);
  });
});

describe("getAlertState", () => {
  it("returns null when no state exists", async () => {
    expect(await getAlertState(env.KV, WALLET)).toBeNull();
  });

  it("round-trips the stored state", async () => {
    await recordSent(env.KV, db(), {
      tier: "warning",
      wallet: WALLET,
      fundedUntilSec: NOW + SECONDS_PER_DAY,
      sentAtSec: NOW,
      emailSentTo: "alice@example.com",
    });
    expect(await getAlertState(env.KV, WALLET)).toEqual({ tier: "warning", sentAt: NOW });
  });

  it("returns null when the stored value is malformed", async () => {
    await env.KV.put(alertKey(WALLET), "not-json");
    expect(await getAlertState(env.KV, WALLET)).toBeNull();
  });

  it("returns null when required fields are missing", async () => {
    await env.KV.put(alertKey(WALLET), JSON.stringify({ tier: "warning" }));
    expect(await getAlertState(env.KV, WALLET)).toBeNull();
  });
});

describe("clearAlertState", () => {
  it("lets a relapse alert again after recovery", async () => {
    await recordSent(env.KV, db(), {
      tier: "warning",
      wallet: WALLET,
      fundedUntilSec: NOW + SECONDS_PER_DAY,
      sentAtSec: NOW,
      emailSentTo: "alice@example.com",
    });
    // Within the window, a same-tier relapse would normally be suppressed.
    expect(shouldSend(await getAlertState(env.KV, WALLET), "warning", NOW + SECONDS_PER_DAY)).toBe(false);

    await clearAlertState(env.KV, WALLET);

    expect(await getAlertState(env.KV, WALLET)).toBeNull();
    expect(shouldSend(await getAlertState(env.KV, WALLET), "warning", NOW + SECONDS_PER_DAY)).toBe(true);
  });
});

describe("recordSent", () => {
  it("writes the D1 audit row and the KV alert state", async () => {
    await recordSent(env.KV, db(), {
      tier: "critical",
      wallet: WALLET,
      fundedUntilSec: NOW + 3 * SECONDS_PER_DAY,
      sentAtSec: NOW,
      emailSentTo: "alice@example.com",
    });

    const rows = await env.DB.prepare(
      "SELECT wallet_address, alert_level, funded_until, sent_at, email_sent_to FROM notification_log",
    ).all();
    expect(rows.results).toEqual([
      {
        wallet_address: WALLET,
        alert_level: "critical",
        funded_until: NOW + 3 * SECONDS_PER_DAY,
        sent_at: NOW,
        email_sent_to: "alice@example.com",
      },
    ]);
    expect(await getAlertState(env.KV, WALLET)).toEqual({ tier: "critical", sentAt: NOW });
  });
});
