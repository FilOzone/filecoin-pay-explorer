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

    await expect(runScheduled(new Date("2026-07-24T00:00:00Z"))).rejects.toThrow("Failed to enqueue alert batch");
  });

  it("reports the count already enqueued when a later batch fails mid-run", async () => {
    await seedSubscriptions(db, 150); // one D1 page, two queue batches: 100 then 50
    vi.spyOn(env.ALERT_QUEUE, "sendBatch")
      .mockResolvedValueOnce({} as QueueSendBatchResponse)
      .mockRejectedValueOnce(new Error("queue down"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runScheduled(new Date("2026-07-24T00:00:00Z"))).rejects.toThrow("Failed to enqueue alert batch");

    const logged = errorLog.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(logged.enqueued).toBe(100); // the first batch, not 0 for the whole page
  });
});
