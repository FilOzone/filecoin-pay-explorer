import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { ALERT_LEVELS } from "../alert-levels";

export const verifiedEmails = sqliteTable(
  "verified_emails",
  {
    id: text("id").notNull().primaryKey(),
    email: text("email").notNull().unique(),
    preferredName: text("preferred_name").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [check("email_lower", sql`${table.email} = lower(${table.email})`)],
);

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
    alertLevel: text("alert_level", { enum: ALERT_LEVELS }).notNull(),
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

export const mutedDataSets = sqliteTable(
  "muted_data_sets",
  {
    id: text("id").notNull().primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    dataSetId: text("data_set_id").notNull(),
    mutedUntil: integer("muted_until").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    check("wallet_address_lower", sql`${table.walletAddress} = lower(${table.walletAddress})`),
    uniqueIndex("idx_muted_data_sets_wallet_dataset").on(table.walletAddress, table.dataSetId),
  ],
);

export type VerifiedEmail = typeof verifiedEmails.$inferSelect;
export type InsertVerifiedEmail = typeof verifiedEmails.$inferInsert;

export type WalletSubscription = typeof walletSubscriptions.$inferSelect;
export type InsertWalletSubscription = typeof walletSubscriptions.$inferInsert;

export type NotificationLog = typeof notificationLog.$inferSelect;
export type InsertNotificationLog = typeof notificationLog.$inferInsert;

export type AlertLevel = NotificationLog["alertLevel"];
