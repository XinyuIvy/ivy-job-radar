import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getD1, getDb } from "../../../../db";
import { applications, jobs, savedJobs } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import type { ArchiveLanguage, ArchiveTrack } from "../../../lib/application-archive";
import { CV_PREBUILD_PROMPT_VERSION, recommendCvPrebuildTemplate } from "../../../lib/cv-prebuild-bundle";
import { getLatestCvPrebuildJob, initializeCvPrebuildJob } from "../../../lib/cv-prebuild-store";
import { sameLogicalJob } from "../../../lib/job-identity";

export const dynamic = "force-dynamic";

const supportedTracks = new Set<ArchiveTrack>([
  "pharma",
  "tech",
  "quant",
  "consulting",
  "clinical_neuro",
]);

export async function POST() {
  if (!(await getChatGPTUser())) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }

  const db = await getDb();
  const database = await getD1();
  const { env } = await import("cloudflare:workers");
  const configured = Boolean(
    String(env.OPENAI_API_KEY ?? "").trim()
    && String(env.CV_GITHUB_TOKEN ?? "").trim(),
  );
  const now = new Date().toISOString();
  const [pendingApplications, savedRows, jobRows] = await Promise.all([
    db.select().from(applications).where(eq(applications.status, "准备材料")).orderBy(desc(applications.updatedAt)),
    db.select().from(savedJobs),
    db.select().from(jobs),
  ]);
  const savedJobIds = new Set(savedRows.map((row) => row.jobId));
  const savedJobRows = jobRows.filter((job) => savedJobIds.has(job.id));
  const queued: Array<{ jobId: number; applicationRowId: number; language: string; templateTrack: string }> = [];
  const skipped: Array<{ applicationRowId: number; company: string; title: string; reason: string }> = [];
  const queuedJobIds = new Set<number>();

  for (const application of pendingApplications) {
    const job = savedJobRows.find((candidate) => sameLogicalJob(application, candidate));
    if (!job) {
      skipped.push({
        applicationRowId: application.id,
        company: application.company,
        title: application.title,
        reason: "未找到对应的已保存岗位",
      });
      continue;
    }
    if (queuedJobIds.has(job.id)) continue;

    await initializeCvPrebuildJob(database, job.id, configured, now);
    const latest = await getLatestCvPrebuildJob(database, job.id);
    if (
      latest?.promptVersion === CV_PREBUILD_PROMPT_VERSION
      && ["preparing_bundle", "agent_queued", "agent_running", "ready"].includes(latest.status)
    ) {
      skipped.push({
        applicationRowId: application.id,
        company: application.company,
        title: application.title,
        reason: "已使用最新 Prompt 生成或正在生成",
      });
      continue;
    }
    const requestedLanguage = latest?.language === "zh" || latest?.language === "en"
      ? latest.language as ArchiveLanguage
      : undefined;
    const requestedTrack = latest?.track && supportedTracks.has(latest.track as ArchiveTrack)
      ? latest.track as ArchiveTrack
      : undefined;
    const selection = recommendCvPrebuildTemplate(job, requestedTrack, requestedLanguage);

    await database.prepare(`
      UPDATE cv_prebuild_jobs
      SET status = 'stale', updated_at = ?
      WHERE job_id = ? AND generation_key IS NOT NULL
        AND status NOT IN ('cancelled', 'stale')
    `).bind(now, job.id).run();
    await database.prepare(`
      INSERT INTO cv_prebuild_jobs (
        job_id, application_row_id, status, language, track, template_file,
        attempts, last_error, created_at, updated_at, completed_at
      ) VALUES (?, ?, 'queued', ?, ?, ?, 0, '', ?, ?, '')
      ON CONFLICT(job_id) WHERE generation_key IS NULL DO UPDATE SET
        application_row_id = excluded.application_row_id,
        status = 'queued',
        language = excluded.language,
        track = excluded.track,
        template_file = excluded.template_file,
        attempts = 0,
        last_error = '',
        updated_at = excluded.updated_at,
        completed_at = ''
    `).bind(
      job.id,
      application.id,
      selection.language,
      selection.track,
      selection.templateFile,
      now,
      now,
    ).run();
    queuedJobIds.add(job.id);
    queued.push({
      jobId: job.id,
      applicationRowId: application.id,
      language: selection.language,
      templateTrack: selection.track,
    });
  }

  return NextResponse.json({
    ok: true,
    pendingCount: pendingApplications.length,
    queuedCount: queued.length,
    skippedCount: skipped.length,
    queued,
    skipped,
  }, { status: 202 });
}
