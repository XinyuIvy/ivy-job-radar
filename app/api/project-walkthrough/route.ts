import { NextRequest, NextResponse } from "next/server";
import { getChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

// Every statement is fixed and read-only. No table name or SQL comes from the request.
const queries: Record<string, string> = {
  jobs: "SELECT id, company, title, location, job_url, canonical_url, application_id, description, source, status, checked_at FROM jobs ORDER BY id DESC LIMIT 5",
  applications: "SELECT id, company, title, status, updated_at FROM applications ORDER BY id DESC LIMIT 5",
  saved: "SELECT job_id, created_at FROM saved_jobs ORDER BY job_id DESC LIMIT 5",
  cv: "SELECT id, job_id, prebuild_id, status, model, prompt_version, draft_tex_key, draft_pdf_key, draft_text_key, review_key, decision_key, updated_at FROM cv_prebuild_jobs ORDER BY CASE WHEN draft_pdf_key <> '' THEN 0 ELSE 1 END, updated_at DESC LIMIT 5",
  automation: "SELECT id, job_id, status, stage, ats_provider, attempts, updated_at FROM application_automation_tasks ORDER BY id DESC LIMIT 5",
  scores: "SELECT job_id, score_json, updated_at FROM job_fact_scores ORDER BY updated_at DESC LIMIT 3",
};

type Db = { prepare: (sql: string) => { all: () => Promise<{ results?: unknown[] }>; bind: (value: number) => { all: () => Promise<{ results?: unknown[] }> } } };
type Bucket = {
  list: (options: { prefix: string; limit: number }) => Promise<{ objects: { key: string; size: number }[]; truncated?: boolean }>;
  get: (key: string) => Promise<{ size: number; text: () => Promise<string> } | null>;
};

export async function GET(request: NextRequest) {
  if (!(await getChatGPTUser())) return NextResponse.json({ error: "Sign in is required." }, { status: 401, headers });
  const view = request.nextUrl.searchParams.get("view") || "jobs";
  if (!Object.hasOwn(queries, view) && view !== "vectors") return NextResponse.json({ error: "Unknown read-only view." }, { status: 400, headers });
  const { env } = await import("cloudflare:workers");
  try {
    if (view === "vectors") {
      const bucket = env.BUCKET as unknown as Bucket | undefined;
      if (!bucket) return NextResponse.json({ error: "R2 is not bound." }, { status: 503, headers });
      const requestedKey = request.nextUrl.searchParams.get("key");
      if (requestedKey) {
        if (!/^evidence-rag\/[a-f0-9]+\/qwen3-embedding-0\.6b\/\d+\.json$/.test(requestedKey)) return NextResponse.json({ error: "This key is not an allowed vector object." }, { status: 400, headers });
        const object = await bucket.get(requestedKey);
        if (!object) return NextResponse.json({ error: "Object not found." }, { status: 404, headers });
        if (object.size > 2_000_000) return NextResponse.json({ error: "Object exceeds the teaching viewer size limit." }, { status: 413, headers });
        return new NextResponse(await object.text(), { headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
      }
      const result = await bucket.list({ prefix: "evidence-rag/", limit: 3 });
      return NextResponse.json({ observedAt: new Date().toISOString(), note: "R2 cache examples, not guaranteed to be the current fact-set fingerprint. No model request or cache write is performed.", objects: result.objects.map(object => ({ ...object, readUrl: `/api/project-walkthrough?view=vectors&key=${encodeURIComponent(object.key)}` })), truncated: result.truncated }, { headers });
    }
    const db = env.DB as unknown as Db | undefined;
    if (!db) return NextResponse.json({ error: "D1 is not bound." }, { status: 503, headers });
    const jobIdText = request.nextUrl.searchParams.get("jobId");
    const jobId = jobIdText ? Number(jobIdText) : null;
    if (jobIdText && (!Number.isSafeInteger(jobId) || Number(jobId) <= 0 || view === "applications")) return NextResponse.json({ error: "Use a positive jobId for jobs, saved, cv, automation or scores." }, { status: 400, headers });
    const sql = jobId ? queries[view].replace(" ORDER BY", ` WHERE ${view === "jobs" ? "id" : "job_id"} = ? ORDER BY`) : queries[view];
    const statement = db.prepare(sql);
    const result = await (jobId ? statement.bind(jobId) : statement).all();
    return NextResponse.json({ observedAt: new Date().toISOString(), view, sql, jobId, rows: result.results || [], note: "A bounded live sample; not an export and not joined to a specific scan run. No migrations or writes are executed." }, { headers });
  } catch {
    return NextResponse.json({ error: "This sample is unavailable. A table, column, or binding may be absent; check the schema and deployment. No data has been generated to fill the gap." }, { status: 503, headers });
  }
}
