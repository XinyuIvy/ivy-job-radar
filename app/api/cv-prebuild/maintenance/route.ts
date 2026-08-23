import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getD1, getDb } from "../../../../db";
import { applications, jobs, savedJobs } from "../../../../db/schema";
import type { CvPrebuildArtifactBucket } from "../../../lib/cv-prebuild-artifacts";
import { recoverTransientCvJobs } from "../../../lib/cv-prebuild-recovery";
import { reconcileCvPrebuildRun } from "../../../lib/cv-prebuild-runtime";
import {
  getLatestCvPrebuildJob,
  type CvPrebuildJobRow,
} from "../../../lib/cv-prebuild-store";

export const dynamic = "force-dynamic";

function hasMaintenanceAccess(request: NextRequest, configuredToken: string) {
  const providedToken = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  return Boolean(configuredToken && providedToken && providedToken === configuredToken);
}

export async function GET(request: NextRequest) {
  const { env } = await import("cloudflare:workers");
  const maintenanceToken = String(env.CV_MAINTENANCE_TOKEN ?? "").trim();
  if (!hasMaintenanceAccess(request, maintenanceToken)) {
    return NextResponse.json({ error: "Unauthorized maintenance request." }, { status: 401 });
  }

  const db = await getDb();
  const database = await getD1();
  let [savedJobRows, pendingApplicationRows] = await Promise.all([
    db.select({ jobId: savedJobs.jobId }).from(savedJobs),
    db.select({ id: applications.id, jobUrl: applications.jobUrl }).from(applications).where(eq(applications.status, "准备材料")),
  ]);
  const savedJobIds = new Set(savedJobRows.map(({ jobId }) => jobId));
  const repairedAt = new Date().toISOString();
  for (const application of pendingApplicationRows) {
    const [matchedJob] = await db.select({ id: jobs.id }).from(jobs)
      .where(eq(jobs.jobUrl, application.jobUrl)).limit(1);
    if (!matchedJob) continue;
    if (!savedJobIds.has(matchedJob.id)) {
      await db.insert(savedJobs).values({ jobId: matchedJob.id, createdAt: repairedAt }).onConflictDoNothing();
      await db.update(applications).set({
        status: "收藏",
        nextAction: "进入待申请后自动生成 CV",
        updatedAt: repairedAt,
      }).where(eq(applications.id, application.id));
      savedJobIds.add(matchedJob.id);
      continue;
    }
    const latest = await getLatestCvPrebuildJob(database, matchedJob.id);
    if (latest && !latest.applicationRowId) {
      await database.prepare(`
        UPDATE cv_prebuild_jobs
        SET application_row_id = ?, updated_at = ?
        WHERE id = ?
      `).bind(application.id, repairedAt, latest.id).run();
    }
  }
  [savedJobRows, pendingApplicationRows] = await Promise.all([
    db.select({ jobId: savedJobs.jobId }).from(savedJobs),
    db.select({ id: applications.id, jobUrl: applications.jobUrl }).from(applications).where(eq(applications.status, "准备材料")),
  ]);
  const pendingApplicationIds = new Set(pendingApplicationRows.map(({ id }) => id));
  let pendingRows = (await Promise.all(
    savedJobRows.map(({ jobId }) => getLatestCvPrebuildJob(database, jobId)),
  )).filter((row): row is CvPrebuildJobRow => Boolean(
    row?.applicationRowId && pendingApplicationIds.has(row.applicationRowId),
  ));

  const apiKey = String(env.OPENAI_API_KEY ?? "").trim();
  if (apiKey && env.BUCKET) {
    pendingRows = await Promise.all(pendingRows.map(async (row) => {
      const needsLegacyFailureDiagnosis = row.status === "failed_retryable"
        && row.lastError === "OPENAI_FAILED";
      if (
        !row.openaiResponseId
        || (!["agent_queued", "agent_running"].includes(row.status) && !needsLegacyFailureDiagnosis)
      ) return row;
      return reconcileCvPrebuildRun({
        database,
        bucket: env.BUCKET as CvPrebuildArtifactBucket,
        row,
        apiKey,
        now: new Date().toISOString(),
      });
    }));
  }

  const archiveToken = String(env.APPLICATION_ARCHIVE_GITHUB_TOKEN ?? env.CV_GITHUB_TOKEN ?? "").trim();
  if (apiKey && archiveToken) {
    await recoverTransientCvJobs({
      database,
      rows: pendingRows,
      apiKey,
      archiveToken,
      archiveRepository: String(env.APPLICATION_ARCHIVE_GITHUB_REPO ?? "").trim() || undefined,
    });
  }

  const latestRows = (await Promise.all(
    pendingRows.map((row) => getLatestCvPrebuildJob(database, row.jobId)),
  )).filter((row): row is CvPrebuildJobRow => Boolean(row));

  return NextResponse.json({
    tasks: latestRows.map((row) => ({
      jobId: row.jobId,
      status: row.status,
      attempts: row.attempts,
      model: row.model,
      lastError: row.lastError,
      updatedAt: row.updatedAt,
      artifactsReady: Boolean(row.draftPdfKey && row.draftTexKey),
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
