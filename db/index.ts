import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let schemaInitialization: Promise<void> | null = null;
const SCHEMA_VERSION = 4;
const SCHEMA_MARKER = `ivy_schema_v${SCHEMA_VERSION}`;

export async function getDb() {
  // Load the runtime binding only when an API request reaches the database.
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  if (!schemaInitialization) {
    schemaInitialization = (async () => {
  // D1 rejects writable user_version pragmas in production. A marker table
  // keeps the cold-start path to one read without touching application data.
  const version = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
  ).bind(SCHEMA_MARKER).first<{ name: string }>();
  if (version?.name === SCHEMA_MARKER) return;

  // Runtime initialization keeps local previews and fresh deployments usable.
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      title TEXT NOT NULL,
      region TEXT NOT NULL DEFAULT '美国',
      location TEXT NOT NULL DEFAULT '',
      track TEXT NOT NULL DEFAULT '',
      job_url TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '公司官网',
      fit INTEGER NOT NULL DEFAULT 3,
      interest INTEGER NOT NULL DEFAULT 3,
      priority TEXT NOT NULL DEFAULT 'P2',
      status TEXT NOT NULL DEFAULT '准备材料',
      deadline TEXT NOT NULL DEFAULT '',
      deadline_type TEXT NOT NULL DEFAULT 'unknown',
      deadline_source TEXT NOT NULL DEFAULT 'unknown',
      planned_application_date TEXT NOT NULL DEFAULT '',
      discovered_date TEXT NOT NULL DEFAULT '',
      applied_date TEXT NOT NULL DEFAULT '',
      follow_up_date TEXT NOT NULL DEFAULT '',
      next_action TEXT NOT NULL DEFAULT '准备申请材料',
      resume_version TEXT NOT NULL DEFAULT '',
      work_authorization TEXT NOT NULL DEFAULT '',
      interview_notes TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS application_status_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS application_status_events_application_id_idx
    ON application_status_events (application_id)
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS job_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      title TEXT NOT NULL,
      job_url TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '待核验',
      verification_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      title TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL,
      track TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      visa TEXT NOT NULL DEFAULT '需人工确认',
      evidence TEXT NOT NULL DEFAULT '',
      skills TEXT NOT NULL DEFAULT '[]',
      job_url TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL DEFAULT '公司官网',
      status TEXT NOT NULL DEFAULT '开放',
      deadline TEXT NOT NULL DEFAULT '',
      deadline_type TEXT NOT NULL DEFAULT 'unknown',
      discovered_at TEXT NOT NULL,
      checked_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS scan_status (
      id INTEGER PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'idle',
      ats_scanned INTEGER NOT NULL DEFAULT 0,
      ats_matched INTEGER NOT NULL DEFAULT 0,
      created INTEGER NOT NULL DEFAULT 0,
      updated INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      total_jobs INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT '',
      completed_at TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT ''
    )
  `).run();

  // Add columns introduced after the initial production database was created.
  const ensureColumn = async (table: string, column: string, definition: string) => {
    const result = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    if (!(result.results ?? []).some((row) => row.name === column)) {
      await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    }
  };
  await ensureColumn("applications", "application_id", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("applications", "deadline", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("applications", "deadline_type", "TEXT NOT NULL DEFAULT 'unknown'");
  await ensureColumn("applications", "deadline_source", "TEXT NOT NULL DEFAULT 'unknown'");
  await ensureColumn("applications", "planned_application_date", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("jobs", "canonical_url", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("jobs", "application_id", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("jobs", "deadline", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("jobs", "deadline_type", "TEXT NOT NULL DEFAULT 'unknown'");
  await ensureColumn("jobs", "last_seen_at", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("jobs", "missed_scan_count", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("jobs", "expiration_reason", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("scan_status", "phase", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("scan_status", "current_source", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("scan_status", "steps_completed", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("scan_status", "steps_total", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("scan_status", "scanned", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("scan_status", "unique_jobs", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("scan_status", "filtered", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("scan_status", "verified", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("scan_status", "eligible", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("scan_status", "progress_updated_at", "TEXT NOT NULL DEFAULT ''");

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS application_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      due_date TEXT NOT NULL DEFAULT '',
      reminder_date TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS interviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      round TEXT NOT NULL DEFAULT '一面',
      scheduled_at TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL DEFAULT 'Video',
      contact_name TEXT NOT NULL DEFAULT '',
      contact_email TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      outcome TEXT NOT NULL DEFAULT '待进行',
      thank_you_status TEXT NOT NULL DEFAULT '未发送',
      thank_you_due_at TEXT NOT NULL DEFAULT '',
      follow_up_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS company_research (
      company TEXT PRIMARY KEY,
      website TEXT NOT NULL DEFAULT '',
      careers_url TEXT NOT NULL DEFAULT '',
      business_summary TEXT NOT NULL DEFAULT '',
      recent_notes TEXT NOT NULL DEFAULT '',
      personal_notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )
  `).run();

  await env.DB.batch([
    env.DB.prepare("CREATE INDEX IF NOT EXISTS application_tasks_application_id_idx ON application_tasks (application_id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS interviews_application_id_idx ON interviews (application_id)"),
  ]);

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ignored_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      title TEXT NOT NULL,
      job_url TEXT NOT NULL DEFAULT '',
      fingerprint TEXT NOT NULL UNIQUE,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS saved_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS job_fact_scores (
      job_id INTEGER PRIMARY KEY,
      score_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS cv_prebuild_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      application_row_id INTEGER,
      prebuild_id TEXT NOT NULL DEFAULT '',
      generation_key TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      language TEXT NOT NULL DEFAULT '',
      track TEXT NOT NULL DEFAULT '',
      template_file TEXT NOT NULL DEFAULT '',
      jd_sha256 TEXT NOT NULL DEFAULT '',
      fact_master_sha TEXT NOT NULL DEFAULT '',
      prompt_version TEXT NOT NULL DEFAULT '',
      agent_trigger_run_id TEXT NOT NULL DEFAULT '',
      conversation_url TEXT NOT NULL DEFAULT '',
      openai_conversation_id TEXT NOT NULL DEFAULT '',
      openai_response_id TEXT NOT NULL DEFAULT '',
      openai_container_id TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      service_tier TEXT NOT NULL DEFAULT '',
      draft_tex_key TEXT NOT NULL DEFAULT '',
      draft_pdf_key TEXT NOT NULL DEFAULT '',
      draft_text_key TEXT NOT NULL DEFAULT '',
      review_key TEXT NOT NULL DEFAULT '',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      cached_input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT ''
    )
  `).run();

  await ensureColumn("cv_prebuild_jobs", "openai_conversation_id", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("cv_prebuild_jobs", "openai_response_id", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("cv_prebuild_jobs", "openai_container_id", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("cv_prebuild_jobs", "model", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("cv_prebuild_jobs", "service_tier", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("cv_prebuild_jobs", "draft_tex_key", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("cv_prebuild_jobs", "draft_pdf_key", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("cv_prebuild_jobs", "draft_text_key", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("cv_prebuild_jobs", "review_key", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("cv_prebuild_jobs", "input_tokens", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("cv_prebuild_jobs", "cached_input_tokens", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("cv_prebuild_jobs", "output_tokens", "INTEGER NOT NULL DEFAULT 0");

  await env.DB.batch([
    env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS cv_prebuild_jobs_job_id_updated_at_idx
      ON cv_prebuild_jobs (job_id, updated_at)
    `),
    env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS cv_prebuild_jobs_status_updated_at_idx
      ON cv_prebuild_jobs (status, updated_at)
    `),
    env.DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS cv_prebuild_jobs_generation_key_unique
      ON cv_prebuild_jobs (generation_key)
    `),
    env.DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS cv_prebuild_jobs_pending_job_unique
      ON cv_prebuild_jobs (job_id)
      WHERE generation_key IS NULL
    `),
  ]);

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS cv_prebuild_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cv_prebuild_job_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      openai_response_id TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  await env.DB.batch([
    env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS cv_prebuild_messages_job_created_at_idx
      ON cv_prebuild_messages (cv_prebuild_job_id, created_at)
    `),
    env.DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS cv_prebuild_messages_response_unique
      ON cv_prebuild_messages (openai_response_id)
    `),
  ]);

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS data_quality_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'queued',
      issue_keys TEXT NOT NULL DEFAULT '[]',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      last_attempt_at TEXT NOT NULL DEFAULT '',
      next_retry_at TEXT NOT NULL DEFAULT '',
      resolved_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS data_quality_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      processed INTEGER NOT NULL DEFAULT 0,
      merged INTEGER NOT NULL DEFAULT 0,
      resolved INTEGER NOT NULL DEFAULT 0,
      retrying INTEGER NOT NULL DEFAULT 0,
      needs_review INTEGER NOT NULL DEFAULT 0,
      failure_reasons TEXT NOT NULL DEFAULT '[]'
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      company TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      contact_type TEXT NOT NULL DEFAULT 'Recruiter',
      email TEXT NOT NULL DEFAULT '',
      linkedin_url TEXT NOT NULL DEFAULT '',
      application_id INTEGER,
      status TEXT NOT NULL DEFAULT '未联系',
      last_contact_at TEXT NOT NULL DEFAULT '',
      next_follow_up_at TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS interview_prep (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      interview_id INTEGER NOT NULL UNIQUE,
      checklist TEXT NOT NULL DEFAULT '[]',
      practice_notes TEXT NOT NULL DEFAULT '',
      questions_to_ask TEXT NOT NULL DEFAULT '',
      source_ids TEXT NOT NULL DEFAULT '[]',
      readiness INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS china_scan_status (
      id INTEGER PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      sources_completed INTEGER NOT NULL DEFAULT 0,
      sources_failed INTEGER NOT NULL DEFAULT 0,
      jobs_discovered INTEGER NOT NULL DEFAULT 0,
      jobs_eligible INTEGER NOT NULL DEFAULT 0,
      jobs_created INTEGER NOT NULL DEFAULT 0,
      jobs_updated_or_duplicate INTEGER NOT NULL DEFAULT 0,
      results TEXT NOT NULL DEFAULT '[]',
      finished_at TEXT NOT NULL DEFAULT '',
      received_at TEXT NOT NULL DEFAULT ''
    )
  `).run();

  await env.DB.batch([
    env.DB.prepare("CREATE INDEX IF NOT EXISTS contacts_company_idx ON contacts (company)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS contacts_application_id_idx ON contacts (application_id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS data_quality_runs_completed_at_idx ON data_quality_runs (completed_at)"),
  ]);

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_email TEXT PRIMARY KEY,
      full_name TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      work_authorization TEXT NOT NULL DEFAULT '',
      sponsorship_need TEXT NOT NULL DEFAULT '',
      education TEXT NOT NULL DEFAULT '',
      target_roles TEXT NOT NULL DEFAULT '',
      target_industries TEXT NOT NULL DEFAULT '',
      professional_summary TEXT NOT NULL DEFAULT '',
      skills TEXT NOT NULL DEFAULT '[]',
      autofill_profile_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  await ensureColumn("user_profiles", "autofill_profile_json", "TEXT NOT NULL DEFAULT '{}'");

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS profile_resumes (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      label TEXT NOT NULL,
      filename TEXT NOT NULL,
      object_key TEXT NOT NULL UNIQUE,
      content_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS profile_resumes_user_email_idx
    ON profile_resumes (user_email)
  `).run();

  // Migrate legacy tracker states into the simplified workflow.
  await env.DB.batch([
    env.DB.prepare("UPDATE applications SET status = '准备材料' WHERE status IN ('待研究', '已收藏')"),
    env.DB.prepare("UPDATE applications SET status = '已申请' WHERE status = 'HR筛选'"),
  ]);

  // Existing records start their auditable history at their current stage.
  await env.DB.prepare(`
    INSERT INTO application_status_events (application_id, status, occurred_at)
    SELECT applications.id, applications.status, applications.updated_at
    FROM applications
    WHERE NOT EXISTS (
      SELECT 1
      FROM application_status_events
      WHERE application_status_events.application_id = applications.id
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA_MARKER} (
      id INTEGER PRIMARY KEY CHECK (id = 1)
    )
  `).run();

    })().catch((error) => {
      schemaInitialization = null;
      throw error;
    });
  }
  await schemaInitialization;

  return drizzle(env.DB, { schema });
}

export async function getD1() {
  await getDb();
  const { env } = await import("cloudflare:workers");
  return env.DB;
}
