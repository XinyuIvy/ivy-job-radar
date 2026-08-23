CREATE TABLE `cv_prebuild_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`application_row_id` integer,
	`prebuild_id` text DEFAULT '' NOT NULL,
	`generation_key` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`language` text DEFAULT '' NOT NULL,
	`track` text DEFAULT '' NOT NULL,
	`template_file` text DEFAULT '' NOT NULL,
	`jd_sha256` text DEFAULT '' NOT NULL,
	`fact_master_sha` text DEFAULT '' NOT NULL,
	`prompt_version` text DEFAULT '' NOT NULL,
	`agent_trigger_run_id` text DEFAULT '' NOT NULL,
	`conversation_url` text DEFAULT '' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cv_prebuild_jobs_job_id_unique` ON `cv_prebuild_jobs` (`job_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cv_prebuild_jobs_generation_key_unique` ON `cv_prebuild_jobs` (`generation_key`);--> statement-breakpoint
CREATE INDEX `cv_prebuild_jobs_status_updated_at_idx` ON `cv_prebuild_jobs` (`status`,`updated_at`);--> statement-breakpoint
INSERT OR IGNORE INTO `cv_prebuild_jobs` (
	`job_id`, `status`, `language`, `track`, `created_at`, `updated_at`
)
SELECT
	`saved_jobs`.`job_id`,
	CASE
		WHEN trim(coalesce(`jobs`.`description`, '')) = '' THEN 'blocked_missing_jd'
		ELSE 'blocked_configuration'
	END,
	CASE WHEN `jobs`.`region` = '中国' THEN 'zh-CN' ELSE 'en' END,
	`jobs`.`track`,
	`saved_jobs`.`created_at`,
	`saved_jobs`.`created_at`
FROM `saved_jobs`
INNER JOIN `jobs` ON `jobs`.`id` = `saved_jobs`.`job_id`;
