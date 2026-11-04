CREATE TABLE `mark_operations` (
	`owner_id` text NOT NULL,
	`op_id` text NOT NULL,
	`word_id` text NOT NULL,
	`delta` integer NOT NULL,
	`claim_token` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `op_id`),
	CONSTRAINT "mark_operations_delta_valid" CHECK("mark_operations"."delta" IN (-1, 1))
);
--> statement-breakpoint
CREATE TABLE `word_marks` (
	`owner_id` text NOT NULL,
	`word_id` text NOT NULL,
	`hard_count` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `word_id`),
	CONSTRAINT "word_marks_count_safe" CHECK(typeof("word_marks"."hard_count") = 'integer' AND "word_marks"."hard_count" >= 0 AND "word_marks"."hard_count" <= 9007199254740991),
	CONSTRAINT "word_marks_revision_safe" CHECK(typeof("word_marks"."revision") = 'integer' AND "word_marks"."revision" >= 1 AND "word_marks"."revision" <= 9007199254740991)
);
