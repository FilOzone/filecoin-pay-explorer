import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../alert-scheduler/index";
import { createDb } from "../../shared/db/client";
import type { AlertMessage } from "../../shared/messages";
import { clearSubscriptions, seedSubscriptions } from "./helpers";

const db = createDb(env.DB);

const CRON = "0 */12 * * *";

/** Runs the scheduled handler to completion for a given run time. */
async function runScheduled(scheduledTime: Date): Promise<void> {
  const controller = createScheduledController({ scheduledTime, cron: CRON });
  const ctx = createExecutionContext();
  await worker.scheduled(controller, env, ctx);
  await waitOnExecutionContext(ctx);
}

/** All message bodies passed to sendBatch, flattened in call order. */
function enqueuedBodies(spy: { mock: { calls: unknown[][] } }): AlertMessage[] {
  return spy.mock.calls.flatMap((call) => (call[0] as { body: AlertMessage }[]).map((message) => message.body));
}

describe("scheduled", () => {
  beforeEach(() => clearSubscriptions(db));

  it("fans out one message per subscription", async () => {
    const wallets = await seedSubscriptions(db, 2);
    const sendBatch = vi.spyOn(env.ALERT_QUEUE, "sendBatch");

    await runScheduled(new Date("2026-07-24T00:00:00Z"));

    const bodies = enqueuedBodies(sendBatch);
    expect(bodies).toHaveLength(2);
    // Message order is not part of the contract — compare as sets.
    expect(new Set(bodies.map((m) => m.walletAddress))).toEqual(new Set(wallets));
  });

  it("stamps each message with the UTC date of the run", async () => {
    await seedSubscriptions(db, 1);
    const sendBatch = vi.spyOn(env.ALERT_QUEUE, "sendBatch");

    // Late in the UTC day — proves the date is not shifted by local time.
    await runScheduled(new Date("2026-07-24T23:30:00Z"));

    expect(enqueuedBodies(sendBatch).map((m) => m.scheduledDate)).toEqual(["2026-07-24"]);
  });

  it("never exceeds the 100-message batch limit and drops nothing", async () => {
    const wallets = await seedSubscriptions(db, 201);
    const sendBatch = vi.spyOn(env.ALERT_QUEUE, "sendBatch");

    await runScheduled(new Date("2026-07-24T00:00:00Z"));

    const sizes = sendBatch.mock.calls.map((call) => (call[0] as unknown[]).length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(100); // hard Cloudflare Queues limit
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(201); // nothing dropped
    expect(new Set(enqueuedBodies(sendBatch).map((m) => m.walletAddress))).toEqual(new Set(wallets));
  });

  it("sends nothing when there are no subscriptions", async () => {
    const sendBatch = vi.spyOn(env.ALERT_QUEUE, "sendBatch");

    await expect(runScheduled(new Date("2026-07-24T00:00:00Z"))).resolves.toBeUndefined();

    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("rethrows when the queue send fails so the cron retries", async () => {
    await seedSubscriptions(db, 1);
    vi.spyOn(env.ALERT_QUEUE, "sendBatch").mockRejectedValue(new Error("queue down"));

    await expect(runScheduled(new Date("2026-07-24T00:00:00Z"))).rejects.toThrow("queue down");
  });
});
