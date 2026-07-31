import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export async function getDb() {
  // Load the runtime binding only when an API request reaches the database.
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

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
      status TEXT NOT NULL DEFAULT '已收藏',
      discovered_date TEXT NOT NULL DEFAULT '',
      applied_date TEXT NOT NULL DEFAULT '',
      follow_up_date TEXT NOT NULL DEFAULT '',
      next_action TEXT NOT NULL DEFAULT '研究JD',
      resume_version TEXT NOT NULL DEFAULT '',
      work_authorization TEXT NOT NULL DEFAULT '',
      interview_notes TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
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
      discovered_at TEXT NOT NULL,
      checked_at TEXT NOT NULL
    )
  `).run();

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

  return drizzle(env.DB, { schema });
}
