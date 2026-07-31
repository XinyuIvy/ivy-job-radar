ALTER TABLE `applications` ADD `application_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `canonical_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `application_id` text DEFAULT '' NOT NULL;
