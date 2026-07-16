/**
 * notification-processor — queue consumer.
 * Per message: read account state via RPC, derive funded-until, pick tier,
 * dedupe (KV + D1), send alert, write notification_log.
 * Placeholder handler for the scaffold; processing lands in the processor issue.
 */
export default {
  async queue(batch, _env, _ctx): Promise<void> {
    for (const message of batch.messages) {
      message.ack();
    }
  },
} satisfies ExportedHandler<Env>;
