import { z } from "zod";

/**
 * Wire contract for messages on the alert queue.
 * Produced by `alert-scheduler`, consumed by `alert-processor`.
 *
 * The processor validates every incoming body against this at the queue
 * boundary: a structurally-invalid message can never succeed on retry, so it is
 * dropped (acked) rather than retried into the consumer-less DLQ.
 */
export const alertMessageSchema = z.object({
  /**
   * Subscriber wallet address, lowercased (enforced by the D1 check constraint).
   * This is the message's whole payload: the processor dedupes on its own
   * `alert:{wallet}` key (KV TTL = re-alert window, backed by D1), so
   * re-delivery and cron re-fan-out are absorbed without the producer stamping
   * a run identifier.
   */
  walletAddress: z.string().regex(/^0x[0-9a-f]{40}$/, "expected a lowercased 0x address"),
});

export type AlertMessage = z.infer<typeof alertMessageSchema>;
