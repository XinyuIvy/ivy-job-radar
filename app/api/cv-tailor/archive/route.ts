import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../../db";
import { applications, jobs } from "../../../../db/schema";
import {
  ARCHIVE_REPOSITORY,
  archivePath,
  buildApplicationRecord,
  buildChatPrompt,
  canonicalSnapshotFiles,
  normalizeInitialClassification,
  stableArchiveId,
  templateFiles,
  type ArchiveLanguage,
  type ArchiveTrack,
} from "../../../lib/application-archive";

export const dynamic = "force-dynamic";

type InitialEvidence = {
  projectId?: string;
  project?: string;
  factId?: string;
  fact?: string;
  classification?: string;
  source?: string;
  evidenceLocation?: string;
  claimBoundary?: string;
  industryGuardrail?: string;
};

type InitialMatch = {
  requirementId?: string;
  keyword?: string;
  category?: string;
  canonicalConcepts?: string[];
  evidenceClassification?: string;
  status?: string;
  jdEvidence?: string;
  jdMatchedTerms?: string[];
  confidence?: number;
  action?: string;
  reason?: string;
  supportEvidence?: InitialEvidence[];
  templateCovered?: boolean;
  templateEvidence?: string;
};

type InitialAnalysis = {
  matches?: InitialMatch[];
  projects?: unknown[];
  summary?: Record<string, unknown>;
  sourceDiagnostics?: Record<string, unknown>;
};

type GithubRef = { object: { sha: string } };
type GithubCommit = { tree: { sha: string } };
type GithubBlob = { sha: string };
type GithubTree = { sha: string };
type GithubCreatedCommit = { sha: string };

const cvApiRoot = "https://api.github.com/repos/XinyuIvy/CV";

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Ivy-Job-Radar-Application-Archive",
  };
}

async function githubJson<T>(url: string, token: string, init?: RequestInit, allowedStatuses: number[] = []) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { ...githubHeaders(token), ...(init?.headers ?? {}) },
  });
  if (!response.ok && !allowedStatuses.includes(response.status)) {
    const detail = (await response.text()).slice(0, 600);
    const error = new Error(`GitHub ${response.status}: ${detail}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  if (response.status === 204 || allowedStatuses.includes(response.status) && !response.ok) {
    return { status: response.status } as T;
  }
  return response.json() as Promise<T>;
}

function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function readPrivateFile(path: string, ref: string, token: string) {
  const payload = await githubJson<{ content?: string; encoding?: string }>(
    `${cvApiRoot}/contents/${path}?ref=${encodeURIComponent(ref)}`,
    token,
  );
  if (payload.encoding !== "base64" || !payload.content) throw new Error(`GitHub did not return ${path}.`);
  return decodeBase64Utf8(payload.content);
}

async function existingArchiveTextFile(apiRoot: string, path: string, filename: string, token: string) {
  const response = await fetch(`${apiRoot}/contents/${path}/${filename}?ref=main`, {
    cache: "no-store",
    headers: githubHeaders(token),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const error = new Error(`GitHub ${response.status}: ${(await response.text()).slice(0, 600)}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  const payload = await response.json() as { content?: string; encoding?: string };
  return payload.encoding === "base64" && payload.content ? decodeBase64Utf8(payload.content) : null;
}

async function archiveFileExists(apiRoot: string, path: string, filename: string, token: string) {
  const response = await fetch(`${apiRoot}/contents/${path}/${filename}?ref=main`, {
    cache: "no-store",
    headers: githubHeaders(token),
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    const error = new Error(`GitHub ${response.status}: ${(await response.text()).slice(0, 600)}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return true;
}

function yamlScalar(source: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const raw = source.match(new RegExp(`^\\s*${escaped}:\\s*(.*?)\\s*$`, "m"))?.[1]?.trim() ?? "";
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : String(parsed ?? "");
  } catch {
    return raw.replace(/^['"]|['"]$/g, "");
  }
}

function fullJdFromSnapshot(snapshot: string) {
  const firstSectionBreak = snapshot.indexOf("\n\n");
  return (firstSectionBreak >= 0 ? snapshot.slice(firstSectionBreak + 2) : snapshot).trim();
}

async function commitFilesAtomically(input: {
  apiRoot: string;
  token: string;
  files: Record<string, string>;
  message: string;
}) {
  const main = await githubJson<GithubRef>(`${input.apiRoot}/git/ref/heads/main`, input.token);
  const parent = await githubJson<GithubCommit>(`${input.apiRoot}/git/commits/${main.object.sha}`, input.token);
  const blobs = await Promise.all(Object.entries(input.files).map(async ([path, content]) => {
    const blob = await githubJson<GithubBlob>(`${input.apiRoot}/git/blobs`, input.token, {
      method: "POST",
      body: JSON.stringify({ content, encoding: "utf-8" }),
    });
    return { path, mode: "100644", type: "blob", sha: blob.sha };
  }));
  const tree = await githubJson<GithubTree>(`${input.apiRoot}/git/trees`, input.token, {
    method: "POST",
    body: JSON.stringify({ base_tree: parent.tree.sha, tree: blobs }),
  });
  const commit = await githubJson<GithubCreatedCommit>(`${input.apiRoot}/git/commits`, input.token, {
    method: "POST",
    body: JSON.stringify({ message: input.message, tree: tree.sha, parents: [main.object.sha] }),
  });
  await githubJson(`${input.apiRoot}/git/refs/heads/main`, input.token, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return commit.sha;
}

function buildRequirementPacket(analysis: InitialAnalysis, archiveId: string, capturedAt: string) {
  const requirements = (analysis.matches ?? []).map((match) => ({
    requirement_id: match.requirementId ?? "",
    keyword: match.keyword ?? "",
    category: match.category ?? "",
    jd_source_text: match.jdEvidence ?? "",
    literal_terms: match.jdMatchedTerms ?? [],
    canonical_concepts: match.canonicalConcepts ?? [],
  }));
  return {
    schema_version: "jd-requirements-v1",
    application_id: archiveId,
    captured_at: capturedAt,
    requirement_count: requirements.length,
    requirements,
  };
}

function buildMatchPacket(analysis: InitialAnalysis, archiveId: string, capturedAt: string) {
  return {
    schema_version: "job-radar-preliminary-match-v1",
    application_id: archiveId,
    captured_at: capturedAt,
    authority: "preliminary_only",
    final_classification_requires_chat_independent_review: true,
    human_confirmation_scope: "only_disagreements_that_can_change_cv_content",
    human_confirmation_batch_limit: 5,
    requirements: (analysis.matches ?? []).map((match) => ({
      requirement_id: match.requirementId ?? "",
      keyword: match.keyword ?? "",
      category: match.category ?? "",
      job_radar_initial_classification: normalizeInitialClassification(match.evidenceClassification ?? ""),
      job_radar_native_classification: match.evidenceClassification ?? "No Evidence",
      current_cv_status: match.status ?? "",
      current_cv_covered: Boolean(match.templateCovered),
      current_cv_evidence: match.templateEvidence ?? "",
      confidence: match.confidence ?? 0,
      reason: match.reason ?? "",
      suggested_action: match.action ?? "",
      support_evidence: (match.supportEvidence ?? []).map((evidence) => ({
        project_id: evidence.projectId ?? "",
        project: evidence.project ?? "",
        fact_id: evidence.factId ?? "",
        verified_fact: evidence.fact ?? "",
        native_classification: evidence.classification ?? "",
        source: evidence.source ?? "",
        evidence_location: evidence.evidenceLocation ?? "",
        claim_boundary: evidence.claimBoundary ?? "",
        industry_guardrail: evidence.industryGuardrail ?? "",
      })),
    })),
    recommended_projects: analysis.projects ?? [],
    summary: analysis.summary ?? {},
    diagnostics: analysis.sourceDiagnostics ?? {},
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    applicationId?: number;
    track?: ArchiveTrack;
    language?: ArchiveLanguage;
    jdOverride?: string;
    analysis?: InitialAnalysis;
  };
  const applicationRowId = Number(body.applicationId);
  const language: ArchiveLanguage = body.language === "zh" ? "zh" : "en";
  const track: ArchiveTrack = body.track && body.track in templateFiles[language] ? body.track : "tech";
  const templateFile = templateFiles[language][track];
  const analysis = body.analysis ?? {};
  const jdOverride = String(body.jdOverride || "").trim();

  if (!Number.isInteger(applicationRowId) || applicationRowId <= 0) {
    return NextResponse.json({ error: "A valid applicationId is required.", code: "APPLICATION_ID_REQUIRED" }, { status: 400 });
  }
  if (!templateFile) {
    return NextResponse.json({ error: "该方向没有所选语言的 LaTeX 母版。", code: "CV_TEMPLATE_LANGUAGE_UNAVAILABLE" }, { status: 400 });
  }
  if (!Array.isArray(analysis.matches) || !analysis.matches.length) {
    return NextResponse.json({ error: "初步 JD 分析缺失，不能创建不完整的申请档案。", code: "MATCH_PACKET_REQUIRED" }, { status: 400 });
  }

  const { env } = await import("cloudflare:workers");
  const cvToken = String(env.CV_GITHUB_TOKEN || "").trim();
  const archiveToken = String(env.APPLICATION_ARCHIVE_GITHUB_TOKEN || env.CV_GITHUB_TOKEN || "").trim();
  const archiveRepository = String(env.APPLICATION_ARCHIVE_GITHUB_REPO || ARCHIVE_REPOSITORY).trim();
  const archiveApiRoot = `https://api.github.com/repos/${archiveRepository}`;
  if (!cvToken) return NextResponse.json({ error: "CV_GITHUB_TOKEN 未配置。", code: "CV_TOKEN_REQUIRED" }, { status: 503 });
  if (!archiveToken) return NextResponse.json({ error: "申请归档仓库凭据未配置。", code: "ARCHIVE_TOKEN_REQUIRED" }, { status: 503 });

  try {
    const db = await getDb();
    const [application] = await db.select().from(applications).where(eq(applications.id, applicationRowId)).limit(1);
    if (!application) return NextResponse.json({ error: "Application not found.", code: "APPLICATION_NOT_FOUND" }, { status: 404 });

    const allJobs = await db.select().from(jobs);
    const job = allJobs.find((row) => application.jobUrl && row.jobUrl === application.jobUrl)
      ?? allJobs.find((row) => row.company === application.company && row.title === application.title)
      ?? null;
    const jd = jdOverride || job?.description?.trim() || "";
    if (!jd) return NextResponse.json({ error: "该申请没有完整 JD，不能创建申请档案。", code: "JD_REQUIRED" }, { status: 400 });

    const archiveId = stableArchiveId(application.company, application.id, application.applicationId);
    const path = archivePath(archiveId);
    const templatePath = `master/template-cv/${templateFile}`;
    const existingPrompt = await existingArchiveTextFile(archiveApiRoot, path, "chat_prompt.txt", archiveToken);

    if (existingPrompt) {
      const existingJdSnapshot = await existingArchiveTextFile(archiveApiRoot, path, "jd_snapshot.md", archiveToken);
      const existingApplicationRecord = await existingArchiveTextFile(archiveApiRoot, path, "application_record.yaml", archiveToken);
      if (!existingJdSnapshot) throw new Error(`Existing application archive ${archiveId} is missing jd_snapshot.md.`);
      if (!existingApplicationRecord) throw new Error(`Existing application archive ${archiveId} is missing application_record.yaml.`);

      const existingLanguage = yamlScalar(existingApplicationRecord, "language");
      const existingTemplatePath = yamlScalar(existingApplicationRecord, "cv_template_path");
      const templateMatches = existingLanguage === language && existingTemplatePath === templatePath;

      if (templateMatches) {
        const frozenJd = fullJdFromSnapshot(existingJdSnapshot);
        const currentPrompt = buildChatPrompt(archiveId, path, frozenJd, language, templateFile);
        return NextResponse.json({
          ok: true,
          existing: true,
          refrozen: false,
          applicationId: archiveId,
          archivePath: path,
          language,
          templateFile,
          prompt: currentPrompt,
          promptContractUpdated: existingPrompt !== currentPrompt,
          repositoryUrl: `https://github.com/${archiveRepository}/tree/main/${path}`,
        });
      }

      const customizedTex = `cv_customized_${archiveId}.tex`;
      const customizedPdf = `cv_customized_${archiveId}.pdf`;
      const submittedPdf = `cv_submitted_${archiveId}.pdf`;
      const finalized = (await archiveFileExists(archiveApiRoot, path, customizedTex, archiveToken))
        || (await archiveFileExists(archiveApiRoot, path, customizedPdf, archiveToken))
        || (await archiveFileExists(archiveApiRoot, path, submittedPdf, archiveToken));

      if (finalized) {
        return NextResponse.json({
          error: `该申请已经存在最终 CV，当前冻结母版为 ${existingTemplatePath || "未知"}（${existingLanguage || "未知语言"}），但你本次选择的是 ${templatePath}（${language}）。为避免静默覆盖已经定稿或投递的版本，系统不会自动切换母版。请为该申请创建明确的 CV revision 后再切换语言/母版。`,
          code: "CV_TEMPLATE_CHANGE_AFTER_FINALIZATION",
          existingLanguage,
          existingTemplatePath,
          selectedLanguage: language,
          selectedTemplatePath: templatePath,
        }, { status: 409 });
      }

      const cvMain = await githubJson<GithubRef>(`${cvApiRoot}/git/ref/heads/main`, cvToken);
      const cvCommit = cvMain.object.sha;
      const sourcePairs = [...canonicalSnapshotFiles, [templatePath, "cv_base.tex"] as const];
      const sourceContents = await Promise.all(sourcePairs.map(async ([sourcePath, archiveName]) => ({
        archiveName,
        content: await readPrivateFile(sourcePath, cvCommit, cvToken),
      })));
      const capturedAt = new Date().toISOString();
      const prompt = buildChatPrompt(archiveId, path, jd, language, templateFile);
      const applicationRecord = buildApplicationRecord({
        archiveId,
        applicationRowId: application.id,
        jobRowId: job?.id ?? null,
        company: application.company,
        title: application.title,
        region: application.region,
        location: application.location,
        track,
        language,
        jobUrl: application.jobUrl,
        source: application.source,
        capturedAt,
        cvCommit,
        templatePath,
        archivePath: path,
      });
      const requirements = buildRequirementPacket(analysis, archiveId, capturedAt);
      const matchPacket = buildMatchPacket(analysis, archiveId, capturedAt);
      const files: Record<string, string> = {
        [`${path}/application_record.yaml`]: applicationRecord,
        [`${path}/jd_snapshot.md`]: `# ${application.company} — ${application.title}\n\n${jd}\n`,
        [`${path}/jd_requirements.json`]: `${JSON.stringify(requirements, null, 2)}\n`,
        [`${path}/match_packet.json`]: `${JSON.stringify(matchPacket, null, 2)}\n`,
        [`${path}/chat_prompt.txt`]: prompt,
      };
      for (const item of sourceContents) files[`${path}/${item.archiveName}`] = item.content.endsWith("\n") ? item.content : `${item.content}\n`;

      const commitSha = await commitFilesAtomically({
        apiRoot: archiveApiRoot,
        token: archiveToken,
        files,
        message: `Re-freeze application bundle ${archiveId} with ${templateFile}`,
      });
      await db.update(applications)
        .set({ applicationId: archiveId, resumeVersion: `${templateFile}@${cvCommit.slice(0, 12)}`, updatedAt: capturedAt })
        .where(eq(applications.id, application.id));
      if (job) await db.update(jobs).set({ applicationId: archiveId }).where(eq(jobs.id, job.id));

      return NextResponse.json({
        ok: true,
        existing: true,
        refrozen: true,
        applicationId: archiveId,
        archivePath: path,
        language,
        templateFile,
        previousLanguage: existingLanguage,
        previousTemplatePath: existingTemplatePath,
        prompt,
        commitSha,
        repositoryUrl: `https://github.com/${archiveRepository}/tree/main/${path}`,
      });
    }

    const cvMain = await githubJson<GithubRef>(`${cvApiRoot}/git/ref/heads/main`, cvToken);
    const cvCommit = cvMain.object.sha;
    const sourcePairs = [...canonicalSnapshotFiles, [templatePath, "cv_base.tex"] as const];
    const sourceContents = await Promise.all(sourcePairs.map(async ([sourcePath, archiveName]) => ({
      archiveName,
      content: await readPrivateFile(sourcePath, cvCommit, cvToken),
    })));
    const capturedAt = new Date().toISOString();
    const prompt = buildChatPrompt(archiveId, path, jd, language, templateFile);
    const applicationRecord = buildApplicationRecord({
      archiveId,
      applicationRowId: application.id,
      jobRowId: job?.id ?? null,
      company: application.company,
      title: application.title,
      region: application.region,
      location: application.location,
      track,
      language,
      jobUrl: application.jobUrl,
      source: application.source,
      capturedAt,
      cvCommit,
      templatePath,
      archivePath: path,
    });
    const requirements = buildRequirementPacket(analysis, archiveId, capturedAt);
    const matchPacket = buildMatchPacket(analysis, archiveId, capturedAt);
    const files: Record<string, string> = {
      [`${path}/application_record.yaml`]: applicationRecord,
      [`${path}/jd_snapshot.md`]: `# ${application.company} — ${application.title}\n\n${jd}\n`,
      [`${path}/jd_requirements.json`]: `${JSON.stringify(requirements, null, 2)}\n`,
      [`${path}/match_packet.json`]: `${JSON.stringify(matchPacket, null, 2)}\n`,
      [`${path}/chat_prompt.txt`]: prompt,
    };
    for (const item of sourceContents) files[`${path}/${item.archiveName}`] = item.content.endsWith("\n") ? item.content : `${item.content}\n`;

    const commitSha = await commitFilesAtomically({
      apiRoot: archiveApiRoot,
      token: archiveToken,
      files,
      message: `Create application bundle ${archiveId}`,
    });
    await db.update(applications)
      .set({ applicationId: archiveId, resumeVersion: `${templateFile}@${cvCommit.slice(0, 12)}`, updatedAt: capturedAt })
      .where(eq(applications.id, application.id));
    if (job) await db.update(jobs).set({ applicationId: archiveId }).where(eq(jobs.id, job.id));

    return NextResponse.json({
      ok: true,
      existing: false,
      refrozen: false,
      applicationId: archiveId,
      archivePath: path,
      language,
      templateFile,
      prompt,
      commitSha,
      repositoryUrl: `https://github.com/${archiveRepository}/tree/main/${path}`,
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 404) {
      return NextResponse.json({
        error: `私有申请归档仓库 ${archiveRepository} 已配置，但当前站点凭据无法访问。请检查该凭据是否包含这个私有仓库。`,
        code: "ARCHIVE_REPOSITORY_REQUIRED",
      }, { status: 503 });
    }
    if (status === 403) {
      return NextResponse.json({
        error: `当前凭据没有写入私有申请归档仓库 ${archiveRepository} 的权限。`,
        code: "ARCHIVE_WRITE_PERMISSION_REQUIRED",
      }, { status: 503 });
    }
    console.error("Application archive creation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Application archive creation failed." }, { status: 500 });
  }
}
