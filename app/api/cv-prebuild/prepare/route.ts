import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getD1, getDb } from "../../../../db";
import { jobs, savedJobs } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { ARCHIVE_REPOSITORY, canonicalSnapshotFiles, type ArchiveLanguage, type ArchiveTrack } from "../../../lib/application-archive";
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
  ensurePendingAssistantMessage,
  failCvPrebuildBundle,
  getLatestCvPrebuildJob,
  initializeCvPrebuildJob,
  setLatestCvPrebuildStatus,
  startCvPrebuildRun,
} from "../../../lib/cv-prebuild-store";
import { activeJobStatuses } from "../../../lib/job-expiration";
import { extractCoreJobDescription } from "../../../lib/job-description";
import { normalizeCvGenerationRules } from "../../../lib/cv-generation-rules";
import {
  createOpenAiConversation,
  DEFAULT_CV_MODEL,
  DEFAULT_CV_SERVICE_TIER,
  RETRY_CV_SERVICE_TIER,
  startInitialCvResponse,
} from "../../../lib/openai-cv-prebuilder";
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

export async function POST(request: NextRequest) {
  const { env } = await import("cloudflare:workers");
  const maintenanceToken = request.headers.get("x-cv-maintenance-token")?.trim() ?? "";
  const configuredMaintenanceToken = String(env.CV_MAINTENANCE_TOKEN ?? "").trim();
  const authorization = request.headers.get("authorization") ?? "";
  const syncToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const configuredSyncToken = String(env.IVY_JOB_RADAR_SYNC_TOKEN ?? "").trim();
  const maintenanceAuthorized = Boolean(
    (configuredMaintenanceToken && maintenanceToken === configuredMaintenanceToken)
    || (configuredSyncToken && syncToken === configuredSyncToken),
  );
  if (!maintenanceAuthorized && !(await getChatGPTUser())) {
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
  const rawTemplateTrack = String(body.templateTrack ?? "").trim();
  const templateTrack = rawTemplateTrack
    && ["pharma", "tech", "quant", "consulting", "clinical_neuro"].includes(rawTemplateTrack)
    ? rawTemplateTrack as ArchiveTrack
    : undefined;
  if (rawTemplateTrack && !templateTrack) {
    return NextResponse.json({ error: "A valid CV template is required." }, { status: 400 });
  }
  const rawLanguage = String(body.language ?? "").trim();
  const requestedLanguage = rawLanguage === "zh" || rawLanguage === "en"
    ? rawLanguage as ArchiveLanguage
    : undefined;
  if (rawLanguage && !requestedLanguage) {
    return NextResponse.json({ error: "A valid CV language is required." }, { status: 400 });
  }
  let generationRules: string;
  try {
    generationRules = normalizeCvGenerationRules(body.generationRules);
  } catch {
    return NextResponse.json({ error: "CV generation rules are too long." }, { status: 400 });
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
  const apiKey = String(env.OPENAI_API_KEY ?? "").trim();
  const agentConfigured = Boolean(apiKey);
  await initializeCvPrebuildJob(database, jobId, agentConfigured, now);
  const queuedSelection = await getLatestCvPrebuildJob(database, jobId);
  const queuedTrack = queuedSelection?.track
    && ["pharma", "tech", "quant", "consulting", "clinical_neuro"].includes(queuedSelection.track)
    ? queuedSelection.track as ArchiveTrack
    : undefined;
  const queuedLanguage = queuedSelection?.language === "zh" || queuedSelection?.language === "en"
    ? queuedSelection.language as ArchiveLanguage
    : undefined;
  const selectedTrack = templateTrack ?? queuedTrack;
  const selectedLanguage = requestedLanguage ?? queuedLanguage;

  const jd = extractCoreJobDescription(job.description).text;
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
    const selection = recommendCvPrebuildTemplate(jobInput, selectedTrack, selectedLanguage);
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
      templateTrack: selectedTrack,
      templateLanguage: selectedLanguage,
      generationRules,
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
    if (
      generation.outcome === "existing"
      && (generation.row?.openaiResponseId || generation.row?.status === "ready")
    ) {
      return NextResponse.json({
        ok: true,
        existing: true,
        prebuildId: generation.row?.prebuildId ?? identity.prebuildId,
        status: generation.row?.status ?? "preparing_bundle",
        language: identity.language,
        templateFile: identity.templateFile,
      });
    }

    const bundleFiles = buildCvPrebuildBundleFiles({
      job: jobInput,
      identity,
      jd,
      generationRules,
      capturedAt: now,
      sources,
    });

    const frozenRecord = await readOptionalPrivateRepositoryTextFile(
      archiveApiRoot,
      `${identity.bundlePath}/job_record.yaml`,
      "main",
      archiveToken,
    );
    const recordMatches = frozenRecord?.text.includes(`generation_key: ${JSON.stringify(generationKey)}`) ?? false;
    let existing = recordMatches;
    if (!recordMatches) {
      await commitPrivateRepositoryFiles({
        apiRoot: archiveApiRoot,
        token: archiveToken,
        files: bundleFiles,
        message: `Create PRECV bundle ${identity.prebuildId}`,
      });
      existing = false;
    }

    if (!apiKey) {
      const completed = await completeCvPrebuildBundle(
        database,
        generationKey,
        "blocked_configuration",
        new Date().toISOString(),
      );
      return NextResponse.json({
        ok: true,
        existing,
        prebuildId: identity.prebuildId,
        status: completed?.status ?? "blocked_configuration",
        language: identity.language,
        templateFile: identity.templateFile,
      }, { status: existing ? 200 : 201 });
    }

    await completeCvPrebuildBundle(database, generationKey, "queued", new Date().toISOString());
    const requestedServiceTier = (generation.row?.attempts ?? 1) > 1
      ? RETRY_CV_SERVICE_TIER
      : DEFAULT_CV_SERVICE_TIER;
    const conversationId = generation.row?.openaiConversationId
      || (await createOpenAiConversation(apiKey, identity.prebuildId)).id;
    const response = await startInitialCvResponse({
      apiKey,
      conversationId,
      prebuildId: identity.prebuildId,
      generationKey,
      files: Object.entries(bundleFiles).map(([path, text]) => ({
        filename: path.split("/").at(-1) || path,
        text,
      })),
      model: DEFAULT_CV_MODEL,
      serviceTier: requestedServiceTier,
    });
    const startedAt = new Date().toISOString();
    const started = await startCvPrebuildRun(database, generationKey, {
      conversationId,
      responseId: response.id,
      model: DEFAULT_CV_MODEL,
      serviceTier: String(response.service_tier || requestedServiceTier),
      now: startedAt,
    });
    if (started) {
      await ensurePendingAssistantMessage(database, started.id, response.id, startedAt);
    }
    return NextResponse.json({
      ok: true,
      existing,
      prebuildId: identity.prebuildId,
      status: started?.status ?? "agent_queued",
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
