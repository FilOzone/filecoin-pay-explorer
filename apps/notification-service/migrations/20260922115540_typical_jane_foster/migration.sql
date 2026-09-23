CREATE TABLE `muted_data_sets` (
	`id` text PRIMARY KEY,
	`wallet_address` text NOT NULL,
	`data_set_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "wallet_address_lower" CHECK("wallet_address" = lower("wallet_address"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_muted_data_sets_wallet_dataset` ON `muted_data_sets` (`wallet_address`,`data_set_id`);