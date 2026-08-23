CREATE TABLE `job_fact_scores` (
	`job_id` integer PRIMARY KEY NOT NULL,
	`score_json` text NOT NULL,
	`updated_at` text NOT NULL
);
