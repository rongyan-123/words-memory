CREATE TABLE `plan_config` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`start_date` text NOT NULL,
	`horizon_days` integer DEFAULT 10 NOT NULL,
	`page_size` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`retry_after` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reserved_words` (
	`owner_id` text NOT NULL,
	`word_id` text NOT NULL,
	`day` text NOT NULL,
	PRIMARY KEY(`owner_id`, `word_id`)
);
--> statement-breakpoint
CREATE TABLE `review_batches` (
	`owner_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`claim_token` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `batch_id`)
);
--> statement-breakpoint
CREATE TABLE `scheduled_days` (
	`owner_id` text NOT NULL,
	`day` text NOT NULL,
	`day_index` integer NOT NULL,
	`plan_json` text NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `day`)
);
