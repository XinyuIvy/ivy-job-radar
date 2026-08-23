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

  database.close();
});
