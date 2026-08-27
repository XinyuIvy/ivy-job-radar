import { ARCHIVE_REPOSITORY, canonicalSnapshotFiles } from "./application-archive";
import {
  claimCvPrebuildFallback,
  ensurePendingAssistantMessage,
  failCvPrebuildBundle,
  getLatestCvPrebuildJob,
  releaseStaleCvPrebuildClaim,
  startCvPrebuildRun,
  type CvPrebuildDatabase,
  type CvPrebuildJobRow,
} from "./cv-prebuild-store";
import {
  createOpenAiConversation,
  DEFAULT_CV_MODEL,
  FALLBACK_CV_MODEL,
  FALLBACK_CV_MAX_OUTPUT_TOKENS,
  FALLBACK_CV_SERVICE_TIER,
  MAX_CV_FALLBACK_INPUT_CHARS,
  OpenAiCvError,
  RETRY_CV_SERVICE_TIER,
  startInitialCvResponse,
} from "./openai-cv-prebuilder";
import { readPrivateRepositoryTextFile } from "./private-github-repository";

const MAX_AUTOMATIC_CV_ATTEMPTS = 7;
const STALE_FALLBACK_CLAIM_MS = 90_000;
const activeCvStatuses = new Set(["preparing_bundle", "agent_queued", "agent_running"]);

const archivedBundleFilenames = [
  ...canonicalSnapshotFiles.map(([, archiveName]) => archiveName),
  "cv_base.tex",
  "job_record.yaml",
  "jd_snapshot.md",
  "prebuild_prompt.txt",
];

export function isTransientCvFailure(row: CvPrebuildJobRow) {
  if (!["queued", "failed_retryable"].includes(row.status)) return false;
  if (row.attempts >= MAX_AUTOMATIC_CV_ATTEMPTS) return false;
  if (row.status === "queued") return true;
  return /server_is_overloaded|rate_limit_exceeded|server_error|max_output_tokens|OPENAI_(?:FAILED|INCOMPLETE|CANCELLED)|CV_ARTIFACT_PERSIST_FAILED|PREBUILD_BUNDLE_FAILED|CV_FALLBACK_START_FAILED|OPENAI_RESPONSE_TIMEOUT/i
    .test(row.lastError);
}

function isStaleFallbackClaim(row: CvPrebuildJobRow, nowMs: number) {
  return row.status === "preparing_bundle"
    && nowMs - Date.parse(row.updatedAt) >= STALE_FALLBACK_CLAIM_MS;
}

function bundlePath(prebuildId: string) {
  const year = prebuildId.match(/^PRECV-(\d{4})-/)?.[1];
  if (!year) throw new Error("The PRECV year is unavailable.");
  return `prebuilds/${year}/${prebuildId}`;
}

async function recoverOne(input: {
  database: CvPrebuildDatabase;
  row: CvPrebuildJobRow;
  apiKey: string;
  archiveToken: string;
  archiveRepository: string;
}) {
  if (!isTransientCvFailure(input.row)) return input.row;
  const now = new Date().toISOString();
  const claimed = await claimCvPrebuildFallback(
    input.database,
    input.row,
    MAX_AUTOMATIC_CV_ATTEMPTS,
    now,
  );
  if (!claimed) return getLatestCvPrebuildJob(input.database, input.row.jobId);

  try {
    const apiRoot = `https://api.github.com/repos/${input.archiveRepository}`;
    const root = bundlePath(claimed.prebuildId);
    const files = await Promise.all(archivedBundleFilenames.map(async (filename) => ({
      filename,
      text: (await readPrivateRepositoryTextFile(
        apiRoot,
        `${root}/${filename}`,
        "main",
        input.archiveToken,
      )).text,
    })));
    const conversationId = (await createOpenAiConversation(input.apiKey, claimed.prebuildId)).id;
    const useHighCapacityRecovery = claimed.attempts >= 6;
    const model = useHighCapacityRecovery ? DEFAULT_CV_MODEL : FALLBACK_CV_MODEL;
    const serviceTier = useHighCapacityRecovery ? RETRY_CV_SERVICE_TIER : FALLBACK_CV_SERVICE_TIER;
    const response = await startInitialCvResponse({
      apiKey: input.apiKey,
      conversationId,
      prebuildId: claimed.prebuildId,
      generationKey: claimed.generationKey,
      files,
      model,
      serviceTier,
      maxInputChars: MAX_CV_FALLBACK_INPUT_CHARS,
      maxOutputTokens: FALLBACK_CV_MAX_OUTPUT_TOKENS,
      reasoningEffort: "medium",
    });
    const startedAt = new Date().toISOString();
    const started = await startCvPrebuildRun(input.database, claimed.generationKey, {
      conversationId,
      responseId: response.id,
      model,
      serviceTier: String(response.service_tier || serviceTier),
      now: startedAt,
    });
    if (started) {
      await ensurePendingAssistantMessage(input.database, started.id, response.id, startedAt);
    }
    return started;
  } catch (error) {
    const failureCode = error instanceof OpenAiCvError
      ? `CV_FALLBACK_START_FAILED: ${error.code}`
      : "CV_FALLBACK_START_FAILED";
    return failCvPrebuildBundle(
      input.database,
      claimed.generationKey,
      failureCode,
      new Date().toISOString(),
    );
  }
}

export async function recoverTransientCvJobs(input: {
  database: CvPrebuildDatabase;
  rows: CvPrebuildJobRow[];
  apiKey: string;
  archiveToken: string;
  archiveRepository?: string;
}) {
  const archiveRepository = input.archiveRepository || ARCHIVE_REPOSITORY;
  const nowMs = Date.now();
  const rows = (await Promise.all(input.rows.map((row) => isStaleFallbackClaim(row, nowMs)
    ? releaseStaleCvPrebuildClaim(input.database, row, new Date(nowMs).toISOString())
    : row))).filter((row): row is CvPrebuildJobRow => Boolean(row));
  if (rows.some((row) => activeCvStatuses.has(row.status))) return new Map<number, CvPrebuildJobRow>();
  const eligible = rows
    .filter(isTransientCvFailure)
    .sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt))
    .slice(0, 1);
  const recovered = await Promise.all(eligible.map((row) => recoverOne({
    database: input.database,
    row,
    apiKey: input.apiKey,
    archiveToken: input.archiveToken,
    archiveRepository,
  })));
  return new Map(recovered.filter(Boolean).map((row) => [row!.jobId, row!]));
}
