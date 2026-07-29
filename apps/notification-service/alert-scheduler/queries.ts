import { asc, gt } from "drizzle-orm";
import type { DB } from "../shared/db/client";
import { walletSubscriptions } from "../shared/db/schema";

export type SubscriptionRow = { id: string; walletAddress: string };

/**
 * Yields pages of wallet subscriptions ordered by `id` (keyset pagination),
 * so the full table is never held in memory. Keyset — not `OFFSET` — keeps
 * each page's cost constant regardless of how far in we are.
 *
 * The first query runs before the caller sends anything, so a failure here
 * surfaces before any queue message is produced (fail-fast, no partial fan-out).
 */
export async function* iterateSubscriptions(db: DB, pageSize: number): AsyncGenerator<SubscriptionRow[]> {
  let cursor: string | null = null;

  while (true) {
    const rows: SubscriptionRow[] = await db
      .select({ id: walletSubscriptions.id, walletAddress: walletSubscriptions.walletAddress })
      .from(walletSubscriptions)
      .where(cursor === null ? undefined : gt(walletSubscriptions.id, cursor))
      .orderBy(asc(walletSubscriptions.id))
      .limit(pageSize);

    if (rows.length === 0) return;
    yield rows;
    if (rows.length < pageSize) return;

    const last = rows.at(-1);
    if (!last) return;
    cursor = last.id;
  }
}
