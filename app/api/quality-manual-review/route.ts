import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../db";
import { dataQualityChecks, ignoredJobs, jobs, savedJobs } from "../../../db/schema";
import { bookmarkFingerprint } from "../../lib/bookmark-capture";
import { scoreStoredJob } from "../../lib/job-scoring";

export const dynamic = "force-dynamic";

function clean(value: unknown, maximum = 50_000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maximum);
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>;
  const jobId = Number(body.jobId);
  const action = clean(body.action, 40);
  if (!Number.isInteger(jobId) || !["approve", "rerun", "ignore", "delete"].includes(action)) {
    return NextResponse.json({ error: "A valid job id and action are required." }, { status: 400 });
  }

  const db = await getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  const now = new Date().toISOString();

  if (action === "approve") {
    const scoring = scoreStoredJob({
      title: job.title,
      content: job.description || job.evidence,
      region: job.region,
    });
    await db.update(jobs).set({
      status: "开放",
      score: scoring.score,
      visa: scoring.visa,
      evidence: job.evidence
        ? `${job.evidence}；自动质检无法确认，由你人工复核后通过。`
        : "自动质检无法确认，由你人工复核后通过。",
      checkedAt: now,
      lastSeenAt: now,
      missedScanCount: 0,
      expirationReason: "",
    }).where(eq(jobs.id, jobId));
    await db.update(dataQualityChecks).set({
      status: "resolved",
      issueKeys: "[]",
      lastError: "人工复核通过",
      resolvedAt: now,
      updatedAt: now,
    }).where(eq(dataQualityChecks.jobId, jobId));
    return NextResponse.json({ ok: true, action, jobId });
  }

  if (action === "rerun") {
    await db.update(dataQualityChecks).set({
      status: "queued",
      attempts: 0,
      lastError: "",
      lastAttemptAt: "",
      nextRetryAt: now,
      resolvedAt: "",
      updatedAt: now,
    }).where(eq(dataQualityChecks.jobId, jobId));
    return NextResponse.json({ ok: true, action, jobId });
  }

  if (action === "delete") {
    await db.delete(dataQualityChecks).where(eq(dataQualityChecks.jobId, jobId));
    return NextResponse.json({ ok: true, action, jobId });
  }

  const fingerprint = bookmarkFingerprint(job.company, job.title);
  const [existingIgnored] = await db.select().from(ignoredJobs)
    .where(eq(ignoredJobs.fingerprint, fingerprint)).limit(1);
  if (existingIgnored) {
    await db.update(ignoredJobs).set({
      company: job.company,
      title: job.title,
      jobUrl: job.jobUrl,
      reason: "质检复核后加入黑名单",
    }).where(eq(ignoredJobs.id, existingIgnored.id));
  } else {
    await db.insert(ignoredJobs).values({
      company: job.company,
      title: job.title,
      jobUrl: job.jobUrl,
      fingerprint,
      reason: "质检复核后加入黑名单",
      createdAt: now,
    });
  }
  await db.delete(savedJobs).where(eq(savedJobs.jobId, jobId));
  await db.delete(dataQualityChecks).where(eq(dataQualityChecks.jobId, jobId));
  await db.delete(jobs).where(eq(jobs.id, jobId));
  return NextResponse.json({ ok: true, action, jobId });
}
