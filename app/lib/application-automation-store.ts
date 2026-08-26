import type { AutomationConfig, AutomationTaskStatus } from "./application-automation";
import { defaultAutomationConfig } from "./application-automation";

type StatementResult = { meta?: { changes?: number } };

type PreparedStatement = {
  bind: (...values: unknown[]) => PreparedStatement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results?: T[] }>;
  run: () => Promise<StatementResult>;
};

export type AutomationDatabase = {
  prepare: (sql: string) => PreparedStatement;
};

export type AutomationTaskRow = {
  id: number;
  jobId: number;
  applicationRowId: number | null;
  status: AutomationTaskStatus;
  stage: string;
  atsProvider: string;
  language: string;
  templateTrack: string;
  eligibilityScore: number;
  decisionJson: string;
  blockerJson: string;
  claimToken: string;
  claimedAt: string;
  attempts: number;
  lastError: string;
  submittedAt: string;
  confirmationText: string;
  createdAt: string;
  updatedAt: string;
  company: string;
  title: string;
  location: string;
  jobUrl: string;
  cvStatus: string;
  cvUpdatedAt: string;
  draftPdfKey: string;
};

export async function getAutomationConfig(database: AutomationDatabase): Promise<AutomationConfig> {
  const row = await database.prepare(`
    SELECT enabled, execution_mode AS executionMode, daily_limit AS dailyLimit,
      minimum_score AS minimumScore, default_language AS defaultLanguage,
      allowed_ats_json AS allowedAtsJson, final_submit_enabled AS finalSubmitEnabled,
      updated_at AS updatedAt
    FROM application_automation_config
    WHERE id = 1
  `).first<{
    enabled: number;
    executionMode: string;
    dailyLimit: number;
    minimumScore: number;
    defaultLanguage: string;
    allowedAtsJson: string;
    finalSubmitEnabled: number;
    updatedAt: string;
  }>();
  if (!row) return defaultAutomationConfig();
  let allowedAts: AutomationConfig["allowedAts"] = defaultAutomationConfig().allowedAts;
  try {
    const parsed = JSON.parse(row.allowedAtsJson) as unknown;
    if (Array.isArray(parsed)) allowedAts = parsed.map(String).filter((value) =>
      ["greenhouse", "lever", "ashby", "workday", "icims", "unknown"].includes(value),
    ) as AutomationConfig["allowedAts"];
  } catch {}
  return {
    enabled: Boolean(row.enabled),
    executionMode: row.executionMode === "automatic" ? "automatic" : "pilot",
    dailyLimit: Math.max(1, Math.min(5, row.dailyLimit || 3)),
    minimumScore: Math.max(70, Math.min(95, row.minimumScore || 75)),
    defaultLanguage: row.defaultLanguage === "zh" ? "zh" : "en",
    allowedAts,
    finalSubmitEnabled: Boolean(row.finalSubmitEnabled),
    updatedAt: row.updatedAt,
  };
}

export async function reconcileAutomationTasks(database: AutomationDatabase, now: string) {
  await database.prepare(`
    UPDATE application_automation_tasks
    SET status = 'ready_for_browser', stage = 'claim_released', claim_token = '',
      claimed_at = '', last_error = 'STALE_BROWSER_CLAIM', updated_at = ?
    WHERE status IN ('claimed', 'filling')
      AND claimed_at <> ''
      AND julianday(claimed_at) < julianday(?) - (30.0 / 1440.0)
  `).bind(now, now).run();

  await database.prepare(`
    UPDATE application_automation_tasks
    SET status = 'cv_failed', stage = 'cv_failed',
      last_error = COALESCE((
        SELECT cv.last_error FROM cv_prebuild_jobs AS cv
        WHERE cv.job_id = application_automation_tasks.job_id
        ORDER BY CASE WHEN cv.status = 'stale' THEN 1 ELSE 0 END,
          cv.updated_at DESC, cv.id DESC
        LIMIT 1
      ), 'CV_PREBUILD_FAILED'), updated_at = ?
    WHERE status = 'awaiting_cv'
      AND EXISTS (
        SELECT 1 FROM cv_prebuild_jobs AS cv
        WHERE cv.job_id = application_automation_tasks.job_id
          AND cv.status IN ('failed_terminal', 'blocked_missing_jd', 'blocked_configuration')
          AND cv.id = (
            SELECT latest.id FROM cv_prebuild_jobs AS latest
            WHERE latest.job_id = application_automation_tasks.job_id
            ORDER BY CASE WHEN latest.status = 'stale' THEN 1 ELSE 0 END,
              latest.updated_at DESC, latest.id DESC
            LIMIT 1
          )
      )
  `).bind(now).run();
}

export async function listAutomationTasks(database: AutomationDatabase, limit = 100) {
  const result = await database.prepare(`
    SELECT task.id, task.job_id AS jobId, task.application_row_id AS applicationRowId,
      task.status, task.stage, task.ats_provider AS atsProvider, task.language,
      task.template_track AS templateTrack, task.eligibility_score AS eligibilityScore,
      task.decision_json AS decisionJson, task.blocker_json AS blockerJson,
      task.claim_token AS claimToken, task.claimed_at AS claimedAt,
      task.attempts, task.last_error AS lastError, task.submitted_at AS submittedAt,
      task.confirmation_text AS confirmationText, task.created_at AS createdAt,
      task.updated_at AS updatedAt, job.company, job.title, job.location,
      job.job_url AS jobUrl,
      COALESCE((SELECT cv.status FROM cv_prebuild_jobs AS cv
        WHERE cv.job_id = task.job_id
        ORDER BY CASE WHEN cv.status = 'stale' THEN 1 ELSE 0 END,
          cv.updated_at DESC, cv.id DESC LIMIT 1), '') AS cvStatus,
      COALESCE((SELECT cv.updated_at FROM cv_prebuild_jobs AS cv
        WHERE cv.job_id = task.job_id
        ORDER BY CASE WHEN cv.status = 'stale' THEN 1 ELSE 0 END,
          cv.updated_at DESC, cv.id DESC LIMIT 1), '') AS cvUpdatedAt,
      COALESCE((SELECT cv.draft_pdf_key FROM cv_prebuild_jobs AS cv
        WHERE cv.job_id = task.job_id
        ORDER BY CASE WHEN cv.status = 'stale' THEN 1 ELSE 0 END,
          cv.updated_at DESC, cv.id DESC LIMIT 1), '') AS draftPdfKey
    FROM application_automation_tasks AS task
    JOIN jobs AS job ON job.id = task.job_id
    ORDER BY task.updated_at DESC, task.id DESC
    LIMIT ?
  `).bind(limit).all<AutomationTaskRow>();
  return result.results ?? [];
}

export async function updateAutomationTask(
  database: AutomationDatabase,
  taskId: number,
  input: {
    status: AutomationTaskStatus;
    stage: string;
    error?: string;
    confirmationText?: string;
    now: string;
    claimToken?: string;
  },
) {
  const submittedAt = input.status === "submitted" ? input.now : "";
  const result = await database.prepare(`
    UPDATE application_automation_tasks
    SET status = ?, stage = ?, last_error = ?, confirmation_text = ?,
      submitted_at = CASE WHEN ? <> '' THEN ? ELSE submitted_at END,
      claim_token = CASE WHEN ? <> '' THEN ? ELSE claim_token END,
      attempts = CASE WHEN ? = 'claimed' THEN attempts + 1 ELSE attempts END,
      claimed_at = CASE WHEN ? = 'claimed' THEN ? ELSE claimed_at END,
      updated_at = ?
    WHERE id = ?
  `).bind(
    input.status,
    input.stage.slice(0, 80),
    String(input.error || "").slice(0, 500),
    String(input.confirmationText || "").slice(0, 1000),
    submittedAt,
    submittedAt,
    input.claimToken || "",
    input.claimToken || "",
    input.status,
    input.status,
    input.now,
    input.now,
    taskId,
  ).run();
  return Number(result.meta?.changes ?? 0) > 0;
}
