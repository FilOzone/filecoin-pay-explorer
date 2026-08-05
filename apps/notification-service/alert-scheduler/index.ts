import { createDb } from "../shared/db/client";
import type { AlertMessage } from "../shared/messages";
import { iterateSubscriptions } from "./queries";

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
  async scheduled(controller, env, _ctx): Promise<void> {
    const scheduledAt = new Date(controller.scheduledTime).toISOString();
    const db = createDb(env.DB);
    let enqueued = 0;

    try {
      for await (const page of iterateSubscriptions(db, DB_PAGE_SIZE)) {
        const messages = page.map((row) => ({
          body: { walletAddress: row.walletAddress } satisfies AlertMessage,
        }));

        for (let i = 0; i < messages.length; i += QUEUE_BATCH_SIZE) {
          const batch = messages.slice(i, i + QUEUE_BATCH_SIZE);
          await env.ALERT_QUEUE.sendBatch(batch);
          enqueued += batch.length;
        }
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "scheduler.tick",
          status: "error",
          scheduledAt,
          enqueued,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw error;
    }

    console.log(JSON.stringify({ event: "scheduler.tick", status: "ok", scheduledAt, enqueued }));
  },
} satisfies ExportedHandler<Env>;
