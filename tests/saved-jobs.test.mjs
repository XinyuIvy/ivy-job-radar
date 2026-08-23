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
      CREATE TABLE jobs (id INTEGER PRIMARY KEY);
      CREATE TABLE saved_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );
      INSERT INTO jobs (id) VALUES (1);
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

test("deleting a saved job persists and repeated deletion is safe", async () => {
  assert.equal(await deleteSavedJob(database, 1), true);
  assert.equal(await deleteSavedJob(database, 1), false);
  assert.deepEqual(await listSavedJobs(database), []);
});

test("saving an unknown job is rejected without creating a record", async () => {
  const result = await saveJob(database, 999, "2026-08-22T22:00:00.000Z");
  assert.equal(result.outcome, "missing");
  assert.equal(result.row, null);
  assert.deepEqual(await listSavedJobs(database), []);
});
