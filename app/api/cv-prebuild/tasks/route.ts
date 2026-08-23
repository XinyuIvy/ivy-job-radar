import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getD1, getDb } from "../../../../db";
import { applications, cvPrebuildJobs, jobs, savedJobs } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import type { CvPrebuildArtifactBucket } from "../../../lib/cv-prebuild-artifacts";
import { reconcileCvPrebuildRun } from "../../../lib/cv-prebuild-runtime";
import { recoverTransientCvJobs } from "../../../lib/cv-prebuild-recovery";
import { getLatestCvPrebuildJob } from "../../../lib/cv-prebuild-store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getChatGPTUser())) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }

  const db = await getDb();
  const [savedRows, pendingApplicationRows] = await Promise.all([
    db.select().from(savedJobs).orderBy(desc(savedJobs.createdAt)),
    db.select({ id: applications.id }).from(applications).where(eq(applications.status, "准备材料")),
  ]);
  const pendingApplicationIds = new Set(pendingApplicationRows.map(({ id }) => id));
  const { env } = await import("cloudflare:workers");
  const apiKey = String(env.OPENAI_API_KEY ?? "").trim();
  const jobRows = await db.select().from(jobs);

  const database = await getD1();
  const latestByJobId = new Map<number, Awaited<ReturnType<typeof getLatestCvPrebuildJob>>>();
  for (const saved of savedRows) {
    if (!latestByJobId.has(saved.jobId)) {
      latestByJobId.set(saved.jobId, await getLatestCvPrebuildJob(database, saved.jobId));
    }
  }
  let latestPendingPrebuilds = [...latestByJobId.values()].filter((row): row is NonNullable<typeof row> => Boolean(
    row?.applicationRowId && pendingApplicationIds.has(row.applicationRowId),
  ));
  if (apiKey && env.BUCKET) {
    latestPendingPrebuilds = await Promise.all(latestPendingPrebuilds.map(async (row) => {
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
      rows: latestPendingPrebuilds,
      apiKey,
      archiveToken,
      archiveRepository: String(env.APPLICATION_ARCHIVE_GITHUB_REPO ?? "").trim() || undefined,
    });
  }
  const prebuildRows = await db.select({
    jobId: cvPrebuildJobs.jobId,
    status: cvPrebuildJobs.status,
    lastError: cvPrebuildJobs.lastError,
    attempts: cvPrebuildJobs.attempts,
    updatedAt: cvPrebuildJobs.updatedAt,
  }).from(cvPrebuildJobs).orderBy(
    sql`CASE WHEN ${cvPrebuildJobs.status} = 'stale' THEN 1 ELSE 0 END`,
    desc(cvPrebuildJobs.updatedAt),
    desc(cvPrebuildJobs.id),
  );

  const jobsById = new Map(jobRows.map((job) => [job.id, job]));
  const prebuildByJobId = new Map<number, typeof prebuildRows[number]>();
  for (const row of prebuildRows) {
    if (!prebuildByJobId.has(row.jobId)) prebuildByJobId.set(row.jobId, row);
  }

  return NextResponse.json(savedRows.flatMap((saved) => {
    const job = jobsById.get(saved.jobId);
    const prebuild = prebuildByJobId.get(saved.jobId);
    if (!job || !prebuild) return [];
    return [{
      ...job,
      skills: JSON.parse(job.skills || "[]"),
      saved: true,
      cvPrebuildStatus: prebuild.status,
      cvPrebuildError: prebuild.lastError,
      cvPrebuildAttempts: prebuild.attempts,
      cvPrebuildUpdatedAt: prebuild.updatedAt,
    }];
  }), { headers: { "Cache-Control": "no-store" } });
}
