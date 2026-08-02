ALTER TABLE `jobs` ADD `last_seen_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `missed_scan_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `expiration_reason` text DEFAULT '' NOT NULL;