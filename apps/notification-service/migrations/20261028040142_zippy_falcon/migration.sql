CREATE TABLE `inactivity_alerts` (
	`id` text PRIMARY KEY,
	`wallet_address` text NOT NULL,
	`data_set_id` text NOT NULL,
	`last_write_at` integer NOT NULL,
	`sent_at` integer NOT NULL,
	`email_sent_to` text NOT NULL,
	CONSTRAINT "wallet_address_lower" CHECK("wallet_address" = lower("wallet_address"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_inactivity_alerts_wallet_dataset` ON `inactivity_alerts` (`wallet_address`,`data_set_id`);