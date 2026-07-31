CREATE TABLE `ignored_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company` text NOT NULL,
	`title` text NOT NULL,
	`job_url` text DEFAULT '' NOT NULL,
	`fingerprint` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ignored_jobs_fingerprint_unique` ON `ignored_jobs` (`fingerprint`);
