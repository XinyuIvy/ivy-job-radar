DROP INDEX `cv_prebuild_jobs_job_id_unique`;--> statement-breakpoint
CREATE INDEX `cv_prebuild_jobs_job_id_updated_at_idx` ON `cv_prebuild_jobs` (`job_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `cv_prebuild_jobs_pending_job_unique` ON `cv_prebuild_jobs` (`job_id`) WHERE "cv_prebuild_jobs"."generation_key" IS NULL;