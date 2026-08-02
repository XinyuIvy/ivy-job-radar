CREATE TABLE `china_scan_status` (
	`id` integer PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`sources_completed` integer DEFAULT 0 NOT NULL,
	`sources_failed` integer DEFAULT 0 NOT NULL,
	`jobs_discovered` integer DEFAULT 0 NOT NULL,
	`jobs_eligible` integer DEFAULT 0 NOT NULL,
	`jobs_created` integer DEFAULT 0 NOT NULL,
	`jobs_updated_or_duplicate` integer DEFAULT 0 NOT NULL,
	`results` text DEFAULT '[]' NOT NULL,
	`finished_at` text DEFAULT '' NOT NULL,
	`received_at` text DEFAULT '' NOT NULL
);
