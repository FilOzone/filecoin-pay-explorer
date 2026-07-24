import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { VerifiedEmail, WalletSubscription } from "../shared/db/schema";
import { verifiedEmails, walletSubscriptions } from "../shared/db/schema";

export type DB = ReturnType<typeof drizzle>;

/** Creates a Drizzle DB instance bound to the given D1 database. */
export function createDb(d1: D1Database): DB {
  return drizzle(d1);
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Returns the wallet_subscriptions row for the given wallet address, or null if none exists. */
export async function findSubscriptionByWallet(db: DB, walletAddress: string): Promise<WalletSubscription | null> {
  const [row] = await db
    .select()
    .from(walletSubscriptions)
    .where(eq(walletSubscriptions.walletAddress, walletAddress))
    .limit(1);
  return row ?? null;
}

/** Returns the verified_emails row for the given email address, or null if none exists. */
export async function findVerifiedEmailByEmail(db: DB, email: string): Promise<VerifiedEmail | null> {
  const [row] = await db.select().from(verifiedEmails).where(eq(verifiedEmails.email, email)).limit(1);
  return row ?? null;
}

/** Inserts or updates a verified_emails row. On email conflict, updates preferredName. */
export async function upsertVerifiedEmail(
  db: DB,
  data: { id: string; email: string; preferredName: string },
): Promise<VerifiedEmail> {
  const now = nowSeconds();
  const [row] = await db
    .insert(verifiedEmails)
    .values({ ...data, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: verifiedEmails.email,
      set: { preferredName: data.preferredName, updatedAt: now },
    })
    .returning();
  if (!row) throw new Error("upsert verifiedEmails returned no row");
  return row;
}

/** Inserts or updates a wallet_subscriptions row. On wallet conflict, updates verifiedEmailId. */
export async function upsertWalletSubscription(
  db: DB,
  data: { id: string; walletAddress: string; verifiedEmailId: string },
): Promise<WalletSubscription> {
  const now = nowSeconds();
  const [row] = await db
    .insert(walletSubscriptions)
    .values({ ...data, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: walletSubscriptions.walletAddress,
      set: { verifiedEmailId: data.verifiedEmailId, updatedAt: now },
    })
    .returning();
  if (!row) throw new Error("upsert walletSubscriptions returned no row");
  return row;
}

/**
 * Upserts verified_email and wallet_subscription atomically via D1 batch.
 * If the wallet already points to a different email, the old verified_email row
 * is deleted when no other subscriptions reference it (orphan cleanup).
 */
export async function createVerifiedSubscription(
  db: DB,
  data: { emailId: string; email: string; preferredName: string; subscriptionId: string; walletAddress: string },
): Promise<void> {
  const now = nowSeconds();

  const [existingSubRows, existingEmailRows] = await db.batch([
    db
      .select({ verifiedEmailId: walletSubscriptions.verifiedEmailId })
      .from(walletSubscriptions)
      .where(eq(walletSubscriptions.walletAddress, data.walletAddress))
      .limit(1),
    db.select({ id: verifiedEmails.id }).from(verifiedEmails).where(eq(verifiedEmails.email, data.email)).limit(1),
  ]);

  const previousEmailId = existingSubRows[0]?.verifiedEmailId;
  // Use the pre-read ID if the email already exists so the wallet subscription
  // insert can reference it in the same batch without needing a RETURNING result.
  const realEmailId = existingEmailRows[0]?.id ?? data.emailId;

  await db.batch([
    db
      .insert(verifiedEmails)
      .values({ id: realEmailId, email: data.email, preferredName: data.preferredName, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: verifiedEmails.email,
        set: { preferredName: data.preferredName, updatedAt: now },
      }),
    db
      .insert(walletSubscriptions)
      .values({
        id: data.subscriptionId,
        walletAddress: data.walletAddress,
        verifiedEmailId: realEmailId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: walletSubscriptions.walletAddress,
        set: { verifiedEmailId: realEmailId, updatedAt: now },
      }),
  ]);

  if (previousEmailId && previousEmailId !== realEmailId) {
    const [result] = await db
      .select({ remaining: count() })
      .from(walletSubscriptions)
      .where(eq(walletSubscriptions.verifiedEmailId, previousEmailId));
    if (result?.remaining === 0) {
      await db.delete(verifiedEmails).where(eq(verifiedEmails.id, previousEmailId));
    }
  }
}

/**
 * Hard-deletes the wallet_subscriptions row and removes the referenced verified_email
 * row if no other subscriptions point to it. No-op if the wallet has no subscription.
 */
export async function deleteSubscription(db: DB, walletAddress: string): Promise<void> {
  const [sub] = await db
    .select()
    .from(walletSubscriptions)
    .where(eq(walletSubscriptions.walletAddress, walletAddress))
    .limit(1);
  if (!sub) return;

  const [, countRows] = await db.batch([
    db.delete(walletSubscriptions).where(eq(walletSubscriptions.walletAddress, walletAddress)),
    db
      .select({ remaining: count() })
      .from(walletSubscriptions)
      .where(eq(walletSubscriptions.verifiedEmailId, sub.verifiedEmailId)),
  ]);

  if (countRows[0]?.remaining === 0) {
    await db.delete(verifiedEmails).where(eq(verifiedEmails.id, sub.verifiedEmailId));
  }
}
