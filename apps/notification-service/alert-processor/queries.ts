import { eq } from "drizzle-orm";
import type { DB } from "../shared/db/client";
import { verifiedEmails, walletSubscriptions } from "../shared/db/schema";

export type Subscriber = {
  email: string;
  /** Preferred display name for the email greeting. */
  name: string;
};

/**
 * Looks up the verified email subscribed to a wallet, or null if the wallet has
 * no subscription (e.g. unsubscribed between scheduling and processing).
 * `wallet` must be lowercased by the caller.
 */
export async function findSubscriberEmail(db: DB, wallet: string): Promise<Subscriber | null> {
  const rows = await db
    .select({ email: verifiedEmails.email, name: verifiedEmails.preferredName })
    .from(walletSubscriptions)
    .innerJoin(verifiedEmails, eq(walletSubscriptions.verifiedEmailId, verifiedEmails.id))
    .where(eq(walletSubscriptions.walletAddress, wallet))
    .limit(1);
  return rows[0] ?? null;
}
