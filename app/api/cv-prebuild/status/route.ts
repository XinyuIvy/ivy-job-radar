import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getD1, getDb } from "../../../../db";
import { applications, jobs, savedJobs } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { reconcileCvPrebuildRun } from "../../../lib/cv-prebuild-runtime";
import { recoverTransientCvJobs } from "../../../lib/cv-prebuild-recovery";
import {
  getLatestCvPrebuildJob,
  listCvPrebuildMessages,
  type CvPrebuildJobRow,
} from "../../../lib/cv-prebuild-store";
import type { CvPrebuildArtifactBucket } from "../../../lib/cv-prebuild-artifacts";
import { cvPrebuildFailureMessage } from "../../../lib/cv-prebuild-status";

export const dynamic = "force-dynamic";

function parseJobId(value: unknown) {
  const jobId = Number(value);
  return Number.isSafeInteger(jobId) && jobId > 0 ? jobId : null;
}

export async function GET(request: NextRequest) {
  if (!(await getChatGPTUser())) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }
  const jobId = parseJobId(request.nextUrl.searchParams.get("jobId"));
  if (!jobId) {
    return NextResponse.json({ error: "A valid job id is required." }, { status: 400 });
  }

  const db = await getDb();
  const [[job], [saved]] = await Promise.all([
    db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1),
    db.select().from(savedJobs).where(eq(savedJobs.jobId, jobId)).limit(1),
  ]);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (!saved) {
    return NextResponse.json({ error: "Only saved jobs have a CV workspace." }, { status: 409 });
  }

  const database = await getD1();
  let prebuild = await getLatestCvPrebuildJob(database, jobId);
  const { env } = await import("cloudflare:workers");
  const apiKey = String(env.OPENAI_API_KEY ?? "").trim();
  const [savedJobIds, pendingApplicationRows] = await Promise.all([
    db.select({ jobId: savedJobs.jobId }).from(savedJobs),
    db.select({ id: applications.id }).from(applications).where(eq(applications.status, "准备材料")),
  ]);
  const pendingApplicationIds = new Set(pendingApplicationRows.map(({ id }) => id));
  let latestPendingPrebuilds = (await Promise.all(
    savedJobIds.map(({ jobId: savedJobId }) => getLatestCvPrebuildJob(database, savedJobId)),
  )).filter((row): row is CvPrebuildJobRow => Boolean(
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
  if (prebuild && apiKey && archiveToken) {
    const recovered = await recoverTransientCvJobs({
      database,
      rows: latestPendingPrebuilds,
      apiKey,
      archiveToken,
      archiveRepository: String(env.APPLICATION_ARCHIVE_GITHUB_REPO ?? "").trim() || undefined,
    });
    prebuild = recovered.get(jobId) ?? await getLatestCvPrebuildJob(database, jobId);
  }
  const messages = prebuild ? await listCvPrebuildMessages(database, prebuild.id) : [];

  return NextResponse.json({
    job: {
      id: job.id,
      company: job.company,
      title: job.title,
      location: job.location,
      region: job.region,
      jobUrl: job.jobUrl,
    },
    prebuild: prebuild ? {
      id: prebuild.prebuildId,
      status: prebuild.status,
      language: prebuild.language,
      templateFile: prebuild.templateFile,
      model: prebuild.model,
      serviceTier: prebuild.serviceTier,
      attempts: prebuild.attempts,
      errorCode: prebuild.lastError,
      failureMessage: cvPrebuildFailureMessage(prebuild.lastError),
      updatedAt: prebuild.updatedAt,
      completedAt: prebuild.completedAt,
      artifacts: {
        pdf: Boolean(prebuild.draftPdfKey),
        tex: Boolean(prebuild.draftTexKey),
        text: Boolean(prebuild.draftTextKey),
        review: Boolean(prebuild.reviewKey),
      },
      usage: {
        inputTokens: prebuild.inputTokens,
        cachedInputTokens: prebuild.cachedInputTokens,
        outputTokens: prebuild.outputTokens,
      },
    } : null,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      status: message.status,
      createdAt: message.createdAt,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
