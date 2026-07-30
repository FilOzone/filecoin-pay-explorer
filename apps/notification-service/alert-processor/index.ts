import type { AlertMessage } from "../shared/messages";
import { createReadClient } from "./account";
import { processMessage } from "./process-message";

/**
 * notification-alert-processor — queue consumer.
 *
 * For each wallet message: reads on-chain account state, classifies a health
 * tier, dedupes against KV, sends a tiered alert email, and records it. One
 * read-only client serves the whole batch (account reads need no signer).
 *
 * Each message is acked or retried individually — a per-message failure never
 * throws out of the handler, so it can't force the whole batch to redeliver.
 */
export default {
  async queue(batch, env, _ctx): Promise<void> {
    const client = createReadClient({ rpcUrl: env.RPC_URL, network: env.NETWORK });

    for (const message of batch.messages) {
      const action = await processMessage(env, client, message.body as AlertMessage);
      if (action === "retry") {
        message.retry();
      } else {
        message.ack();
      }
    }
  },
} satisfies ExportedHandler<Env, AlertMessage>;
