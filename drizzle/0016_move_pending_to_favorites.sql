UPDATE `cv_prebuild_jobs`
SET
  `status` = 'cancelled',
  `last_error` = 'Moved back to favorites before generation.',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  `completed_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `application_row_id` IN (
  SELECT `id` FROM `applications` WHERE `status` = '准备材料'
)
AND `status` IN ('queued', 'preparing_bundle', 'agent_queued', 'agent_running');
--> statement-breakpoint
INSERT OR IGNORE INTO `jobs` (
  `company`,
  `title`,
  `location`,
  `region`,
  `track`,
  `score`,
  `visa`,
  `evidence`,
  `description`,
  `skills`,
  `job_url`,
  `canonical_url`,
  `application_id`,
  `source`,
  `status`,
  `deadline`,
  `deadline_type`,
  `last_seen_at`,
  `missed_scan_count`,
  `expiration_reason`,
  `discovered_at`,
  `checked_at`
)
SELECT
  `applications`.`company`,
  `applications`.`title`,
  `applications`.`location`,
  CASE WHEN `applications`.`region` = '' THEN '中国' ELSE `applications`.`region` END,
  CASE WHEN `applications`.`track` = '' THEN 'Technology' ELSE `applications`.`track` END,
  MIN(100, MAX(0, `applications`.`fit` * 20)),
  CASE WHEN `applications`.`work_authorization` = '' THEN '需人工确认' ELSE `applications`.`work_authorization` END,
  '由待申请记录安全迁回收藏。',
  CASE WHEN `applications`.`notes` = '' THEN '原岗位说明保存在待申请记录中。' ELSE `applications`.`notes` END,
  '[]',
  `applications`.`job_url`,
  `applications`.`job_url`,
  `applications`.`application_id`,
  CASE WHEN `applications`.`source` = '' THEN '申请记录' ELSE `applications`.`source` END,
  '开放',
  `applications`.`deadline`,
  `applications`.`deadline_type`,
  `applications`.`updated_at`,
  0,
  '',
  `applications`.`created_at`,
  `applications`.`updated_at`
FROM `applications`
WHERE `applications`.`status` = '准备材料'
  AND `applications`.`job_url` <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM `jobs`
    WHERE `jobs`.`job_url` = `applications`.`job_url`
      OR (
        `applications`.`application_id` <> ''
        AND `jobs`.`application_id` = `applications`.`application_id`
      )
      OR (
        `jobs`.`company` = `applications`.`company`
        AND `jobs`.`title` = `applications`.`title`
      )
  );
--> statement-breakpoint
INSERT OR IGNORE INTO `saved_jobs` (`job_id`, `created_at`)
WITH `matched` AS (
  SELECT
    `applications`.`id` AS `application_row_id`,
    `jobs`.`id` AS `job_id`,
    `applications`.`updated_at` AS `created_at`,
    ROW_NUMBER() OVER (
      PARTITION BY `applications`.`id`
      ORDER BY
        CASE
          WHEN `applications`.`application_id` <> ''
            AND `jobs`.`application_id` = `applications`.`application_id` THEN 0
          WHEN `jobs`.`job_url` = `applications`.`job_url` THEN 1
          ELSE 2
        END,
        `jobs`.`id` DESC
    ) AS `match_rank`
  FROM `applications`
  INNER JOIN `jobs`
    ON `jobs`.`job_url` = `applications`.`job_url`
    OR (
      `applications`.`application_id` <> ''
      AND `jobs`.`application_id` = `applications`.`application_id`
    )
    OR (
      `jobs`.`company` = `applications`.`company`
      AND `jobs`.`title` = `applications`.`title`
    )
  WHERE `applications`.`status` = '准备材料'
)
SELECT `matched`.`job_id`, `matched`.`created_at`
FROM `matched`
WHERE `matched`.`match_rank` = 1;
--> statement-breakpoint
UPDATE `applications`
SET
  `status` = '收藏',
  `next_action` = '进入待申请后自动生成 CV',
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `status` = '准备材料'
  AND EXISTS (
    SELECT 1
    FROM `saved_jobs`
    INNER JOIN `jobs` ON `jobs`.`id` = `saved_jobs`.`job_id`
    WHERE `jobs`.`job_url` = `applications`.`job_url`
      OR (
        `applications`.`application_id` <> ''
        AND `jobs`.`application_id` = `applications`.`application_id`
      )
      OR (
        `jobs`.`company` = `applications`.`company`
        AND `jobs`.`title` = `applications`.`title`
      )
  );
--> statement-breakpoint
INSERT INTO `application_status_events` (`application_id`, `status`, `occurred_at`)
SELECT `applications`.`id`, '收藏', `applications`.`updated_at`
FROM `applications`
WHERE `applications`.`status` = '收藏'
  AND NOT EXISTS (
    SELECT 1
    FROM `application_status_events`
    WHERE `application_status_events`.`application_id` = `applications`.`id`
      AND `application_status_events`.`status` = '收藏'
  );
