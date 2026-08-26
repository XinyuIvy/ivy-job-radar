CREATE TABLE `application_automation_config` (
	`id` integer PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`execution_mode` text DEFAULT 'pilot' NOT NULL,
	`daily_limit` integer DEFAULT 3 NOT NULL,
	`minimum_score` integer DEFAULT 75 NOT NULL,
	`default_language` text DEFAULT 'en' NOT NULL,
	`allowed_ats_json` text DEFAULT '["greenhouse","lever","ashby"]' NOT NULL,
	`final_submit_enabled` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `application_automation_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`application_row_id` integer,
	`status` text DEFAULT 'awaiting_cv' NOT NULL,
	`stage` text DEFAULT 'screened' NOT NULL,
	`ats_provider` text DEFAULT 'unknown' NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`template_track` text DEFAULT 'tech' NOT NULL,
	`eligibility_score` integer DEFAULT 0 NOT NULL,
	`decision_json` text DEFAULT '{}' NOT NULL,
	`blocker_json` text DEFAULT '[]' NOT NULL,
	`claim_token` text DEFAULT '' NOT NULL,
	`claimed_at` text DEFAULT '' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`submitted_at` text DEFAULT '' NOT NULL,
	`confirmation_text` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `application_automation_tasks_job_id_unique` ON `application_automation_tasks` (`job_id`);--> statement-breakpoint
CREATE INDEX `application_automation_tasks_status_updated_at_idx` ON `application_automation_tasks` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `application_automation_tasks_application_row_id_idx` ON `application_automation_tasks` (`application_row_id`);--> statement-breakpoint
ALTER TABLE `cv_prebuild_jobs` ADD `decision_key` text DEFAULT '' NOT NULL;