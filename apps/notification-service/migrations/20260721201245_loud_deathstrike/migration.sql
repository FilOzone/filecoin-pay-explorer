CREATE TABLE `notification_log` (
	`id` text PRIMARY KEY,
	`wallet_address` text NOT NULL,
	`alert_level` text NOT NULL,
	`funded_until` integer NOT NULL,
	`sent_at` integer NOT NULL,
	`email_sent_to` text NOT NULL,
	CONSTRAINT "wallet_address_lower" CHECK("wallet_address" = lower("wallet_address"))
);
--> statement-breakpoint
CREATE TABLE `verified_emails` (
	`id` text PRIMARY KEY,
	`email` text NOT NULL UNIQUE,
	`preferred_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "email_lower" CHECK("email" = lower("email"))
);
--> statement-breakpoint
CREATE TABLE `wallet_subscriptions` (
	`id` text PRIMARY KEY,
	`wallet_address` text NOT NULL UNIQUE,
	`verified_email_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_wallet_subscriptions_verified_email_id_verified_emails_id_fk` FOREIGN KEY (`verified_email_id`) REFERENCES `verified_emails`(`id`),
	CONSTRAINT "wallet_address_lower" CHECK("wallet_address" = lower("wallet_address"))
);
--> statement-breakpoint
CREATE INDEX `idx_notification_log_sent_at` ON `notification_log` (`sent_at`);--> statement-breakpoint
CREATE INDEX `idx_notification_log_wallet_level` ON `notification_log` (`wallet_address`,`alert_level`,`sent_at`);--> statement-breakpoint
CREATE INDEX `idx_wallet_subscriptions_verified_email_id` ON `wallet_subscriptions` (`verified_email_id`);