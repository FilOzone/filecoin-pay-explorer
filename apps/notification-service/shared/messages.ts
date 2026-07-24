/**
 * Wire contract for messages on the alert queue.
 * Produced by `alert-scheduler`, consumed by `alert-processor`.
 */
export type AlertMessage = {
  /** Subscriber wallet address, lowercased (enforced by the D1 check constraint). */
  walletAddress: string;
  /**
   * UTC date of the scheduler run (`YYYY-MM-DD`). The processor derives its
   * dedup key from this so a cron retry of the same run reuses the same key.
   */
  scheduledDate: string;
};
