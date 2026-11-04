CREATE TABLE `custom_lexicon` (
	`owner_id` text NOT NULL,
	`record_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text NOT NULL,
	PRIMARY KEY(`owner_id`, `record_id`, `kind`)
);
--> statement-breakpoint
CREATE TABLE `daily_plans` (
	`owner_id` text NOT NULL,
	`day` text NOT NULL,
	`plan_json` text,
	`generations` integer DEFAULT 0 NOT NULL,
	`claim_token` text,
	`locked_until` integer,
	`updated_at` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner_id`, `day`)
);
--> statement-breakpoint
CREATE TABLE `review_events` (
	`owner_id` text NOT NULL,
	`event_id` text NOT NULL,
	`word_id` text NOT NULL,
	`grade` text NOT NULL,
	`claim_token` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `event_id`)
);
--> statement-breakpoint
CREATE TABLE `user_state` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`settings_json` text NOT NULL,
	`lexicon_json` text DEFAULT '{"words":[],"scenes":[]}' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `word_progress` (
	`owner_id` text NOT NULL,
	`word_id` text NOT NULL,
	`progress_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`owner_id`, `word_id`)
);
