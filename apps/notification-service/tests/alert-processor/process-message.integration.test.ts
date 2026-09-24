import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { createLogger } from "evlog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountSummary, ReadClient } from "../../alert-processor/account";
import { getAlertState } from "../../alert-processor/dedup";
import worker from "../../alert-processor/index";
import { type ProcessDeps, type ProcessorFields, processMessage } from "../../alert-processor/process-message";
import { createDb, type DB } from "../../shared/db/client";
import type { AlertMessage } from "../../shared/messages";

const noopLog = {
  set: vi.fn(),
  error: vi.fn(),
  emit: vi.fn(),
} as unknown as ReturnType<typeof createLogger<ProcessorFields>>;

const WALLET = "0xabcdef1234567890abcdef1234567890abcdef12";
const EMAIL = "alice@example.com";
// The read client is only ever passed to the (mocked) readSummary boundary.
const CLIENT = {} as never as ReadClient;
const db = createDb(env.DB);
const EPOCHS_PER_DAY = 2880n;
const RATE = 10_000_000_000_000_000n;

function summaryWithRunwayDays(days: number): AccountSummary {
  return { epoch: 1000n, runwayInEpochs: BigInt(days) * EPOCHS_PER_DAY, lockupRatePerEpoch: RATE, debt: 0n };
}

const HEALTHY: AccountSummary = { epoch: 1000n, runwayInEpochs: 0n, lockupRatePerEpoch: 0n, debt: 0n };
const WARNING = summaryWithRunwayDays(20); // < 30d, >= 7d
const CRITICAL = summaryWithRunwayDays(5); // < 7d, >= 3d

function deps(summary: AccountSummary): ProcessDeps & { sendEmail: ReturnType<typeof vi.fn> } {
  return {
    readSummary: vi.fn(async () => summary),
    // No stale datasets, so these tests only ever see balance alerts.
    fetchStaleDataSets: vi.fn(async () => ({ epoch: 1000n, dataSets: [] })),
    sendEmail: vi.fn(async () => {}),
  };
}

async function subscribe(wallet: string, email: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO verified_emails (id, email, preferred_name, created_at, updated_at) VALUES (?, ?, ?, 0, 0)",
  )
    .bind(`e-${wallet}`, email, "Alice")
    .run();
  await env.DB.prepare(
    "INSERT INTO wallet_subscriptions (id, wallet_address, verified_email_id, created_at, updated_at) VALUES (?, ?, ?, 0, 0)",
  )
    .bind(`s-${wallet}`, wallet, `e-${wallet}`)
    .run();
}

async function logCount(): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM notification_log").first<{ n: number }>();
  return row?.n ?? 0;
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM wallet_subscriptions").run();
  await env.DB.prepare("DELETE FROM verified_emails").run();
  await env.DB.prepare("DELETE FROM notification_log").run();
  await env.DB.prepare("DELETE FROM inactivity_alerts").run();
  await env.DB.prepare("DELETE FROM muted_data_sets").run();
  const { keys } = await env.KV.list({ prefix: "alert:" });
  await Promise.all(keys.map((k) => env.KV.delete(k.name)));
});

describe("processMessage", () => {
  it("sends, logs, and records state for a fresh warning", async () => {
    await subscribe(WALLET, EMAIL);
    const d = deps(WARNING);

    const action = await processMessage(env, CLIENT, db, { walletAddress: WALLET }, noopLog, d);

    expect(action).toBe("ack");
    expect(d.sendEmail).toHaveBeenCalledOnce();
    expect(d.sendEmail).toHaveBeenCalledWith(env, expect.objectContaining({ to: EMAIL }));
    expect(await logCount()).toBe(1);
    expect(await getAlertState(env.KV, WALLET)).toMatchObject({ tier: "warning" });
  });

  it("acks a healthy wallet without sending, and clears prior state", async () => {
    await subscribe(WALLET, EMAIL);
    await processMessage(env, CLIENT, db, { walletAddress: WALLET }, noopLog, deps(WARNING)); // arm state

    const d = deps(HEALTHY);
    const action = await processMessage(env, CLIENT, db, { walletAddress: WALLET }, noopLog, d);

    expect(action).toBe("ack");
    expect(d.sendEmail).not.toHaveBeenCalled();
    expect(await getAlertState(env.KV, WALLET)).toBeNull();
  });

  it("suppresses a repeat of the same tier within the window", async () => {
    await subscribe(WALLET, EMAIL);
    await processMessage(env, CLIENT, db, { walletAddress: WALLET }, noopLog, deps(WARNING));

    const d = deps(WARNING);
    const action = await processMessage(env, CLIENT, db, { walletAddress: WALLET }, noopLog, d);

    expect(action).toBe("ack");
    expect(d.sendEmail).not.toHaveBeenCalled();
    expect(await logCount()).toBe(1);
  });

  it("sends again on escalation to a more severe tier", async () => {
    await subscribe(WALLET, EMAIL);
    await processMessage(env, CLIENT, db, { walletAddress: WALLET }, noopLog, deps(WARNING));

    const d = deps(CRITICAL);
    const action = await processMessage(env, CLIENT, db, { walletAddress: WALLET }, noopLog, d);

    expect(action).toBe("ack");
    expect(d.sendEmail).toHaveBeenCalledOnce();
    expect(await getAlertState(env.KV, WALLET)).toMatchObject({ tier: "critical" });
  });

  it("re-alerts after a recovery clears the incident", async () => {
    await subscribe(WALLET, EMAIL);
    await processMessage(env, CLIENT, db, { walletAddress: WALLET }, noopLog, deps(WARNING)); // send #1
    await processMessage(env, CLIENT, db, { walletAddress: WALLET }, noopLog, deps(HEALTHY)); // recover

    const d = deps(WARNING);
    const action = await processMessage(env, CLIENT, db, { walletAddress: WALLET }, noopLog, d); // relapse

    expect(action).toBe("ack");
    expect(d.sendEmail).toHaveBeenCalledOnce();
  });

  it("acks without sending when the wallet has no subscription", async () => {
    const d = deps(WARNING);
    const action = await processMessage(env, CLIENT, db, { walletAddress: WALLET }, noopLog, d);

    expect(action).toBe("ack");
    expect(d.sendEmail).not.toHaveBeenCalled();
    expect(await logCount()).toBe(0);
  });

  it("retries when the on-chain read fails", async () => {
    await subscribe(WALLET, EMAIL);
    const d = {
      ...deps(WARNING),
      readSummary: vi.fn(async () => {
        throw new Error("rpc down");
      }),
    };

    const action = await processMessage(env, CLIENT, db, { walletAddress: WALLET }, noopLog, d);

    expect(action).toBe("retry");
    expect(d.sendEmail).not.toHaveBeenCalled();
  });

  it("retries when the email send fails, leaving no dedup state", async () => {
    await subscribe(WALLET, EMAIL);
    const d = {
      ...deps(WARNING),
      sendEmail: vi.fn(async () => {
        throw Object.assign(new Error("mailer down"), { code: "E_DELIVERY_FAILED" });
      }),
    };

    const action = await processMessage(env, CLIENT, db, { walletAddress: WALLET }, noopLog, d);

    expect(action).toBe("retry");
    expect(await logCount()).toBe(0);
    expect(await getAlertState(env.KV, WALLET)).toBeNull();
  });

  it("retries instead of throwing when an unexpected error occurs (e.g. D1 down)", async () => {
    const brokenDb = {
      select() {
        throw new Error("d1 down");
      },
    } as never as DB;
    const d = deps(WARNING);

    // Must resolve to "retry", not reject — a thrown error would take down the batch.
    const action = await processMessage(env, CLIENT, brokenDb, { walletAddress: WALLET }, noopLog, d);

    expect(action).toBe("retry");
    expect(d.sendEmail).not.toHaveBeenCalled();
  });
});

describe("processMessage — inactivity email", () => {
  const nowSec = () => Math.floor(Date.now() / 1000);

  function staleDataSet(dataSetId: string, daysInactive: number) {
    return {
      id: `0x${dataSetId}`,
      dataSetId,
      lastWriteAt: String(nowSec() - daysInactive * 86_400),
      pdpRail: { paymentRate: "1", state: "ACTIVE", endEpoch: "0", token: { symbol: "USDFC", decimals: "18" } },
      cacheMissRail: null,
      cdnRail: null,
    };
  }

  function inactivityDeps(...dataSets: ReturnType<typeof staleDataSet>[]) {
    return { ...deps(HEALTHY), fetchStaleDataSets: vi.fn(async () => ({ epoch: 1000n, dataSets })) };
  }

  it("emails once about newly inactive datasets, linking each to the triage queue", async () => {
    await subscribe(WALLET, EMAIL);
    const d = inactivityDeps(staleDataSet("12", 45), staleDataSet("7", 31));

    expect(await processMessage(env, CLIENT, db, { walletAddress: WALLET }, noopLog, d)).toBe("ack");

    expect(d.sendEmail).toHaveBeenCalledOnce();
    const email = d.sendEmail.mock.calls[0]?.[1];
    expect(email?.to).toBe(EMAIL);
    expect(email?.subject).toBe("2 of your datasets have had no new data for 30 days");
    expect(email?.html).toContain(`/console/services/0x02925630df557F957f70E112bA06e50965417CA0?dataset=12#stale`);

    // The next cron run finds the same inactive period already emailed.
    expect(await processMessage(env, CLIENT, db, { walletAddress: WALLET }, noopLog, d)).toBe("ack");
    expect(d.sendEmail).toHaveBeenCalledOnce();
  });

  it("skips a snoozed dataset", async () => {
    await subscribe(WALLET, EMAIL);
    await env.DB.prepare(
      "INSERT INTO muted_data_sets (id, wallet_address, data_set_id, muted_until, created_at) VALUES ('m1', ?, '12', ?, 0)",
    )
      .bind(WALLET, nowSec() + 86_400)
      .run();
    const d = inactivityDeps(staleDataSet("12", 45));

    expect(await processMessage(env, CLIENT, db, { walletAddress: WALLET }, noopLog, d)).toBe("ack");
    expect(d.sendEmail).not.toHaveBeenCalled();
  });

  it("retries when the subgraph read fails, without affecting the balance check", async () => {
    await subscribe(WALLET, EMAIL);
    const d = {
      ...deps(WARNING),
      fetchStaleDataSets: vi.fn(async () => {
        throw new Error("subgraph down");
      }),
    };

    expect(await processMessage(env, CLIENT, db, { walletAddress: WALLET }, noopLog, d)).toBe("retry");
    // The low-balance alert still went out.
    expect(d.sendEmail).toHaveBeenCalledOnce();
    expect(await logCount()).toBe(1);
  });
});

describe("queue handler", () => {
  function messageWith(body: unknown): {
    body: unknown;
    ack: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
  } {
    return { body, ack: vi.fn(), retry: vi.fn() };
  }

  it("drops (acks) a structurally-invalid message instead of retrying it", async () => {
    const message = messageWith({ walletAddress: "not-an-address" });
    const batch = { messages: [message] } as unknown as MessageBatch<AlertMessage>;

    expect(worker.queue).toBeDefined();
    await worker.queue?.(batch, env, createExecutionContext());

    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
    // A poison message must never leave a durable trace.
    expect(await logCount()).toBe(0);
  });
});
