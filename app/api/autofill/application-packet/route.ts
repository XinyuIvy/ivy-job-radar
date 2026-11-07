import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../../db";
import { applications } from "../../../../db/schema";
import { archivePath, ARCHIVE_REPOSITORY } from "../../../lib/application-archive";
import {
  CV_TEMPLATE_REPOSITORY,
  selectedTemplateVersion,
} from "../../../lib/autofill-resume";
import { deriveBookmarkCaptureKey, secureBookmarkKeyEqual } from "../../../lib/bookmark-capture";
import { CV_TEMPLATE_DIRECTORY, isCvTemplateFilename } from "../../../lib/cv-template-catalog";
import {
  buildTemplateAutofillPacket,
  hasTemplateAutofillProjects,
} from "../../../lib/template-autofill-packet";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "X-Ivy-Autofill-Key, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

const AUTOFILL_APPLICATION_STATUS = "已申请";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

async function authorize(request: NextRequest) {
  const { env } = await import("cloudflare:workers");
  const expected = await deriveBookmarkCaptureKey(String(env.IVY_JOB_RADAR_SYNC_TOKEN ?? "").trim());
  const provided = String(request.headers.get("x-ivy-autofill-key") ?? "").trim();
  return Boolean(expected && secureBookmarkKeyEqual(expected, provided));
}

function archiveIdFrom(value: string) {
  const normalized = value.trim().toUpperCase();
  return /^APP-\d{4}-[A-Z0-9]{3,12}-\d{3,}$/.test(normalized) ? normalized : "";
}

const PACKET_AUTHORITIES = new Set(["final_customized_cv_only", "frozen_submitted_template"]);

type GithubRef = { object: { sha: string } };
type GithubCommit = { tree: { sha: string } };
type GithubBlob = { sha: string };
type GithubTree = { sha: string };
type GithubCreatedCommit = { sha: string };

function githubHeaders(token: string, accept = "application/vnd.github.raw+json") {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Ivy-Job-Radar-Autofill",
  };
}

async function githubJson<T>(url: string, token: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { ...githubHeaders(token, "application/vnd.github+json"), ...(init?.headers || {}) },
  });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}): ${(await response.text()).slice(0, 400)}`);
  return response.json() as Promise<T>;
}

async function fetchRawGithubFile(repository: string, path: string, ref: string, token: string) {
  if (!token) return null;
  const response = await fetch(
    `https://api.github.com/repos/${repository}/contents/${path}?ref=${encodeURIComponent(ref)}`,
    { cache: "no-store", headers: githubHeaders(token) },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub file fetch failed (${response.status}).`);
  return response.text();
}

async function currentCvCommit(token: string) {
  const main = await githubJson<GithubRef>(
    `https://api.github.com/repos/${CV_TEMPLATE_REPOSITORY}/git/ref/heads/main`,
    token,
  );
  return main.object.sha;
}

async function commitArchiveTextFile(input: {
  repository: string;
  path: string;
  content: string;
  message: string;
  token: string;
}) {
  const apiRoot = `https://api.github.com/repos/${input.repository}`;
  const main = await githubJson<GithubRef>(`${apiRoot}/git/ref/heads/main`, input.token);
  const parent = await githubJson<GithubCommit>(`${apiRoot}/git/commits/${main.object.sha}`, input.token);
  const blob = await githubJson<GithubBlob>(`${apiRoot}/git/blobs`, input.token, {
    method: "POST",
    body: JSON.stringify({ content: input.content, encoding: "utf-8" }),
  });
  const tree = await githubJson<GithubTree>(`${apiRoot}/git/trees`, input.token, {
    method: "POST",
    body: JSON.stringify({
      base_tree: parent.tree.sha,
      tree: [{ path: input.path, mode: "100644", type: "blob", sha: blob.sha }],
    }),
  });
  const commit = await githubJson<GithubCreatedCommit>(`${apiRoot}/git/commits`, input.token, {
    method: "POST",
    body: JSON.stringify({ message: input.message, tree: tree.sha, parents: [main.object.sha] }),
  });
  await githubJson(`${apiRoot}/git/refs/heads/main`, input.token, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return commit.sha;
}

export async function GET(request: NextRequest) {
  if (!await authorize(request)) return json({ error: "Invalid autofill key." }, 401);

  const url = new URL(request.url);
  const applicationRowId = Number(url.searchParams.get("applicationId"));
  const templateFile = String(url.searchParams.get("templateFile") || "").trim();
  const { env } = await import("cloudflare:workers");
  const cvToken = String(env.CV_GITHUB_TOKEN || "").trim();
  const token = String(env.APPLICATION_ARCHIVE_GITHUB_TOKEN || cvToken).trim();
  const repository = String(env.APPLICATION_ARCHIVE_GITHUB_REPO || ARCHIVE_REPOSITORY).trim();

  if (templateFile) {
    if (!isCvTemplateFilename(templateFile)) return json({ error: "A valid CV template filename is required." }, 400);
    if (!cvToken) return json({ error: "CV template access is not configured." }, 503);
    try {
      const cvCommit = await currentCvCommit(cvToken);
      const sourcePath = `${CV_TEMPLATE_DIRECTORY}/${templateFile}`;
      const latex = await fetchRawGithubFile(CV_TEMPLATE_REPOSITORY, sourcePath, cvCommit, cvToken);
      if (!latex) return json({ error: "The selected live CV template is unavailable." }, 404);
      const packet = buildTemplateAutofillPacket({
        archiveId: `TEMPLATE:${templateFile}`,
        templateFile,
        cvCommit,
        latex,
        authority: "live_cv_template",
        provenance: "live_template",
      });
      return json({
        ok: true,
        template: { fileName: templateFile, cvCommit },
        source: {
          repository: CV_TEMPLATE_REPOSITORY,
          archivePath: "",
          fileName: templateFile,
          authority: "live_cv_template",
        },
        packet,
      });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "The live CV template could not be loaded." }, 502);
    }
  }

  if (!Number.isInteger(applicationRowId) || applicationRowId <= 0) {
    return json({ error: "A valid applicationId is required." }, 400);
  }

  const db = await getDb();
  const [application] = await db.select().from(applications).where(eq(applications.id, applicationRowId)).limit(1);
  if (!application) return json({ error: "Application not found." }, 404);
  if (application.status !== AUTOFILL_APPLICATION_STATUS) return json({ error: "Only submitted applications can provide application-specific autofill data." }, 409);

  const archiveId = archiveIdFrom(application.archiveId || application.applicationId);
  if (!archiveId) return json({ error: "This application does not have a finalized archive ID yet." }, 409);

  const fileName = `application_autofill_${archiveId}.json`;
  if (!token) return json({ error: "Archive access is not configured." }, 503);

  try {
    const refreshFileName = `application_autofill_refresh_${archiveId}.json`;
    const customizedFileName = `cv_customized_${archiveId}.tex`;
    const archivedTemplateFileName = "cv_base.tex";
    const [refreshPacketText, frozenPacketText, customizedLatex, archivedTemplateLatex] = await Promise.all([
      fetchRawGithubFile(repository, `${archivePath(archiveId)}/${refreshFileName}`, "main", token),
      fetchRawGithubFile(repository, `${archivePath(archiveId)}/${fileName}`, "main", token),
      fetchRawGithubFile(repository, `${archivePath(archiveId)}/${customizedFileName}`, "main", token),
      fetchRawGithubFile(repository, `${archivePath(archiveId)}/${archivedTemplateFileName}`, "main", token),
    ]);
    const refreshedPacket = refreshPacketText ? JSON.parse(refreshPacketText) as Record<string, unknown> : null;
    const frozenPacket = frozenPacketText ? JSON.parse(frozenPacketText) as Record<string, unknown> : null;
    let packet = hasTemplateAutofillProjects(refreshedPacket) ? refreshedPacket : null;
    let sourceRepository = repository;
    let sourcePath = `${archivePath(archiveId)}/${refreshFileName}`;
    let sourceAuthority = String(packet?.authority || "");

    if (!packet && customizedLatex) {
      const customizedPacket = buildTemplateAutofillPacket({
        archiveId,
        templateFile: selectedTemplateVersion(application.resumeVersion).fileName || customizedFileName,
        cvCommit: "archive-folder-snapshot",
        latex: customizedLatex,
        authority: "final_customized_cv_only",
        provenance: "final_customized_cv",
      });
      if (hasTemplateAutofillProjects(customizedPacket)) {
        packet = customizedPacket;
        sourcePath = `${archivePath(archiveId)}/${customizedFileName}`;
        sourceAuthority = customizedPacket.authority;
      }
    }

    if (!packet && hasTemplateAutofillProjects(frozenPacket)) {
      packet = frozenPacket;
      sourcePath = `${archivePath(archiveId)}/${fileName}`;
      sourceAuthority = String(frozenPacket?.authority || "");
    }

    if (!hasTemplateAutofillProjects(packet)) {
      const selected = selectedTemplateVersion(application.resumeVersion);
      if (!selected.fileName) {
        return json({ error: "The finalized CV does not contain readable project entries for autofill." }, 404);
      } else {
        const archivedTemplatePath = `${archivePath(archiveId)}/${archivedTemplateFileName}`;
        let latex = archivedTemplateLatex;
        let sourceCommit = selected.commitRef || "archive-folder-snapshot";
        if (latex) {
          sourcePath = archivedTemplatePath;
        } else {
          sourceCommit = selected.commitRef || "main";
          sourceRepository = CV_TEMPLATE_REPOSITORY;
          sourcePath = `master/template-cv/${selected.fileName}`;
          latex = await fetchRawGithubFile(sourceRepository, sourcePath, sourceCommit, cvToken);
        }
        if (!latex) return json({ error: "The selected CV template could not be read for structured autofill." }, 404);
        if (latex) {
          const rebuiltPacket = buildTemplateAutofillPacket({
            archiveId,
            templateFile: selected.fileName,
            cvCommit: sourceCommit,
            latex,
            authority: String(packet?.authority || "") === "frozen_submitted_template"
              ? "frozen_submitted_template"
              : "final_customized_cv_only",
            provenance: "frozen_submitted_template",
          });
          if (hasTemplateAutofillProjects(rebuiltPacket)) {
            packet = rebuiltPacket;
            sourceAuthority = String(rebuiltPacket.authority || "");
          }
        }
      }
    }

    if (!hasTemplateAutofillProjects(packet)) {
      return json({ error: "The finalized CV does not contain readable project entries for autofill." }, 404);
    }

    if (!packet || packet.application_id !== archiveId || !PACKET_AUTHORITIES.has(String(packet.authority || ""))) {
      return json({ error: "Autofill packet failed APP-ID or authority validation." }, 502);
    }

    return json({
      ok: true,
      application: {
        id: application.id,
        applicationId: application.applicationId,
        archiveId,
        company: application.company,
        title: application.title,
      },
      source: {
        repository: sourceRepository,
        archivePath: archivePath(archiveId),
        fileName: sourcePath.split("/").pop() || fileName,
        authority: sourceAuthority,
      },
      packet,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Application autofill data could not be loaded." }, 502);
  }
}

export async function POST(request: NextRequest) {
  if (!await authorize(request)) return json({ error: "Invalid autofill key." }, 401);

  const body = await request.json().catch(() => ({})) as { applicationId?: number };
  const applicationRowId = Number(body.applicationId || 0);
  if (!Number.isInteger(applicationRowId) || applicationRowId <= 0) {
    return json({ error: "A valid applicationId is required." }, 400);
  }

  const db = await getDb();
  const [application] = await db.select().from(applications).where(eq(applications.id, applicationRowId)).limit(1);
  if (!application) return json({ error: "Application not found." }, 404);
  if (application.status !== AUTOFILL_APPLICATION_STATUS) {
    return json({ error: "Only submitted applications can refresh their autofill project items." }, 409);
  }

  const archiveId = archiveIdFrom(application.archiveId || application.applicationId);
  const selected = selectedTemplateVersion(application.resumeVersion);
  if (!archiveId || !selected.fileName) {
    return json({ error: "This application does not have both an archive ID and a recorded CV template." }, 409);
  }

  const { env } = await import("cloudflare:workers");
  const cvToken = String(env.CV_GITHUB_TOKEN || "").trim();
  const archiveToken = String(env.APPLICATION_ARCHIVE_GITHUB_TOKEN || cvToken).trim();
  const repository = String(env.APPLICATION_ARCHIVE_GITHUB_REPO || ARCHIVE_REPOSITORY).trim();
  if (!cvToken || !archiveToken) return json({ error: "CV or archive access is not configured." }, 503);

  try {
    const cvCommit = await currentCvCommit(cvToken);
    const sourcePath = `${CV_TEMPLATE_DIRECTORY}/${selected.fileName}`;
    const latex = await fetchRawGithubFile(CV_TEMPLATE_REPOSITORY, sourcePath, cvCommit, cvToken);
    if (!latex) return json({ error: "The recorded CV template no longer exists in the current catalog." }, 404);
    const refreshedAt = new Date().toISOString();
    const packet = buildTemplateAutofillPacket({
      archiveId,
      templateFile: selected.fileName,
      cvCommit,
      latex,
      provenance: "refreshed_template_autofill",
      refreshedAt,
    });
    const fileName = `application_autofill_refresh_${archiveId}.json`;
    const commitSha = await commitArchiveTextFile({
      repository,
      path: `${archivePath(archiveId)}/${fileName}`,
      content: `${JSON.stringify(packet, null, 2)}\n`,
      message: `Refresh template autofill items for ${archiveId}`,
      token: archiveToken,
    });
    return json({
      ok: true,
      applicationId: archiveId,
      templateFile: selected.fileName,
      cvCommit,
      refreshedAt,
      experienceCount: packet.experience.length,
      projectCount: packet.projects.length,
      fileName,
      commitSha,
      preservedSubmittedPdf: true,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Autofill project items could not be refreshed." }, 502);
  }
}
