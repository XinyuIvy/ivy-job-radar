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
  openaiConversationId: string;
  openaiResponseId: string;
  openaiContainerId: string;
  model: string;
  serviceTier: string;
  draftTexKey: string;
  draftPdfKey: string;
  draftTextKey: string;
  reviewKey: string;
  decisionKey: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  attempts: number;
  lastError: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
};

export type CvPrebuildMessageRow = {
  id: number;
  cvPrebuildJobId: number;
  role: "user" | "assistant";
  content: string;
  openaiResponseId: string | null;
  status: "pending" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
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
    openai_conversation_id AS openaiConversationId,
    openai_response_id AS openaiResponseId,
    openai_container_id AS openaiContainerId,
    model,
    service_tier AS serviceTier,
    draft_tex_key AS draftTexKey,
    draft_pdf_key AS draftPdfKey,
    draft_text_key AS draftTextKey,
    review_key AS reviewKey,
    decision_key AS decisionKey,
    input_tokens AS inputTokens,
    cached_input_tokens AS cachedInputTokens,
    output_tokens AS outputTokens,
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
    if (["queued", "failed_retryable", "stale", "cancelled"].includes(sameGeneration.status)) {
      await database.prepare(`
        UPDATE cv_prebuild_jobs
        SET status = 'stale', updated_at = ?
        WHERE job_id = ? AND generation_key <> ?
          AND status NOT IN ('cancelled', 'stale')
      `).bind(input.now, input.jobId, input.generationKey).run();
      await database.prepare(`
        UPDATE cv_prebuild_jobs
        SET status = 'preparing_bundle', attempts = attempts + 1,
            last_error = '', created_at = ?, updated_at = ?, completed_at = ''
        WHERE generation_key = ?
      `).bind(input.now, input.now, input.generationKey).run();
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
          last_error = '', created_at = ?, updated_at = ?, completed_at = ''
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
      job_id, application_row_id, prebuild_id, generation_key, status, language, track,
      template_file, jd_sha256, fact_master_sha, prompt_version,
      attempts, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'preparing_bundle', ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(generation_key) DO NOTHING
  `).bind(
    input.jobId,
    latest?.applicationRowId ?? null,
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

export async function startCvPrebuildRun(
  database: CvPrebuildDatabase,
  generationKey: string,
  input: {
    conversationId: string;
    responseId: string;
    model: string;
    serviceTier: string;
    now: string;
  },
) {
  await database.prepare(`
    UPDATE cv_prebuild_jobs
    SET status = 'agent_queued', openai_conversation_id = ?,
        openai_response_id = ?, openai_container_id = '', model = ?,
        service_tier = ?, last_error = '', updated_at = ?, completed_at = ''
    WHERE generation_key = ?
  `).bind(
    input.conversationId,
    input.responseId,
    input.model,
    input.serviceTier,
    input.now,
    generationKey,
  ).run();
  return getCvPrebuildByGenerationKey(database, generationKey);
}

export async function claimCvPrebuildFallback(
  database: CvPrebuildDatabase,
  row: CvPrebuildJobRow,
  maxAttempts: number,
  now: string,
) {
  const claimed = await database.prepare(`
    UPDATE cv_prebuild_jobs
    SET status = 'preparing_bundle', attempts = attempts + 1,
        last_error = '', created_at = ?, updated_at = ?, completed_at = ''
    WHERE id = ? AND generation_key = ?
      AND status IN ('queued', 'failed_retryable')
      AND attempts < ?
      AND NOT EXISTS (
        SELECT 1
        FROM cv_prebuild_jobs AS active
        JOIN applications AS pending_application
          ON pending_application.id = active.application_row_id
        WHERE active.id <> cv_prebuild_jobs.id
          AND pending_application.status = '准备材料'
          AND active.status IN ('preparing_bundle', 'agent_queued', 'agent_running')
      )
  `).bind(now, now, row.id, row.generationKey, maxAttempts).run();
  if (Number(claimed.meta?.changes ?? 0) === 0) return null;
  return getCvPrebuildByGenerationKey(database, row.generationKey);
}

export async function releaseStaleCvPrebuildClaim(
  database: CvPrebuildDatabase,
  row: CvPrebuildJobRow,
  now: string,
) {
  const released = await database.prepare(`
    UPDATE cv_prebuild_jobs
    SET status = 'failed_retryable',
        last_error = 'CV_FALLBACK_START_FAILED: server_error', updated_at = ?
    WHERE id = ? AND generation_key = ? AND status = 'preparing_bundle' AND updated_at = ?
  `).bind(now, row.id, row.generationKey, row.updatedAt).run();
  if (Number(released.meta?.changes ?? 0) === 0) return getLatestCvPrebuildJob(database, row.jobId);
  return getCvPrebuildByGenerationKey(database, row.generationKey);
}

export async function markCvPrebuildRunning(
  database: CvPrebuildDatabase,
  generationKey: string,
  now: string,
) {
  await database.prepare(`
    UPDATE cv_prebuild_jobs
    SET status = 'agent_running', updated_at = ?
    WHERE generation_key = ? AND status IN ('agent_queued', 'agent_running')
  `).bind(now, generationKey).run();
  return getCvPrebuildByGenerationKey(database, generationKey);
}

export async function completeCvPrebuildRun(
  database: CvPrebuildDatabase,
  generationKey: string,
  input: {
    responseId: string;
    containerId: string;
    serviceTier: string;
    draftTexKey: string;
    draftPdfKey: string;
    draftTextKey: string;
    reviewKey: string;
    decisionKey: string;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    now: string;
  },
) {
  await database.prepare(`
    UPDATE cv_prebuild_jobs
    SET status = 'ready', openai_response_id = ?, openai_container_id = ?,
        service_tier = ?, draft_tex_key = ?, draft_pdf_key = ?,
        draft_text_key = ?, review_key = ?, decision_key = ?, input_tokens = ?,
        cached_input_tokens = ?, output_tokens = ?, last_error = '',
        updated_at = ?, completed_at = ?
    WHERE generation_key = ?
  `).bind(
    input.responseId,
    input.containerId,
    input.serviceTier,
    input.draftTexKey,
    input.draftPdfKey,
    input.draftTextKey,
    input.reviewKey,
    input.decisionKey,
    input.inputTokens,
    input.cachedInputTokens,
    input.outputTokens,
    input.now,
    input.now,
    generationKey,
  ).run();
  return getCvPrebuildByGenerationKey(database, generationKey);
}

export async function failCvPrebuildRun(
  database: CvPrebuildDatabase,
  generationKey: string,
  responseId: string,
  errorCode: string,
  now: string,
) {
  await database.prepare(`
    UPDATE cv_prebuild_jobs
    SET status = CASE
          WHEN draft_tex_key <> '' AND draft_pdf_key <> '' THEN 'ready'
          ELSE 'failed_retryable'
        END,
        last_error = ?, updated_at = ?
    WHERE generation_key = ? AND openai_response_id = ?
  `).bind(errorCode.slice(0, 160), now, generationKey, responseId).run();
  await database.prepare(`
    UPDATE cv_prebuild_messages
    SET status = 'failed', updated_at = ?
    WHERE openai_response_id = ?
  `).bind(now, responseId).run();
  return getCvPrebuildByGenerationKey(database, generationKey);
}

export async function appendCvPrebuildMessage(
  database: CvPrebuildDatabase,
  input: {
    cvPrebuildJobId: number;
    role: "user" | "assistant";
    content: string;
    openaiResponseId?: string | null;
    status?: "pending" | "completed" | "failed";
    now: string;
  },
) {
  const result = await database.prepare(`
    INSERT INTO cv_prebuild_messages (
      cv_prebuild_job_id, role, content, openai_response_id,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.cvPrebuildJobId,
    input.role,
    input.content,
    input.openaiResponseId ?? null,
    input.status ?? "completed",
    input.now,
    input.now,
  ).run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function ensurePendingAssistantMessage(
  database: CvPrebuildDatabase,
  cvPrebuildJobId: number,
  responseId: string,
  now: string,
) {
  await database.prepare(`
    INSERT INTO cv_prebuild_messages (
      cv_prebuild_job_id, role, content, openai_response_id,
      status, created_at, updated_at
    ) VALUES (?, 'assistant', '', ?, 'pending', ?, ?)
    ON CONFLICT(openai_response_id) DO NOTHING
  `).bind(cvPrebuildJobId, responseId, now, now).run();
}

export async function completeAssistantMessage(
  database: CvPrebuildDatabase,
  responseId: string,
  content: string,
  now: string,
) {
  await database.prepare(`
    UPDATE cv_prebuild_messages
    SET content = ?, status = 'completed', updated_at = ?
    WHERE openai_response_id = ?
  `).bind(content, now, responseId).run();
}

export async function listCvPrebuildMessages(
  database: CvPrebuildDatabase,
  cvPrebuildJobId: number,
) {
  const result = await database.prepare(`
    SELECT
      id,
      cv_prebuild_job_id AS cvPrebuildJobId,
      role,
      content,
      openai_response_id AS openaiResponseId,
      status,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM cv_prebuild_messages
    WHERE cv_prebuild_job_id = ?
    ORDER BY created_at ASC, id ASC
  `).bind(cvPrebuildJobId).all<CvPrebuildMessageRow>();
  return result.results ?? [];
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
