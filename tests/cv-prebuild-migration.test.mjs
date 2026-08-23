import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

function runMigration(database, filename) {
  const migration = readFileSync(new URL(`../drizzle/${filename}`, import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
}

test("Phase 1 databases migrate to generation history without duplicate placeholders", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
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
    INSERT INTO jobs (id, description, region, track)
      VALUES (7, 'Complete JD', '美国', 'Technology');
    INSERT INTO saved_jobs (job_id, created_at)
      VALUES (7, '2026-08-22T22:00:00.000Z');
  `);

  runMigration(database, "0013_secret_boom_boom.sql");
  runMigration(database, "0014_lonely_riptide.sql");
  runMigration(database, "0015_black_black_bird.sql");

  const placeholder = database.prepare(`
    SELECT job_id AS jobId, generation_key AS generationKey
    FROM cv_prebuild_jobs
  `).get();
  assert.deepEqual({ ...placeholder }, { jobId: 7, generationKey: null });

  database.prepare(`
    UPDATE cv_prebuild_jobs SET generation_key = ?, prebuild_id = ? WHERE job_id = ?
  `).run("a".repeat(64), "PRECV-2026-JOB-7-AAAAAAAA", 7);
  database.prepare(`
    INSERT INTO cv_prebuild_jobs (job_id, generation_key, prebuild_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    7,
    "b".repeat(64),
    "PRECV-2026-JOB-7-BBBBBBBB",
    "2026-08-22T22:01:00.000Z",
    "2026-08-22T22:01:00.000Z",
  );
  assert.equal(
    database.prepare("SELECT count(*) AS count FROM cv_prebuild_jobs WHERE job_id = 7").get().count,
    2,
  );

  database.prepare(`
    INSERT INTO cv_prebuild_jobs (job_id, created_at, updated_at) VALUES (?, ?, ?)
  `).run(7, "2026-08-22T22:02:00.000Z", "2026-08-22T22:02:00.000Z");
  assert.throws(() => {
    database.prepare(`
      INSERT INTO cv_prebuild_jobs (job_id, created_at, updated_at) VALUES (?, ?, ?)
    `).run(7, "2026-08-22T22:03:00.000Z", "2026-08-22T22:03:00.000Z");
  }, /UNIQUE constraint failed/);

  database.prepare(`
    INSERT INTO cv_prebuild_messages (
      cv_prebuild_job_id, role, content, openai_response_id, status, created_at, updated_at
    ) VALUES (?, 'assistant', 'ready', ?, 'completed', ?, ?)
  `).run(1, "resp_migration", "2026-08-22T22:04:00.000Z", "2026-08-22T22:04:00.000Z");
  assert.equal(database.prepare("SELECT count(*) AS count FROM cv_prebuild_messages").get().count, 1);
  assert.equal(
    database.prepare("SELECT openai_conversation_id AS id FROM cv_prebuild_jobs WHERE job_id = 7 LIMIT 1").get().id,
    "",
  );

  database.close();
});

test("pending applications move back to favorites without losing jobs or completed history", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE applications (
      id INTEGER PRIMARY KEY,
      company TEXT NOT NULL,
      title TEXT NOT NULL,
      region TEXT NOT NULL DEFAULT '中国',
      location TEXT NOT NULL DEFAULT '',
      track TEXT NOT NULL DEFAULT '',
      job_url TEXT NOT NULL DEFAULT '',
      application_id TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      fit INTEGER NOT NULL DEFAULT 3,
      status TEXT NOT NULL,
      deadline TEXT NOT NULL DEFAULT '',
      deadline_type TEXT NOT NULL DEFAULT 'unknown',
      next_action TEXT NOT NULL DEFAULT '',
      work_authorization TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      title TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL,
      track TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      visa TEXT NOT NULL DEFAULT '',
      evidence TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      skills TEXT NOT NULL DEFAULT '[]',
      job_url TEXT NOT NULL UNIQUE,
      canonical_url TEXT NOT NULL DEFAULT '',
      application_id TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '开放',
      deadline TEXT NOT NULL DEFAULT '',
      deadline_type TEXT NOT NULL DEFAULT 'unknown',
      last_seen_at TEXT NOT NULL DEFAULT '',
      missed_scan_count INTEGER NOT NULL DEFAULT 0,
      expiration_reason TEXT NOT NULL DEFAULT '',
      discovered_at TEXT NOT NULL,
      checked_at TEXT NOT NULL
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
      status TEXT NOT NULL,
      last_error TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE application_status_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );
    INSERT INTO jobs (
      id, company, title, region, track, job_url, application_id, discovered_at, checked_at
    ) VALUES (
      7, 'Existing Co', 'Existing Role', '中国', 'Technology',
      'https://example.com/jobs/7', 'REQ-7', '2026-08-23T10:00:00.000Z', '2026-08-23T10:00:00.000Z'
    );
    INSERT INTO applications (
      id, company, title, track, job_url, application_id, source, fit, status, notes, created_at, updated_at
    ) VALUES
      (21, 'Existing Co', 'Existing Role', 'Technology', 'https://example.com/jobs/7', 'REQ-7', '官网', 5, '准备材料', 'Existing JD', '2026-08-23T10:00:00.000Z', '2026-08-23T10:00:00.000Z'),
      (22, 'New Co', 'New Role', 'Quant', 'https://example.com/jobs/22', '', '官网', 4, '准备材料', 'Complete new JD', '2026-08-23T11:00:00.000Z', '2026-08-23T11:00:00.000Z'),
      (23, 'Applied Co', 'Applied Role', 'Technology', 'https://example.com/jobs/23', '', '官网', 4, '已申请', 'Applied JD', '2026-08-23T12:00:00.000Z', '2026-08-23T12:00:00.000Z');
    INSERT INTO cv_prebuild_jobs (
      job_id, application_row_id, status, updated_at
    ) VALUES (7, 21, 'agent_queued', '2026-08-23T10:05:00.000Z');
  `);

  runMigration(database, "0016_move_pending_to_favorites.sql");

  assert.deepEqual(
    database.prepare("SELECT id, status FROM applications ORDER BY id").all().map((row) => ({ ...row })),
    [
      { id: 21, status: "收藏" },
      { id: 22, status: "收藏" },
      { id: 23, status: "已申请" },
    ],
  );
  assert.equal(database.prepare("SELECT count(*) AS count FROM saved_jobs").get().count, 2);
  assert.equal(database.prepare("SELECT status FROM cv_prebuild_jobs WHERE application_row_id = 21").get().status, "cancelled");
  assert.equal(database.prepare("SELECT description FROM jobs WHERE job_url = 'https://example.com/jobs/22'").get().description, "Complete new JD");
  assert.equal(database.prepare("SELECT count(*) AS count FROM application_status_events WHERE status = '收藏'").get().count, 2);

  database.close();
});
