/**
 * Wire contract for messages on the alert queue.
 * Produced by `alert-scheduler`, consumed by `alert-processor`.
 */
export type AlertMessage = {
  /**
   * Subscriber wallet address, lowercased (enforced by the D1 check constraint).
   * This is the message's whole payload: the processor dedupes on its own
   * `sent:{tier}:{wallet}` key (KV TTL = re-alert window, backed by D1), so
   * re-delivery and cron re-fan-out are absorbed without the producer stamping
   * a run identifier.
   */
  walletAddress: string;
};
