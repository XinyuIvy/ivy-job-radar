import { initialCvPrebuildStatus, type CvPrebuildStatus } from "./cv-prebuild-status";

type StatementResult = {
  meta?: { changes?: number };
};

type PreparedStatement = {
  bind: (...values: unknown[]) => PreparedStatement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results?: T[] }>;
  run: () => Promise<StatementResult>;
};

export type CvPrebuildDatabase = {
  prepare: (sql: string) => PreparedStatement;
};

export type CvPrebuildJobRow = {
  id: number;
  jobId: number;
  status: CvPrebuildStatus;
  language: string;
  track: string;
  updatedAt: string;
};

const SELECT_PREBUILD_STATUS = `
  SELECT id, job_id AS jobId, status, language, track, updated_at AS updatedAt
  FROM cv_prebuild_jobs
  WHERE job_id = ?
  LIMIT 1
`;

export async function initializeCvPrebuildJob(
  database: CvPrebuildDatabase,
  jobId: number,
  hasAgentConfiguration: boolean,
  now: string,
) {
  const job = await database.prepare(`
    SELECT description, region, track
    FROM jobs
    WHERE id = ?
    LIMIT 1
  `).bind(jobId).first<{ description: string; region: string; track: string }>();
  if (!job) return null;

  const status = initialCvPrebuildStatus(job.description, hasAgentConfiguration);
  const language = job.region === "中国" ? "zh-CN" : "en";
  await database.prepare(`
    INSERT INTO cv_prebuild_jobs (
      job_id, status, language, track, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(job_id) DO UPDATE SET
      status = CASE
        WHEN cv_prebuild_jobs.status IN ('blocked_missing_jd', 'blocked_configuration', 'cancelled')
        THEN excluded.status
        ELSE cv_prebuild_jobs.status
      END,
      language = CASE
        WHEN cv_prebuild_jobs.status IN ('blocked_missing_jd', 'blocked_configuration', 'cancelled')
        THEN excluded.language
        ELSE cv_prebuild_jobs.language
      END,
      track = CASE
        WHEN cv_prebuild_jobs.status IN ('blocked_missing_jd', 'blocked_configuration', 'cancelled')
        THEN excluded.track
        ELSE cv_prebuild_jobs.track
      END,
      updated_at = CASE
        WHEN cv_prebuild_jobs.status IN ('blocked_missing_jd', 'blocked_configuration', 'cancelled')
        THEN excluded.updated_at
        ELSE cv_prebuild_jobs.updated_at
      END,
      completed_at = CASE
        WHEN cv_prebuild_jobs.status = 'cancelled' THEN ''
        ELSE cv_prebuild_jobs.completed_at
      END
  `).bind(jobId, status, language, job.track, now, now).run();

  return database.prepare(SELECT_PREBUILD_STATUS).bind(jobId).first<CvPrebuildJobRow>();
}

export async function cancelCvPrebuildJob(
  database: CvPrebuildDatabase,
  jobId: number,
  now: string,
) {
  const result = await database.prepare(`
    UPDATE cv_prebuild_jobs
    SET status = 'cancelled', updated_at = ?, completed_at = ?
    WHERE job_id = ? AND status <> 'cancelled'
  `).bind(now, now, jobId).run();
  return Number(result.meta?.changes ?? 0) > 0;
}
