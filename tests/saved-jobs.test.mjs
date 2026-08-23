import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test, { after } from "node:test";

import { createServer } from "vite";

class D1Statement {
  constructor(statement, values = []) {
    this.statement = statement;
    this.values = values;
  }

  bind(...values) {
    return new D1Statement(this.statement, values);
  }

  async first() {
    return this.statement.get(...this.values) ?? null;
  }

  async all() {
    return { results: this.statement.all(...this.values) };
  }

  async run() {
    const result = this.statement.run(...this.values);
    return { meta: { changes: Number(result.changes) } };
  }
}

class TestD1Database {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec(`
      CREATE TABLE jobs (
        id INTEGER PRIMARY KEY,
        description TEXT NOT NULL DEFAULT '',
        region TEXT NOT NULL DEFAULT '美国',
        track TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE saved_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE TABLE cv_prebuild_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        application_row_id INTEGER,
        prebuild_id TEXT NOT NULL DEFAULT '',
        generation_key TEXT UNIQUE,
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
      );
      CREATE UNIQUE INDEX cv_prebuild_jobs_generation_key_unique
        ON cv_prebuild_jobs (generation_key);
      CREATE UNIQUE INDEX cv_prebuild_jobs_pending_job_unique
        ON cv_prebuild_jobs (job_id) WHERE generation_key IS NULL;
      CREATE TABLE cv_prebuild_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cv_prebuild_job_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        openai_response_id TEXT,
        status TEXT NOT NULL DEFAULT 'completed',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX cv_prebuild_messages_response_unique
        ON cv_prebuild_messages (openai_response_id);
      INSERT INTO jobs (id, description, region, track) VALUES
        (1, '', '美国', 'Technology'),
        (2, 'Complete role description', '中国', 'Pharma');
    `);
  }

  prepare(sql) {
    return new D1Statement(this.sqlite.prepare(sql));
  }
}

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const {
  deleteSavedJob,
  listSavedJobs,
  saveJob,
} = await vite.ssrLoadModule("/app/lib/saved-jobs-store.ts");
const {
  beginCvPrebuildGeneration,
  cancelCvPrebuildJob,
  completeCvPrebuildBundle,
  completeAssistantMessage,
  ensurePendingAssistantMessage,
  getLatestCvPrebuildJob,
  initializeCvPrebuildJob,
  listCvPrebuildMessages,
  startCvPrebuildRun,
} = await vite.ssrLoadModule("/app/lib/cv-prebuild-store.ts");
const {
  cvPrebuildStatusView,
  initialCvPrebuildStatus,
} = await vite.ssrLoadModule("/app/lib/cv-prebuild-status.ts");
const database = new TestD1Database();

after(async () => {
  database.sqlite.close();
  await vite.close();
});

test("saved jobs survive a new store call and duplicate saves stay idempotent", async () => {
  const createdAt = "2026-08-22T22:00:00.000Z";
  const created = await saveJob(database, 1, createdAt);
  assert.equal(created.outcome, "created");
  assert.deepEqual({ ...created.row }, { id: 1, jobId: 1, createdAt });

  const duplicate = await saveJob(database, 1, "2026-08-22T23:00:00.000Z");
  assert.equal(duplicate.outcome, "existing");
  assert.deepEqual({ ...duplicate.row }, { ...created.row });

  const persisted = await listSavedJobs(database);
  assert.deepEqual(persisted.map((row) => ({ ...row })), [{ ...created.row }]);
});

test("prebuild state blocks missing JD before configuration and stays idempotent", async () => {
  const now = "2026-08-22T22:10:00.000Z";
  assert.equal(initialCvPrebuildStatus("", false), "blocked_missing_jd");
  assert.equal(initialCvPrebuildStatus("Complete JD", false), "blocked_configuration");
  assert.equal(initialCvPrebuildStatus("Complete JD", true), "queued");

  const missingJd = await initializeCvPrebuildJob(database, 1, false, now);
  assert.equal(missingJd.status, "blocked_missing_jd");
  assert.equal(missingJd.language, "en");

  const blockedConfiguration = await initializeCvPrebuildJob(database, 2, false, now);
  assert.equal(blockedConfiguration.status, "blocked_configuration");
  assert.equal(blockedConfiguration.language, "zh");

  const configured = await initializeCvPrebuildJob(
    database,
    2,
    true,
    "2026-08-22T22:11:00.000Z",
  );
  assert.equal(configured.status, "queued");
  assert.equal(database.sqlite.prepare("SELECT count(*) AS count FROM cv_prebuild_jobs").get().count, 2);
});

test("generation keys are idempotent and preserve stale bundle history", async () => {
  const first = await beginCvPrebuildGeneration(database, {
    jobId: 2,
    prebuildId: "PRECV-2026-JOB-2-AAAAAAAA",
    generationKey: "a".repeat(64),
    language: "zh",
    track: "pharma",
    templateFile: "cv_pharma_cn.tex",
    jdSha256: "b".repeat(64),
    factMasterSha: "fact-a",
    promptVersion: "cv-prebuilder-v1",
    now: "2026-08-22T22:12:00.000Z",
  });
  assert.equal(first.outcome, "created");
  assert.equal(first.row.status, "preparing_bundle");
  await completeCvPrebuildBundle(
    database,
    "a".repeat(64),
    "blocked_configuration",
    "2026-08-22T22:13:00.000Z",
  );

  const duplicate = await beginCvPrebuildGeneration(database, {
    jobId: 2,
    prebuildId: "PRECV-2026-JOB-2-AAAAAAAA",
    generationKey: "a".repeat(64),
    language: "zh",
    track: "pharma",
    templateFile: "cv_pharma_cn.tex",
    jdSha256: "b".repeat(64),
    factMasterSha: "fact-a",
    promptVersion: "cv-prebuilder-v1",
    now: "2026-08-22T22:14:00.000Z",
  });
  assert.equal(duplicate.outcome, "existing");

  const changed = await beginCvPrebuildGeneration(database, {
    jobId: 2,
    prebuildId: "PRECV-2026-JOB-2-BBBBBBBB",
    generationKey: "c".repeat(64),
    language: "zh",
    track: "pharma",
    templateFile: "cv_pharma_cn.tex",
    jdSha256: "d".repeat(64),
    factMasterSha: "fact-b",
    promptVersion: "cv-prebuilder-v1",
    now: "2026-08-22T22:15:00.000Z",
  });
  assert.equal(changed.outcome, "created");
  const rows = database.sqlite.prepare(`
    SELECT generation_key AS generationKey, status
    FROM cv_prebuild_jobs
    WHERE job_id = 2
    ORDER BY id
  `).all();
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    { generationKey: "a".repeat(64), status: "stale" },
    { generationKey: "c".repeat(64), status: "preparing_bundle" },
  ]);

  const reverted = await beginCvPrebuildGeneration(database, {
    jobId: 2,
    prebuildId: "PRECV-2026-JOB-2-AAAAAAAA",
    generationKey: "a".repeat(64),
    language: "zh",
    track: "pharma",
    templateFile: "cv_pharma_cn.tex",
    jdSha256: "b".repeat(64),
    factMasterSha: "fact-a",
    promptVersion: "cv-prebuilder-v1",
    now: "2026-08-22T22:16:00.000Z",
  });
  assert.equal(reverted.outcome, "retry");
  assert.equal(reverted.row.status, "preparing_bundle");
  const current = await getLatestCvPrebuildJob(database, 2);
  assert.equal(current.generationKey, "a".repeat(64));
  assert.equal(current.status, "preparing_bundle");
  assert.deepEqual(
    database.sqlite.prepare(`
      SELECT generation_key AS generationKey, status
      FROM cv_prebuild_jobs
      WHERE job_id = 2
      ORDER BY id
    `).all().map((row) => ({ ...row })),
    [
      { generationKey: "a".repeat(64), status: "preparing_bundle" },
      { generationKey: "c".repeat(64), status: "stale" },
    ],
  );
});

test("all Phase 1 terminal and blocked states have a visible badge", () => {
  for (const status of [
    "blocked_missing_jd",
    "blocked_configuration",
    "stale",
    "failed_retryable",
    "failed_terminal",
  ]) {
    assert.match(cvPrebuildStatusView(status).label, /^CV 预生成：/);
  }
});

test("Phase 3 stores one durable conversation and ordered messages per job", async () => {
  const row = await startCvPrebuildRun(database, "a".repeat(64), {
    conversationId: "conv_123",
    responseId: "resp_123",
    model: "gpt-5.6-terra",
    serviceTier: "flex",
    now: "2026-08-22T22:17:00.000Z",
  });
  await ensurePendingAssistantMessage(database, row.id, "resp_123", "2026-08-22T22:17:00.000Z");
  await completeAssistantMessage(database, "resp_123", "Draft ready", "2026-08-22T22:18:00.000Z");
  const messages = await listCvPrebuildMessages(database, row.id);
  assert.equal(row.openaiConversationId, "conv_123");
  assert.equal(row.openaiResponseId, "resp_123");
  assert.deepEqual(messages.map((message) => ({ role: message.role, content: message.content, status: message.status })), [
    { role: "assistant", content: "Draft ready", status: "completed" },
  ]);
});

test("deleting a saved job persists and repeated deletion is safe", async () => {
  assert.equal(await deleteSavedJob(database, 1), true);
  assert.equal(await cancelCvPrebuildJob(database, 1, "2026-08-22T22:20:00.000Z"), true);
  assert.equal(
    database.sqlite.prepare("SELECT status FROM cv_prebuild_jobs WHERE job_id = 1").get().status,
    "cancelled",
  );
  assert.equal(await deleteSavedJob(database, 1), false);
  assert.deepEqual(await listSavedJobs(database), []);
});

test("saving an unknown job is rejected without creating a record", async () => {
  const result = await saveJob(database, 999, "2026-08-22T22:00:00.000Z");
  assert.equal(result.outcome, "missing");
  assert.equal(result.row, null);
  assert.deepEqual(await listSavedJobs(database), []);
});
