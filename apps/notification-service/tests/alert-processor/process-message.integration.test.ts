import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountSummary, ReadClient } from "../../alert-processor/account";
import { getAlertState } from "../../alert-processor/dedup";
import { type ProcessDeps, processMessage } from "../../alert-processor/process-message";

const WALLET = "0xabcdef1234567890abcdef1234567890abcdef12";
const EMAIL = "alice@example.com";
// The read client is only ever passed to the (mocked) readSummary boundary.
const CLIENT = {} as never as ReadClient;
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
  const { keys } = await env.KV.list({ prefix: "alert:" });
  await Promise.all(keys.map((k) => env.KV.delete(k.name)));
});

describe("processMessage", () => {
  it("sends, logs, and records state for a fresh warning", async () => {
    await subscribe(WALLET, EMAIL);
    const d = deps(WARNING);

    const action = await processMessage(env, CLIENT, { walletAddress: WALLET }, d);

    expect(action).toBe("ack");
    expect(d.sendEmail).toHaveBeenCalledOnce();
    expect(d.sendEmail).toHaveBeenCalledWith(env, expect.objectContaining({ to: EMAIL }));
    expect(await logCount()).toBe(1);
    expect(await getAlertState(env.KV, WALLET)).toMatchObject({ tier: "warning" });
  });

  it("acks a healthy wallet without sending, and clears prior state", async () => {
    await subscribe(WALLET, EMAIL);
    await processMessage(env, CLIENT, { walletAddress: WALLET }, deps(WARNING)); // arm state

    const d = deps(HEALTHY);
    const action = await processMessage(env, CLIENT, { walletAddress: WALLET }, d);

    expect(action).toBe("ack");
    expect(d.sendEmail).not.toHaveBeenCalled();
    expect(await getAlertState(env.KV, WALLET)).toBeNull();
  });

  it("suppresses a repeat of the same tier within the window", async () => {
    await subscribe(WALLET, EMAIL);
    await processMessage(env, CLIENT, { walletAddress: WALLET }, deps(WARNING));

    const d = deps(WARNING);
    const action = await processMessage(env, CLIENT, { walletAddress: WALLET }, d);

    expect(action).toBe("ack");
    expect(d.sendEmail).not.toHaveBeenCalled();
    expect(await logCount()).toBe(1);
  });

  it("sends again on escalation to a more severe tier", async () => {
    await subscribe(WALLET, EMAIL);
    await processMessage(env, CLIENT, { walletAddress: WALLET }, deps(WARNING));

    const d = deps(CRITICAL);
    const action = await processMessage(env, CLIENT, { walletAddress: WALLET }, d);

    expect(action).toBe("ack");
    expect(d.sendEmail).toHaveBeenCalledOnce();
    expect(await getAlertState(env.KV, WALLET)).toMatchObject({ tier: "critical" });
  });

  it("re-alerts after a recovery clears the incident", async () => {
    await subscribe(WALLET, EMAIL);
    await processMessage(env, CLIENT, { walletAddress: WALLET }, deps(WARNING)); // send #1
    await processMessage(env, CLIENT, { walletAddress: WALLET }, deps(HEALTHY)); // recover

    const d = deps(WARNING);
    const action = await processMessage(env, CLIENT, { walletAddress: WALLET }, d); // relapse

    expect(action).toBe("ack");
    expect(d.sendEmail).toHaveBeenCalledOnce();
  });

  it("acks without sending when the wallet has no subscription", async () => {
    const d = deps(WARNING);
    const action = await processMessage(env, CLIENT, { walletAddress: WALLET }, d);

    expect(action).toBe("ack");
    expect(d.sendEmail).not.toHaveBeenCalled();
    expect(await logCount()).toBe(0);
  });

  it("retries when the on-chain read fails", async () => {
    await subscribe(WALLET, EMAIL);
    const d: ProcessDeps & { sendEmail: ReturnType<typeof vi.fn> } = {
      readSummary: vi.fn(async () => {
        throw new Error("rpc down");
      }),
      sendEmail: vi.fn(async () => {}),
    };

    const action = await processMessage(env, CLIENT, { walletAddress: WALLET }, d);

    expect(action).toBe("retry");
    expect(d.sendEmail).not.toHaveBeenCalled();
  });

  it("retries when the email send fails, leaving no dedup state", async () => {
    await subscribe(WALLET, EMAIL);
    const d: ProcessDeps & { sendEmail: ReturnType<typeof vi.fn> } = {
      readSummary: vi.fn(async () => WARNING),
      sendEmail: vi.fn(async () => {
        throw new Error("mailer down");
      }),
    };

    const action = await processMessage(env, CLIENT, { walletAddress: WALLET }, d);

    expect(action).toBe("retry");
    expect(await logCount()).toBe(0);
    expect(await getAlertState(env.KV, WALLET)).toBeNull();
  });
});
