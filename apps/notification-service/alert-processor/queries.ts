import { eq, sql } from "drizzle-orm";
import type { DB } from "../shared/db/client";
import { inactivityAlerts, mutedDataSets, verifiedEmails, walletSubscriptions } from "../shared/db/schema";
import type { DataSetMute, SentInactivityAlert } from "./inactivity";

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

/** Every mute the wallet has set, expired ones included. */
export async function findDataSetMutes(db: DB, wallet: string): Promise<DataSetMute[]> {
  return db
    .select({ dataSetId: mutedDataSets.dataSetId, mutedUntil: mutedDataSets.mutedUntil })
    .from(mutedDataSets)
    .where(eq(mutedDataSets.walletAddress, wallet));
}

/** The last inactivity email per dataset for this wallet. */
export async function findInactivityAlerts(db: DB, wallet: string): Promise<SentInactivityAlert[]> {
  return db
    .select({
      dataSetId: inactivityAlerts.dataSetId,
      lastWriteAt: inactivityAlerts.lastWriteAt,
      sentAt: inactivityAlerts.sentAt,
    })
    .from(inactivityAlerts)
    .where(eq(inactivityAlerts.walletAddress, wallet));
}

// D1 binds at most 100 parameters per statement, and each row binds 6.
const ALERT_ROWS_PER_STATEMENT = 16;

/** Records one inactivity email covering `dataSets`, replacing each dataset's previous row. */
export async function recordInactivityAlerts(
  db: DB,
  entry: {
    wallet: string;
    emailSentTo: string;
    sentAt: number;
    dataSets: { dataSetId: string; lastWriteAt: number }[];
  },
): Promise<void> {
  const rows = entry.dataSets.map((dataSet) => ({
    id: crypto.randomUUID(),
    walletAddress: entry.wallet,
    dataSetId: dataSet.dataSetId,
    lastWriteAt: dataSet.lastWriteAt,
    sentAt: entry.sentAt,
    emailSentTo: entry.emailSentTo,
  }));

  const statements = [];
  for (let i = 0; i < rows.length; i += ALERT_ROWS_PER_STATEMENT) {
    statements.push(
      db
        .insert(inactivityAlerts)
        .values(rows.slice(i, i + ALERT_ROWS_PER_STATEMENT))
        .onConflictDoUpdate({
          target: [inactivityAlerts.walletAddress, inactivityAlerts.dataSetId],
          set: {
            lastWriteAt: sql`excluded.last_write_at`,
            sentAt: sql`excluded.sent_at`,
            emailSentTo: sql`excluded.email_sent_to`,
          },
        }),
    );
  }
  const [first, ...rest] = statements;
  if (first) await db.batch([first, ...rest]);
}
