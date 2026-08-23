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
        job_id INTEGER NOT NULL UNIQUE,
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
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT NOT NULL DEFAULT ''
      );
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
  cancelCvPrebuildJob,
  initializeCvPrebuildJob,
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
  assert.equal(blockedConfiguration.language, "zh-CN");

  const configured = await initializeCvPrebuildJob(
    database,
    2,
    true,
    "2026-08-22T22:11:00.000Z",
  );
  assert.equal(configured.status, "queued");
  assert.equal(database.sqlite.prepare("SELECT count(*) AS count FROM cv_prebuild_jobs").get().count, 2);
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
