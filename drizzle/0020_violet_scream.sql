ALTER TABLE `saved_jobs` ADD `cv_language` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `saved_jobs` ADD `cv_template_file` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `saved_jobs` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `saved_jobs` SET `updated_at` = `created_at` WHERE `updated_at` = '';
