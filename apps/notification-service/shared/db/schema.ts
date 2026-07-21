import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// email is normalized to lowercase at the API boundary before every insert/lookup.
// No schema-level CHECK — RFC 5321 allows case-sensitive local parts and a CHECK would
// silently reject technically valid addresses. wallet_address uses a CHECK because
// Ethereum addresses are hex and case carries no meaning beyond EIP-55 display.
export const verifiedEmails = sqliteTable("verified_emails", {
  id: text("id").notNull().primaryKey(),
  email: text("email").notNull().unique(),
  preferredName: text("preferred_name").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const walletSubscriptions = sqliteTable(
  "wallet_subscriptions",
  {
    id: text("id").notNull().primaryKey(),
    walletAddress: text("wallet_address").notNull().unique(),
    verifiedEmailId: text("verified_email_id")
      .notNull()
      .references(() => verifiedEmails.id),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check("wallet_address_lower", sql`${table.walletAddress} = lower(${table.walletAddress})`),
    index("idx_wallet_subscriptions_verified_email_id").on(table.verifiedEmailId),
  ],
);

export const notificationLog = sqliteTable(
  "notification_log",
  {
    id: text("id").notNull().primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    alertLevel: text("alert_level", { enum: ["warning", "critical", "emergency"] }).notNull(),
    fundedUntil: integer("funded_until").notNull(),
    sentAt: integer("sent_at").notNull(),
    emailSentTo: text("email_sent_to").notNull(),
  },
  (table) => [
    check("wallet_address_lower", sql`${table.walletAddress} = lower(${table.walletAddress})`),
    index("idx_notification_log_sent_at").on(table.sentAt),
    index("idx_notification_log_wallet_level").on(table.walletAddress, table.alertLevel, table.sentAt),
  ],
);

export type VerifiedEmail = typeof verifiedEmails.$inferSelect;
export type InsertVerifiedEmail = typeof verifiedEmails.$inferInsert;

export type WalletSubscription = typeof walletSubscriptions.$inferSelect;
export type InsertWalletSubscription = typeof walletSubscriptions.$inferInsert;

export type NotificationLog = typeof notificationLog.$inferSelect;
export type InsertNotificationLog = typeof notificationLog.$inferInsert;

export type AlertLevel = NotificationLog["alertLevel"];
