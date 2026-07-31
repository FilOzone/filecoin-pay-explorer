import { createError, createLogger } from "evlog";
import { initWorkersLogger } from "evlog/workers";
import { createDb } from "../shared/db/client";
import { type AlertMessage, alertMessageSchema } from "../shared/messages";
import { createReadClient } from "./account";
import { type ProcessorFields, processMessage } from "./process-message";

initWorkersLogger({ env: { service: "notification-alert-processor" } });

/**
 * notification-alert-processor — queue consumer.
 *
 * For each wallet message: reads on-chain account state, classifies a health
 * tier, dedupes against KV, sends a tiered alert email, and records it.
 *
 * Every message is acked or retried individually — a per-message failure never throws
 * out of the handler, so it can't force the whole batch to redeliver.
 */
export default {
  async queue(batch, env, ctx): Promise<void> {
    const client = createReadClient({ rpcUrl: env.RPC_URL, network: env.NETWORK });
    const db = createDb(env.DB);

    for (const message of batch.messages) {
      const parsed = alertMessageSchema.safeParse(message.body);

      if (!parsed.success) {
        const log = createLogger({ event: "processor.invalid_message" }, { waitUntil: ctx.waitUntil.bind(ctx) });
        log.error(
          createError({
            message: "Invalid queue message body — acking to avoid DLQ buildup",
            why: parsed.error.message,
            fix: "Check the message shape published by the scheduler matches alertMessageSchema",
          }),
        );
        log.emit();
        message.ack();
        continue;
      }

      const { walletAddress } = parsed.data;
      const log = createLogger<ProcessorFields>(
        { event: "processor.message", wallet: walletAddress },
        { waitUntil: ctx.waitUntil.bind(ctx) },
      );

      try {
        const action = await processMessage(env, client, db, parsed.data, log);
        log.set({ action });
        if (action === "retry") {
          message.retry();
        } else {
          message.ack();
        }
      } finally {
        log.emit();
      }
    }
  },
} satisfies ExportedHandler<Env, AlertMessage>;
