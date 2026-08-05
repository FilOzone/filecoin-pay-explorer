import { createError, createLogger } from "evlog";
import { initWorkersLogger } from "evlog/workers";
import { createDb } from "../shared/db/client";
import type { AlertMessage } from "../shared/messages";
import { iterateSubscriptions } from "./queries";

initWorkersLogger({ env: { service: "notification-alert-scheduler" } });

// Rows read per D1 page. Keyset-paginated, so the table is never fully in memory.
const DB_PAGE_SIZE = 500;
// Cloudflare Queues caps sendBatch at 100 messages per call.
const QUEUE_BATCH_SIZE = 100;

/**
 * Cron worker: reads every wallet subscription from D1 and fans out one queue
 * message per wallet for the processor to evaluate. No HTTP interface.
 *
 * On a mid-run failure it throws after logging: the next scheduled run re-fans
 * out every wallet, and the processor's dedup absorbs the re-enqueued messages
 * (Queues is at-least-once with no infra-level dedup).
 */
export default {
  async scheduled(controller, env, ctx): Promise<void> {
    const scheduledAt = new Date(controller.scheduledTime).toISOString();
    const log = createLogger({ event: "scheduler.tick", scheduledAt }, { waitUntil: ctx.waitUntil.bind(ctx) });
    const db = createDb(env.DB);
    let enqueued = 0;

    try {
      for await (const page of iterateSubscriptions(db, DB_PAGE_SIZE)) {
        const messages = page.map((row) => ({
          body: { walletAddress: row.walletAddress } satisfies AlertMessage,
        }));

        for (let i = 0; i < messages.length; i += QUEUE_BATCH_SIZE) {
          const batch = messages.slice(i, i + QUEUE_BATCH_SIZE);
          try {
            await env.ALERT_QUEUE.sendBatch(batch);
            enqueued += batch.length;
          } catch (cause) {
            throw createError({
              message: "Failed to enqueue alert batch",
              why: "ALERT_QUEUE.sendBatch rejected — the queue binding may be misconfigured or the service is unavailable",
              fix: "Check the ALERT_QUEUE binding in wrangler.jsonc and the Cloudflare Queue dashboard",
              internal: { enqueued, batchSize: batch.length },
              cause: cause instanceof Error ? cause : new Error(String(cause)),
            });
          }
        }
      }
      log.set({ outcome: "ok", enqueued });
    } catch (error) {
      log.set({ outcome: "error", enqueued });
      log.error(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      log.emit();
    }
  },
} satisfies ExportedHandler<Env>;
