import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getD1, getDb } from "../../../../db";
import { jobs, savedJobs } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { ARCHIVE_REPOSITORY, canonicalSnapshotFiles } from "../../../lib/application-archive";
import {
  buildCvPrebuildBundleFiles,
  createCvPrebuildIdentity,
  recommendCvPrebuildTemplate,
  type CvPrebuildJobInput,
  type CvPrebuildSourceFile,
} from "../../../lib/cv-prebuild-bundle";
import {
  beginCvPrebuildGeneration,
  completeCvPrebuildBundle,
  failCvPrebuildBundle,
  initializeCvPrebuildJob,
  setLatestCvPrebuildStatus,
} from "../../../lib/cv-prebuild-store";
import { activeJobStatuses } from "../../../lib/job-expiration";
import {
  commitPrivateRepositoryFiles,
  getPrivateRepositoryMainCommit,
  readOptionalPrivateRepositoryTextFile,
  readPrivateRepositoryTextFile,
} from "../../../lib/private-github-repository";

export const dynamic = "force-dynamic";

const cvApiRoot = "https://api.github.com/repos/XinyuIvy/CV";

function parseJobId(value: unknown) {
  const jobId = Number(value);
  return Number.isSafeInteger(jobId) && jobId > 0 ? jobId : null;
}

function hasAgentConfiguration(env: Record<string, unknown>) {
  return Boolean(
    String(env.CV_PREBUILDER_AGENT_TRIGGER_ID ?? "").trim()
    && String(env.CV_PREBUILDER_AGENT_ACCESS_TOKEN ?? "").trim(),
  );
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
  const jobId = parseJobId(body.jobId);
  if (!jobId) {
    return NextResponse.json({ error: "A valid job id is required." }, { status: 400 });
  }

  const db = await getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  const [saved] = await db.select().from(savedJobs).where(eq(savedJobs.jobId, jobId)).limit(1);
  if (!saved) {
    return NextResponse.json({ error: "Only a saved job can create a PRECV bundle.", code: "JOB_NOT_SAVED" }, { status: 409 });
  }

  const database = await getD1();
  const now = new Date().toISOString();
  const { env } = await import("cloudflare:workers");
  const agentConfigured = hasAgentConfiguration(env as Record<string, unknown>);
  await initializeCvPrebuildJob(database, jobId, agentConfigured, now);

  const jd = job.description.trim();
  if (!jd) {
    await setLatestCvPrebuildStatus(database, jobId, "blocked_missing_jd", now);
    return NextResponse.json({ error: "The saved job does not have a complete JD.", code: "JD_REQUIRED" }, { status: 409 });
  }
  if (!activeJobStatuses.has(job.status)) {
    await setLatestCvPrebuildStatus(database, jobId, "stale", now);
    return NextResponse.json({ error: "The saved job is not currently open.", code: "JOB_NOT_OPEN" }, { status: 409 });
  }

  const cvToken = String(env.CV_GITHUB_TOKEN ?? "").trim();
  const archiveToken = String(env.APPLICATION_ARCHIVE_GITHUB_TOKEN ?? env.CV_GITHUB_TOKEN ?? "").trim();
  const archiveRepository = String(env.APPLICATION_ARCHIVE_GITHUB_REPO ?? ARCHIVE_REPOSITORY).trim();
  if (!cvToken || !archiveToken) {
    await setLatestCvPrebuildStatus(database, jobId, "blocked_configuration", now);
    return NextResponse.json({ error: "Private CV bundle storage is not configured.", code: "PREBUILD_CONFIGURATION_REQUIRED" }, { status: 503 });
  }

  const archiveApiRoot = `https://api.github.com/repos/${archiveRepository}`;
  let generationKey = "";
  try {
    const cvMain = await getPrivateRepositoryMainCommit(cvApiRoot, cvToken);
    const cvCommit = cvMain.commitSha;
    const jobInput: CvPrebuildJobInput = {
      id: job.id,
      company: job.company,
      title: job.title,
      region: job.region,
      location: job.location,
      track: job.track,
      jobUrl: job.jobUrl,
      canonicalUrl: job.canonicalUrl,
      applicationId: job.applicationId,
      source: job.source,
    };
    const selection = recommendCvPrebuildTemplate(jobInput);
    const sourcePairs = [...canonicalSnapshotFiles, [selection.templatePath, "cv_base.tex"] as const];
    const frozenSources = await Promise.all(sourcePairs.map(async ([sourcePath, archiveName]) => ({
      archiveName,
      file: await readPrivateRepositoryTextFile(cvApiRoot, sourcePath, cvCommit, cvToken),
    })));
    const sources = Object.fromEntries(
      frozenSources.map((item) => [item.archiveName, item.file]),
    ) as Record<string, CvPrebuildSourceFile>;
    const factMasterSha = sources["fact_master_snapshot.md"]?.sha;
    if (!factMasterSha) throw new Error("The frozen fact master SHA is unavailable.");

    const identity = await createCvPrebuildIdentity({
      job: jobInput,
      jd,
      cvCommit,
      factMasterSha,
    });
    generationKey = identity.generationKey;
    const generation = await beginCvPrebuildGeneration(database, {
      jobId,
      prebuildId: identity.prebuildId,
      generationKey,
      language: identity.language,
      track: identity.track,
      templateFile: identity.templateFile,
      jdSha256: identity.jdSha256,
      factMasterSha: identity.factMasterSha,
      promptVersion: identity.promptVersion,
      now,
    });
    if (generation.outcome === "existing" && generation.row?.status !== "preparing_bundle") {
      return NextResponse.json({
        ok: true,
        existing: true,
        prebuildId: generation.row?.prebuildId ?? identity.prebuildId,
        generationKey,
        status: generation.row?.status ?? "preparing_bundle",
        language: identity.language,
        templateFile: identity.templateFile,
      });
    }

    const frozenRecord = await readOptionalPrivateRepositoryTextFile(
      archiveApiRoot,
      `${identity.bundlePath}/job_record.yaml`,
      "main",
      archiveToken,
    );
    const recordMatches = frozenRecord?.text.includes(`generation_key: ${JSON.stringify(generationKey)}`) ?? false;
    let existing = recordMatches;
    if (!recordMatches) {
      const files = buildCvPrebuildBundleFiles({
        job: jobInput,
        identity,
        jd,
        capturedAt: now,
        sources,
      });
      await commitPrivateRepositoryFiles({
        apiRoot: archiveApiRoot,
        token: archiveToken,
        files,
        message: `Create PRECV bundle ${identity.prebuildId}`,
      });
      existing = false;
    }

    const finalStatus = agentConfigured ? "queued" as const : "blocked_configuration" as const;
    const completed = await completeCvPrebuildBundle(database, generationKey, finalStatus, new Date().toISOString());
    return NextResponse.json({
      ok: true,
      existing,
      prebuildId: identity.prebuildId,
      generationKey,
      status: completed?.status ?? finalStatus,
      language: identity.language,
      templateFile: identity.templateFile,
    }, { status: existing ? 200 : 201 });
  } catch (error) {
    const errorStatus = (error as Error & { status?: number }).status;
    const failedAt = new Date().toISOString();
    if (generationKey) {
      await failCvPrebuildBundle(database, generationKey, "PREBUILD_BUNDLE_FAILED", failedAt);
    } else {
      await setLatestCvPrebuildStatus(database, jobId, "failed_retryable", failedAt);
    }
    if (errorStatus === 403 || errorStatus === 404) {
      return NextResponse.json({
        error: "The configured private repositories are unavailable to the Site.",
        code: "PREBUILD_REPOSITORY_ACCESS_REQUIRED",
      }, { status: 503 });
    }
    return NextResponse.json({ error: "PRECV bundle creation failed.", code: "PREBUILD_BUNDLE_FAILED" }, { status: 500 });
  }
}
