import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getD1, getDb } from "../../../db";
import { applications, jobs } from "../../../db/schema";
import { cancelCvPrebuildJob } from "../../lib/cv-prebuild-store";
import { extractCoreJobDescription } from "../../lib/job-description";
import { scoreStoredJob } from "../../lib/job-scoring";
import { deleteSavedJob, listSavedJobs, saveJob } from "../../lib/saved-jobs-store";

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
