import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getD1, getDb } from "../../../../db";
import { jobs, savedJobs } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { templateFiles, type ArchiveLanguage, type ArchiveTrack } from "../../../lib/application-archive";
import { recommendCvPrebuildTemplate } from "../../../lib/cv-prebuild-bundle";
import {
  getLatestCvPrebuildJob,
  initializeCvPrebuildJob,
  setLatestCvPrebuildStatus,
} from "../../../lib/cv-prebuild-store";

export const dynamic = "force-dynamic";

const preservedStatuses = new Set([
  "preparing_bundle",
  "agent_queued",
  "agent_running",
  "ready",
]);

function parsePositiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request: NextRequest) {
  if (!(await getChatGPTUser())) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  }

  const jobId = parsePositiveInteger(body.jobId);
  const applicationRowId = parsePositiveInteger(body.applicationRowId);
  if (!jobId) {
    return NextResponse.json({ error: "A valid job id is required." }, { status: 400 });
  }
  const rawLanguage = String(body.language ?? "").trim();
  const requestedLanguage = rawLanguage === "zh" || rawLanguage === "en"
    ? rawLanguage as ArchiveLanguage
    : undefined;
  const rawTemplateTrack = String(body.templateTrack ?? "").trim();
  const requestedTrack = rawTemplateTrack
    && ["pharma", "tech", "quant", "consulting", "clinical_neuro"].includes(rawTemplateTrack)
    ? rawTemplateTrack as ArchiveTrack
    : undefined;
  if (rawLanguage && !requestedLanguage) {
    return NextResponse.json({ error: "A valid CV language is required." }, { status: 400 });
  }
  if (rawTemplateTrack && !requestedTrack) {
    return NextResponse.json({ error: "A valid CV template is required." }, { status: 400 });
  }

  const db = await getDb();
  const [[job], [saved]] = await Promise.all([
    db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1),
    db.select({ jobId: savedJobs.jobId }).from(savedJobs).where(eq(savedJobs.jobId, jobId)).limit(1),
  ]);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (!saved) {
    return NextResponse.json({ error: "Only a saved job can enter the CV queue." }, { status: 409 });
  }

  const database = await getD1();
  const now = new Date().toISOString();
  const { env } = await import("cloudflare:workers");
  const configured = Boolean(
    String(env.OPENAI_API_KEY ?? "").trim()
    && String(env.CV_GITHUB_TOKEN ?? "").trim(),
  );
  await initializeCvPrebuildJob(database, jobId, configured, now);
  let latest = await getLatestCvPrebuildJob(database, jobId);
  if (!latest) {
    return NextResponse.json({ error: "CV task could not be created." }, { status: 500 });
  }

  const selection = recommendCvPrebuildTemplate(job, requestedTrack, requestedLanguage);
  const selectedTemplateFile = templateFiles[selection.language][selection.track];
  if (!selectedTemplateFile) {
    return NextResponse.json({ error: "The selected CV template is unavailable." }, { status: 409 });
  }
  const selectionChanged = Boolean(
    latest.generationKey
    && (latest.language !== selection.language || latest.track !== selection.track),
  );
  if (selectionChanged) {
    await database.prepare(`
      UPDATE cv_prebuild_jobs
      SET status = 'stale', updated_at = ?
      WHERE id = ?
    `).bind(now, latest.id).run();
    await database.prepare(`
      INSERT INTO cv_prebuild_jobs (
        job_id, application_row_id, status, language, track, template_file,
        attempts, created_at, updated_at
      ) VALUES (?, ?, 'queued', ?, ?, ?, 0, ?, ?)
    `).bind(
      jobId,
      applicationRowId,
      selection.language,
      selection.track,
      selectedTemplateFile,
      now,
      now,
    ).run();
    latest = await getLatestCvPrebuildJob(database, jobId) ?? latest;
  } else if (!latest.generationKey) {
    await database.prepare(`
      UPDATE cv_prebuild_jobs
      SET application_row_id = COALESCE(?, application_row_id),
          language = ?, track = ?, template_file = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      applicationRowId,
      selection.language,
      selection.track,
      selectedTemplateFile,
      now,
      latest.id,
    ).run();
    latest = await getLatestCvPrebuildJob(database, jobId) ?? latest;
  }

  if (applicationRowId && !selectionChanged && latest.generationKey) {
    await database.prepare(`
      UPDATE cv_prebuild_jobs
      SET application_row_id = ?, updated_at = ?
      WHERE id = ?
    `).bind(applicationRowId, now, latest.id).run();
  }

  if (configured && !preservedStatuses.has(latest.status)) {
    await setLatestCvPrebuildStatus(database, jobId, "queued", now);
  }
  latest = await getLatestCvPrebuildJob(database, jobId) ?? latest;

  return NextResponse.json({
    jobId,
    applicationRowId,
    status: latest.status,
    language: selection.language,
    templateTrack: selection.track,
    templateFile: selectedTemplateFile,
  }, { status: 202 });
}
