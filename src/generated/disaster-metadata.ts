// Generated from allowlisted application sources and immutable migrations; no runtime environment values.
export const disasterMetadata = {
  "name": "vocab-wheel",
  "packageVersion": "0.1.0",
  "baseCommit": "dd7b7c749a2bcf68a4cfc5314cfdb3b1e69efea7",
  "sourceTreeSha256": "8a3b5daab0345215dfd0f95298058e9891bf5af8cef04048ad3eb91146012814",
  "schemaVersion": 3,
  "migrations": [
    {
      "name": "0000_normal_cassandra_nova.sql",
      "sha256": "a2dcb675ebbe927504c12302a2b80b1973084e4f0f9398285c92e84759d9550a",
      "sql": "CREATE TABLE `custom_lexicon` (\n\t`owner_id` text NOT NULL,\n\t`record_id` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`payload_json` text NOT NULL,\n\tPRIMARY KEY(`owner_id`, `record_id`, `kind`)\n);\n--> statement-breakpoint\nCREATE TABLE `daily_plans` (\n\t`owner_id` text NOT NULL,\n\t`day` text NOT NULL,\n\t`plan_json` text,\n\t`generations` integer DEFAULT 0 NOT NULL,\n\t`claim_token` text,\n\t`locked_until` integer,\n\t`updated_at` integer DEFAULT 0 NOT NULL,\n\tPRIMARY KEY(`owner_id`, `day`)\n);\n--> statement-breakpoint\nCREATE TABLE `review_events` (\n\t`owner_id` text NOT NULL,\n\t`event_id` text NOT NULL,\n\t`word_id` text NOT NULL,\n\t`grade` text NOT NULL,\n\t`claim_token` text NOT NULL,\n\t`result_json` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\tPRIMARY KEY(`owner_id`, `event_id`)\n);\n--> statement-breakpoint\nCREATE TABLE `user_state` (\n\t`owner_id` text PRIMARY KEY NOT NULL,\n\t`settings_json` text NOT NULL,\n\t`lexicon_json` text DEFAULT '{\"words\":[],\"scenes\":[]}' NOT NULL,\n\t`updated_at` integer NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE `word_progress` (\n\t`owner_id` text NOT NULL,\n\t`word_id` text NOT NULL,\n\t`progress_json` text NOT NULL,\n\t`revision` integer DEFAULT 1 NOT NULL,\n\tPRIMARY KEY(`owner_id`, `word_id`)\n);\n"
    },
    {
      "name": "0001_aromatic_tiger_shark.sql",
      "sha256": "c2bf9e365d0b2fea029ba052c42851459363d580c0d11547414306bd18adead3",
      "sql": "CREATE TABLE `plan_config` (\n\t`owner_id` text PRIMARY KEY NOT NULL,\n\t`start_date` text NOT NULL,\n\t`horizon_days` integer DEFAULT 10 NOT NULL,\n\t`page_size` integer DEFAULT 0 NOT NULL,\n\t`lease_token` text,\n\t`lease_until` integer,\n\t`retry_after` integer DEFAULT 0 NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE `reserved_words` (\n\t`owner_id` text NOT NULL,\n\t`word_id` text NOT NULL,\n\t`day` text NOT NULL,\n\tPRIMARY KEY(`owner_id`, `word_id`)\n);\n--> statement-breakpoint\nCREATE TABLE `review_batches` (\n\t`owner_id` text NOT NULL,\n\t`batch_id` text NOT NULL,\n\t`payload_hash` text NOT NULL,\n\t`claim_token` text NOT NULL,\n\t`result_json` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\tPRIMARY KEY(`owner_id`, `batch_id`)\n);\n--> statement-breakpoint\nCREATE TABLE `scheduled_days` (\n\t`owner_id` text NOT NULL,\n\t`day` text NOT NULL,\n\t`day_index` integer NOT NULL,\n\t`plan_json` text NOT NULL,\n\t`completed_at` integer,\n\t`created_at` integer NOT NULL,\n\tPRIMARY KEY(`owner_id`, `day`)\n);\n"
    },
    {
      "name": "0002_loose_energizer.sql",
      "sha256": "e6c8da58091787d7e0384b680a85ca3c7638be7eb689c9be780a485e76be7193",
      "sql": "CREATE TABLE `mark_operations` (\n\t`owner_id` text NOT NULL,\n\t`op_id` text NOT NULL,\n\t`word_id` text NOT NULL,\n\t`delta` integer NOT NULL,\n\t`claim_token` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\tPRIMARY KEY(`owner_id`, `op_id`),\n\tCONSTRAINT \"mark_operations_delta_valid\" CHECK(\"mark_operations\".\"delta\" IN (-1, 1))\n);\n--> statement-breakpoint\nCREATE TABLE `word_marks` (\n\t`owner_id` text NOT NULL,\n\t`word_id` text NOT NULL,\n\t`hard_count` integer DEFAULT 0 NOT NULL,\n\t`revision` integer DEFAULT 1 NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tPRIMARY KEY(`owner_id`, `word_id`),\n\tCONSTRAINT \"word_marks_count_safe\" CHECK(typeof(\"word_marks\".\"hard_count\") = 'integer' AND \"word_marks\".\"hard_count\" >= 0 AND \"word_marks\".\"hard_count\" <= 9007199254740991),\n\tCONSTRAINT \"word_marks_revision_safe\" CHECK(typeof(\"word_marks\".\"revision\") = 'integer' AND \"word_marks\".\"revision\" >= 1 AND \"word_marks\".\"revision\" <= 9007199254740991)\n);\n"
    }
  ],
  "seedSha256": "8b6af3402a70e4b69d324593e92546d72dfe8de5aa3964568bfc56d69728b31e"
} as const;
