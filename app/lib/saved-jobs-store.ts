type SavedJobRow = {
  id: number;
  jobId: number;
  createdAt: string;
};

type StatementResult = {
  meta?: { changes?: number };
};

type PreparedStatement = {
  bind: (...values: unknown[]) => PreparedStatement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results?: T[] }>;
  run: () => Promise<StatementResult>;
};

export type SavedJobsDatabase = {
  prepare: (sql: string) => PreparedStatement;
};

const SELECT_SAVED_JOB = `
  SELECT id, job_id AS jobId, created_at AS createdAt
  FROM saved_jobs
  WHERE job_id = ?
  LIMIT 1
`;

export async function listSavedJobs(database: SavedJobsDatabase) {
  const result = await database.prepare(`
    SELECT id, job_id AS jobId, created_at AS createdAt
    FROM saved_jobs
    ORDER BY created_at DESC, id DESC
  `).all<SavedJobRow>();
  return result.results ?? [];
}

export async function saveJob(
  database: SavedJobsDatabase,
  jobId: number,
  createdAt: string,
) {
  const job = await database
    .prepare("SELECT id FROM jobs WHERE id = ? LIMIT 1")
    .bind(jobId)
    .first<{ id: number }>();
  if (!job) return { outcome: "missing" as const, row: null };

  const result = await database.prepare(`
    INSERT INTO saved_jobs (job_id, created_at)
    VALUES (?, ?)
    ON CONFLICT(job_id) DO NOTHING
  `).bind(jobId, createdAt).run();
  const row = await database
    .prepare(SELECT_SAVED_JOB)
    .bind(jobId)
    .first<SavedJobRow>();
  return {
    outcome: Number(result.meta?.changes ?? 0) > 0 ? "created" as const : "existing" as const,
    row,
  };
}

export async function deleteSavedJob(database: SavedJobsDatabase, jobId: number) {
  const result = await database
    .prepare("DELETE FROM saved_jobs WHERE job_id = ?")
    .bind(jobId)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}
