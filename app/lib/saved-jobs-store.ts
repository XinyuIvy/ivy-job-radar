type SavedJobRow = {
  id: number;
  jobId: number;
  cvLanguage: string;
  cvTemplateFile: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedJobCvSelection = {
  language: "zh" | "en";
  templateFile: string;
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
  SELECT id, job_id AS jobId,
    cv_language AS cvLanguage, cv_template_file AS cvTemplateFile,
    created_at AS createdAt, updated_at AS updatedAt
  FROM saved_jobs
  WHERE job_id = ?
  LIMIT 1
`;

export async function listSavedJobs(database: SavedJobsDatabase) {
  const result = await database.prepare(`
    SELECT id, job_id AS jobId,
      cv_language AS cvLanguage, cv_template_file AS cvTemplateFile,
      created_at AS createdAt, updated_at AS updatedAt
    FROM saved_jobs
    ORDER BY created_at DESC, id DESC
  `).all<SavedJobRow>();
  return result.results ?? [];
}

export async function saveJob(
  database: SavedJobsDatabase,
  jobId: number,
  createdAt: string,
  selection?: SavedJobCvSelection,
) {
  const created = await database.prepare(`
    INSERT INTO saved_jobs (
      job_id, cv_language, cv_template_file, created_at, updated_at
    )
    SELECT ?, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM jobs WHERE id = ?)
    ON CONFLICT(job_id) DO NOTHING
    RETURNING id, job_id AS jobId,
      cv_language AS cvLanguage, cv_template_file AS cvTemplateFile,
      created_at AS createdAt, updated_at AS updatedAt
  `).bind(
    jobId,
    selection?.language ?? "",
    selection?.templateFile ?? "",
    createdAt,
    createdAt,
    jobId,
  ).first<SavedJobRow>();
  if (created) return { outcome: "created" as const, row: created };

  let row = await database
    .prepare(SELECT_SAVED_JOB)
    .bind(jobId)
    .first<SavedJobRow>();
  if (row && selection) {
    row = await updateSavedJobCvSelection(database, jobId, selection, createdAt);
  }
  return {
    outcome: row ? "existing" as const : "missing" as const,
    row,
  };
}

export async function getSavedJob(
  database: SavedJobsDatabase,
  jobId: number,
) {
  return database.prepare(SELECT_SAVED_JOB).bind(jobId).first<SavedJobRow>();
}

export async function updateSavedJobCvSelection(
  database: SavedJobsDatabase,
  jobId: number,
  selection: SavedJobCvSelection,
  updatedAt: string,
) {
  return database.prepare(`
    UPDATE saved_jobs
    SET cv_language = ?, cv_template_file = ?, updated_at = ?
    WHERE job_id = ?
    RETURNING id, job_id AS jobId,
      cv_language AS cvLanguage, cv_template_file AS cvTemplateFile,
      created_at AS createdAt, updated_at AS updatedAt
  `).bind(
    selection.language,
    selection.templateFile,
    updatedAt,
    jobId,
  ).first<SavedJobRow>();
}

export async function deleteSavedJob(database: SavedJobsDatabase, jobId: number) {
  const result = await database
    .prepare("DELETE FROM saved_jobs WHERE job_id = ?")
    .bind(jobId)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}
