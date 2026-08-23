CREATE TABLE `cv_prebuild_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cv_prebuild_job_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`openai_response_id` text,
	`status` text DEFAULT 'completed' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cv_prebuild_messages_job_created_at_idx` ON `cv_prebuild_messages` (`cv_prebuild_job_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `cv_prebuild_messages_response_unique` ON `cv_prebuild_messages` (`openai_response_id`);--> statement-breakpoint
ALTER TABLE `cv_prebuild_jobs` ADD `openai_conversation_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `cv_prebuild_jobs` ADD `openai_response_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `cv_prebuild_jobs` ADD `openai_container_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `cv_prebuild_jobs` ADD `model` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `cv_prebuild_jobs` ADD `service_tier` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `cv_prebuild_jobs` ADD `draft_tex_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `cv_prebuild_jobs` ADD `draft_pdf_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `cv_prebuild_jobs` ADD `draft_text_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `cv_prebuild_jobs` ADD `review_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `cv_prebuild_jobs` ADD `input_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cv_prebuild_jobs` ADD `cached_input_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cv_prebuild_jobs` ADD `output_tokens` integer DEFAULT 0 NOT NULL;