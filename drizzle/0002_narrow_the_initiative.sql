CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company` text NOT NULL,
	`title` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`region` text NOT NULL,
	`track` text NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`visa` text DEFAULT '需人工确认' NOT NULL,
	`evidence` text DEFAULT '' NOT NULL,
	`skills` text DEFAULT '[]' NOT NULL,
	`job_url` text NOT NULL,
	`source` text DEFAULT '公司官网' NOT NULL,
	`status` text DEFAULT '开放' NOT NULL,
	`discovered_at` text NOT NULL,
	`checked_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_job_url_unique` ON `jobs` (`job_url`);