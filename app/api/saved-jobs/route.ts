import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getD1, getDb } from "../../../db";
import { applications, jobs } from "../../../db/schema";
import { cancelCvPrebuildJob } from "../../lib/cv-prebuild-store";
import {
  inferCvTemplateLanguage,
  inferCvTemplateTrack,
  isCvTemplateFilename,
} from "../../lib/cv-template-catalog";
import { extractCoreJobDescription } from "../../lib/job-description";
import { scoreStoredJob } from "../../lib/job-scoring";
import { sameLogicalJob } from "../../lib/job-identity";
import {
  deleteSavedJob,
  listSavedJobs,
  saveJob,
  updateSavedJobCvSelection,
} from "../../lib/saved-jobs-store";

export const dynamic = "force-dynamic";

function parseJobId(value: unknown) {
  const jobId = Number(value);
  return Number.isSafeInteger(jobId) && jobId > 0 ? jobId : null;
}

export async function GET() {
  const rows = await listSavedJobs(await getD1());
  return NextResponse.json(rows, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  }

  let jobId = parseJobId(body.jobId);
  const applicationRowId = parseJobId(body.applicationRowId);
  const now = new Date().toISOString();
  if (!jobId && applicationRowId) {
    const db = await getDb();
    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationRowId))
      .limit(1);
    if (!application) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }
    const jobUrl = application.jobUrl.trim();
    const description = extractCoreJobDescription(application.notes).text;
    if (!jobUrl || !description) {
      return NextResponse.json({
        error: "This application needs an original JD link and complete JD text before CV generation.",
      }, { status: 409 });
    }
    let [linkedJob] = await db.select().from(jobs).where(eq(jobs.jobUrl, jobUrl)).limit(1);
    if (!linkedJob) {
      const scoring = scoreStoredJob({
        title: application.title,
        content: description,
        region: application.region || "中国",
      });
      await db.insert(jobs).values({
        company: application.company,
        title: application.title,
        location: application.location,
        region: application.region || "中国",
        track: application.track || "Technology",
        score: scoring.score,
        visa: scoring.visa,
        evidence: "由申请记录中的网页文本提取核心 JD。",
        description,
        skills: "[]",
        jobUrl,
        canonicalUrl: jobUrl,
        applicationId: application.applicationId,
        source: application.source || "申请记录",
        status: "开放",
        deadline: application.deadline,
        deadlineType: application.deadlineType,
        lastSeenAt: now,
        discoveredAt: application.createdAt || now,
        checkedAt: now,
      }).onConflictDoNothing();
      [linkedJob] = await db.select().from(jobs).where(eq(jobs.jobUrl, jobUrl)).limit(1);
    }
    jobId = linkedJob?.id ?? null;
  }
  if (!jobId) {
    return NextResponse.json({ error: "A valid job or application id is required." }, { status: 400 });
  }

  const database = await getD1();
  const result = await saveJob(database, jobId, now);
  if (result.outcome === "missing") {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  return NextResponse.json({
    ...result.row,
    created: result.outcome === "created",
  }, {
    status: result.outcome === "created" ? 201 : 200,
  });
}

export async function PUT(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  }

  const jobId = parseJobId(body.jobId);
  const language = String(body.language ?? "").trim();
  const templateFile = String(body.templateFile ?? "").trim();
  if (!jobId) {
    return NextResponse.json({ error: "A valid job id is required." }, { status: 400 });
  }
  if (language !== "zh" && language !== "en") {
    return NextResponse.json({ error: "A valid CV language is required." }, { status: 400 });
  }
  if (!isCvTemplateFilename(templateFile)) {
    return NextResponse.json({ error: "A valid CV template filename is required." }, { status: 400 });
  }
  if (inferCvTemplateLanguage(templateFile) !== language) {
    return NextResponse.json({ error: "CV template language does not match the selected language." }, { status: 400 });
  }

  const db = await getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const database = await getD1();
  const now = new Date().toISOString();
  const saved = await updateSavedJobCvSelection(
    database,
    jobId,
    { language, templateFile },
    now,
  );
  if (!saved) return NextResponse.json({ error: "Saved job not found." }, { status: 404 });

  const applicationRows = await db.select().from(applications);
  const linkedApplication = applicationRows.find((application) => sameLogicalJob(application, job));
  const applicationCanFollowSelection = Boolean(
    linkedApplication
    && ["收藏", "准备材料"].includes(linkedApplication.status)
    && !/@[0-9a-f]{7,40}$/i.test(linkedApplication.resumeVersion),
  );
  if (linkedApplication && applicationCanFollowSelection) {
    await db.update(applications).set({
      resumeVersion: templateFile,
      updatedAt: now,
    }).where(eq(applications.id, linkedApplication.id));
  }

  let cvRequeued = false;
  if (linkedApplication?.status === "准备材料") {
    const track = inferCvTemplateTrack(templateFile);
    await database.prepare(`
      UPDATE cv_prebuild_jobs
      SET status = 'stale', updated_at = ?
      WHERE job_id = ? AND generation_key IS NOT NULL
        AND status NOT IN ('cancelled', 'stale')
        AND (language <> ? OR template_file <> ?)
    `).bind(now, jobId, language, templateFile).run();
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
      jobId,
      linkedApplication.id,
      language,
      track,
      templateFile,
      now,
      now,
    ).run();
    cvRequeued = true;
  }

  return NextResponse.json({
    ...saved,
    applicationUpdated: applicationCanFollowSelection,
    frozenApplicationPreserved: Boolean(linkedApplication && !applicationCanFollowSelection),
    cvRequeued,
  });
}

export async function DELETE(request: NextRequest) {
  const jobId = parseJobId(request.nextUrl.searchParams.get("jobId"));
  if (!jobId) {
    return NextResponse.json({ error: "A valid job id is required." }, { status: 400 });
  }

  const database = await getD1();
  const deleted = await deleteSavedJob(database, jobId);
  if (deleted) {
    try {
      await cancelCvPrebuildJob(database, jobId, new Date().toISOString());
    } catch {
      // Removing the saved relation must not depend on prebuild state cleanup.
    }
  }
  return NextResponse.json({ ok: true, jobId, deleted });
}
