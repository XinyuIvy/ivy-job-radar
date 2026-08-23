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
  applicationRowId: number | null;
  prebuildId: string;
  generationKey: string | null;
  status: CvPrebuildStatus;
  language: string;
  track: string;
  templateFile: string;
  jdSha256: string;
  factMasterSha: string;
  promptVersion: string;
  attempts: number;
  lastError: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
};

export type CvPrebuildGenerationInput = {
  jobId: number;
  prebuildId: string;
  generationKey: string;
  language: string;
  track: string;
  templateFile: string;
  jdSha256: string;
  factMasterSha: string;
  promptVersion: string;
  now: string;
};

const SELECT_PREBUILD_FIELDS = `
  SELECT
    id,
    job_id AS jobId,
    application_row_id AS applicationRowId,
    prebuild_id AS prebuildId,
    generation_key AS generationKey,
    status,
    language,
    track,
    template_file AS templateFile,
    jd_sha256 AS jdSha256,
    fact_master_sha AS factMasterSha,
    prompt_version AS promptVersion,
    attempts,
    last_error AS lastError,
    created_at AS createdAt,
    updated_at AS updatedAt,
    completed_at AS completedAt
  FROM cv_prebuild_jobs
`;

export async function getLatestCvPrebuildJob(
  database: CvPrebuildDatabase,
  jobId: number,
) {
  return database.prepare(`${SELECT_PREBUILD_FIELDS}
    WHERE job_id = ?
    ORDER BY CASE WHEN status = 'stale' THEN 1 ELSE 0 END,
      updated_at DESC, id DESC
    LIMIT 1
  `).bind(jobId).first<CvPrebuildJobRow>();
}

export async function getCvPrebuildByGenerationKey(
  database: CvPrebuildDatabase,
  generationKey: string,
) {
  return database.prepare(`${SELECT_PREBUILD_FIELDS}
    WHERE generation_key = ?
    LIMIT 1
  `).bind(generationKey).first<CvPrebuildJobRow>();
}

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

  const latest = await getLatestCvPrebuildJob(database, jobId);
  if (latest?.generationKey && latest.status !== "cancelled") return latest;

  const status = initialCvPrebuildStatus(job.description, hasAgentConfiguration);
  const language = job.region === "中国" ? "zh" : "en";
  await database.prepare(`
    INSERT INTO cv_prebuild_jobs (
      job_id, status, language, track, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(job_id) WHERE generation_key IS NULL DO UPDATE SET
      status = excluded.status,
      language = excluded.language,
      track = excluded.track,
      updated_at = excluded.updated_at,
      completed_at = ''
  `).bind(jobId, status, language, job.track, now, now).run();

  return getLatestCvPrebuildJob(database, jobId);
}

export async function beginCvPrebuildGeneration(
  database: CvPrebuildDatabase,
  input: CvPrebuildGenerationInput,
) {
  const sameGeneration = await getCvPrebuildByGenerationKey(database, input.generationKey);
  if (sameGeneration) {
    if (["failed_retryable", "stale", "cancelled"].includes(sameGeneration.status)) {
      await database.prepare(`
        UPDATE cv_prebuild_jobs
        SET status = 'stale', updated_at = ?
        WHERE job_id = ? AND generation_key <> ?
          AND status NOT IN ('cancelled', 'stale')
      `).bind(input.now, input.jobId, input.generationKey).run();
      await database.prepare(`
        UPDATE cv_prebuild_jobs
        SET status = 'preparing_bundle', attempts = attempts + 1,
            last_error = '', updated_at = ?, completed_at = ''
        WHERE generation_key = ?
      `).bind(input.now, input.generationKey).run();
      return {
        outcome: "retry" as const,
        row: await getCvPrebuildByGenerationKey(database, input.generationKey),
      };
    }
    return { outcome: "existing" as const, row: sameGeneration };
  }

  const latest = await getLatestCvPrebuildJob(database, input.jobId);
  if (latest?.generationKey && latest.generationKey !== input.generationKey && latest.status !== "cancelled") {
    await database.prepare(`
      UPDATE cv_prebuild_jobs
      SET status = 'stale', updated_at = ?
      WHERE id = ?
    `).bind(input.now, latest.id).run();
  }

  if (latest && !latest.generationKey) {
    const updated = await database.prepare(`
      UPDATE cv_prebuild_jobs
      SET prebuild_id = ?, generation_key = ?, status = 'preparing_bundle',
          language = ?, track = ?, template_file = ?, jd_sha256 = ?,
          fact_master_sha = ?, prompt_version = ?, attempts = attempts + 1,
          last_error = '', updated_at = ?, completed_at = ''
      WHERE id = ? AND generation_key IS NULL
    `).bind(
      input.prebuildId,
      input.generationKey,
      input.language,
      input.track,
      input.templateFile,
      input.jdSha256,
      input.factMasterSha,
      input.promptVersion,
      input.now,
      latest.id,
    ).run();
    if (Number(updated.meta?.changes ?? 0) > 0) {
      return {
        outcome: "created" as const,
        row: await getCvPrebuildByGenerationKey(database, input.generationKey),
      };
    }
  }

  const inserted = await database.prepare(`
    INSERT INTO cv_prebuild_jobs (
      job_id, prebuild_id, generation_key, status, language, track,
      template_file, jd_sha256, fact_master_sha, prompt_version,
      attempts, created_at, updated_at
    ) VALUES (?, ?, ?, 'preparing_bundle', ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(generation_key) DO NOTHING
  `).bind(
    input.jobId,
    input.prebuildId,
    input.generationKey,
    input.language,
    input.track,
    input.templateFile,
    input.jdSha256,
    input.factMasterSha,
    input.promptVersion,
    input.now,
    input.now,
  ).run();

  return {
    outcome: Number(inserted.meta?.changes ?? 0) > 0 ? "created" as const : "existing" as const,
    row: await getCvPrebuildByGenerationKey(database, input.generationKey),
  };
}

export async function completeCvPrebuildBundle(
  database: CvPrebuildDatabase,
  generationKey: string,
  status: "queued" | "blocked_configuration",
  now: string,
) {
  await database.prepare(`
    UPDATE cv_prebuild_jobs
    SET status = ?, last_error = '', updated_at = ?, completed_at = ''
    WHERE generation_key = ?
  `).bind(status, now, generationKey).run();
  return getCvPrebuildByGenerationKey(database, generationKey);
}

export async function failCvPrebuildBundle(
  database: CvPrebuildDatabase,
  generationKey: string,
  errorCode: string,
  now: string,
) {
  await database.prepare(`
    UPDATE cv_prebuild_jobs
    SET status = 'failed_retryable', last_error = ?, updated_at = ?
    WHERE generation_key = ?
  `).bind(errorCode.slice(0, 160), now, generationKey).run();
  return getCvPrebuildByGenerationKey(database, generationKey);
}

export async function setLatestCvPrebuildStatus(
  database: CvPrebuildDatabase,
  jobId: number,
  status: CvPrebuildStatus,
  now: string,
) {
  const latest = await getLatestCvPrebuildJob(database, jobId);
  if (!latest) return null;
  await database.prepare(`
    UPDATE cv_prebuild_jobs
    SET status = ?, updated_at = ?
    WHERE id = ?
  `).bind(status, now, latest.id).run();
  return getLatestCvPrebuildJob(database, jobId);
}

export async function cancelCvPrebuildJob(
  database: CvPrebuildDatabase,
  jobId: number,
  now: string,
) {
  const result = await database.prepare(`
    UPDATE cv_prebuild_jobs
    SET status = 'cancelled', updated_at = ?, completed_at = ?
    WHERE job_id = ? AND status NOT IN ('cancelled', 'stale')
  `).bind(now, now, jobId).run();
  return Number(result.meta?.changes ?? 0) > 0;
}
