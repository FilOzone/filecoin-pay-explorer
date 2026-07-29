import type { DB } from "../../shared/db/client";
import { verifiedEmails, walletSubscriptions } from "../../shared/db/schema";

const TIMESTAMP = 1_700_000_000;
const VERIFIED_EMAIL_ID = "email-0000";

// D1 caps bound parameters per statement; wallet_subscriptions has 5 columns,
// so keep multi-row inserts well under that limit.
const INSERT_CHUNK = 10;

/**
 * Seeds `count` wallet subscriptions, all referencing one verified email (to
 * satisfy the FK). Ids are zero-padded so text ordering matches insertion order
 * — `iterateSubscriptions` keyset-paginates by `id`, so this makes reads
 * deterministic. Returns the wallet addresses in id order.
 */
export async function seedSubscriptions(db: DB, count: number): Promise<string[]> {
  await db.insert(verifiedEmails).values({
    id: VERIFIED_EMAIL_ID,
    email: "alerts@example.com",
    preferredName: "Test",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });

  const wallets: string[] = [];
  const rows = Array.from({ length: count }, (_, i) => {
    // Lowercased hex, unique per row — satisfies the wallet_address lower() check.
    const walletAddress = `0x${String(i).padStart(40, "0")}`;
    wallets.push(walletAddress);
    return {
      id: `sub-${String(i).padStart(4, "0")}`,
      walletAddress,
      verifiedEmailId: VERIFIED_EMAIL_ID,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };
  });

  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await db.insert(walletSubscriptions).values(rows.slice(i, i + INSERT_CHUNK));
  }

  return wallets;
}

/** Deletes all seeded rows (subscriptions first for the FK). */
export async function clearSubscriptions(db: DB): Promise<void> {
  await db.delete(walletSubscriptions);
  await db.delete(verifiedEmails);
}
