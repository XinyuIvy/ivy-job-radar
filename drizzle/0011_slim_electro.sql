CREATE TABLE `china_scan_control` (
	`id` integer PRIMARY KEY NOT NULL,
	`request_id` text DEFAULT '' NOT NULL,
	`state` text DEFAULT 'idle' NOT NULL,
	`requested_at` text DEFAULT '' NOT NULL,
	`claimed_at` text DEFAULT '' NOT NULL,
	`completed_at` text DEFAULT '' NOT NULL,
	`message` text DEFAULT '' NOT NULL
);
