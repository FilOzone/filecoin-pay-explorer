import { createDb } from "../shared/db/client";
import { type AlertMessage, alertMessageSchema } from "../shared/messages";
import { createReadClient } from "./account";
import { processMessage } from "./process-message";

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
  async queue(batch, env, _ctx): Promise<void> {
    const client = createReadClient({ rpcUrl: env.RPC_URL, network: env.NETWORK });
    const db = createDb(env.DB);

    for (const message of batch.messages) {
      const parsed = alertMessageSchema.safeParse(message.body);
      if (!parsed.success) {
        console.error(JSON.stringify({ event: "processor.invalid_message", error: parsed.error.message }));
        message.ack();
        continue;
      }

      const action = await processMessage(env, client, db, parsed.data);
      if (action === "retry") {
        message.retry();
      } else {
        message.ack();
      }
    }
  },
} satisfies ExportedHandler<Env, AlertMessage>;
