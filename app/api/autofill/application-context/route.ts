import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../../db";
import { applications } from "../../../../db/schema";
import { ARCHIVE_REPOSITORY } from "../../../lib/application-archive";
import {
  autofillArchiveId,
  buildAutofillResumeCandidates,
  selectedTemplateVersion,
  fetchFirstAvailableResume,
} from "../../../lib/autofill-resume";
import { deriveBookmarkCaptureKey, secureBookmarkKeyEqual } from "../../../lib/bookmark-capture";
import {
  createCvTemplateOption,
  CV_TEMPLATE_DIRECTORY,
  sortCvTemplateOptions,
} from "../../../lib/cv-template-catalog";
import { canonicalizeJobIdentityUrl, extractStableJobId } from "../../../lib/job-identity";
import { privateGithubJson } from "../../../lib/private-github-repository";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "X-Ivy-Autofill-Key, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

const AUTOFILL_APPLICATION_STATUS = "已申请";

type GithubContentEntry = {
  name?: string;
  type?: string;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function hostOf(raw: string) {
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

async function authorize(request: NextRequest) {
  const { env } = await import("cloudflare:workers");
  const expected = await deriveBookmarkCaptureKey(String(env.IVY_JOB_RADAR_SYNC_TOKEN ?? "").trim());
  const provided = String(request.headers.get("x-ivy-autofill-key") ?? "").trim();
  return Boolean(expected && secureBookmarkKeyEqual(expected, provided));
}

async function resolveResume(archiveId: string, resumeVersion: string) {
  const { env } = await import("cloudflare:workers");
  const cvToken = String(env.CV_GITHUB_TOKEN || "").trim();
  const archiveToken = String(env.APPLICATION_ARCHIVE_GITHUB_TOKEN || cvToken).trim();
  const repository = String(env.APPLICATION_ARCHIVE_GITHUB_REPO || ARCHIVE_REPOSITORY).trim();
  const candidates = buildAutofillResumeCandidates({ archiveId, resumeVersion, archiveRepository: repository });
  const result = await fetchFirstAvailableResume({
    candidates,
    archiveToken,
    cvToken,
    accept: "application/vnd.github+json",
  });
  if (result.candidate) return { available: true, ...result.candidate };
  const hasTemplate = candidates.some((candidate) => candidate.source === "template");
  return {
    available: false,
    fileName: "",
    source: "none",
    successReason: hasTemplate ? "template-pdf-not-found" : archiveId ? "final-pdf-not-found" : "cv-not-selected",
  };
}

async function listTemplates() {
  const { env } = await import("cloudflare:workers");
  const token = String(env.CV_GITHUB_TOKEN || "").trim();
  if (!token) return [];
  try {
    const entries = await privateGithubJson<GithubContentEntry[]>(
      `https://api.github.com/repos/XinyuIvy/CV/contents/${CV_TEMPLATE_DIRECTORY}?ref=main`,
      token,
    );
    return sortCvTemplateOptions(entries
      .filter((entry) => entry.type === "file")
      .map((entry) => createCvTemplateOption(String(entry.name || "")))
      .filter((entry) => entry !== null));
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  if (!await authorize(request)) return json({ error: "Invalid autofill key." }, 401);

  const url = new URL(request.url);
  const jobUrl = String(url.searchParams.get("jobUrl") || "").trim();
  const requestedApplicationRowId = Number(url.searchParams.get("applicationId") || 0);
  const requestedTemplateFile = String(url.searchParams.get("templateFile") || "").trim();
  const db = await getDb();
  const [applicationRows, templates] = await Promise.all([
    db.select().from(applications),
    listTemplates(),
  ]);
  const rows = applicationRows.filter((row) => row.status === AUTOFILL_APPLICATION_STATUS);

  let selected = Number.isInteger(requestedApplicationRowId) && requestedApplicationRowId > 0
    ? rows.find((row) => row.id === requestedApplicationRowId) ?? null
    : null;
  let matchedBy = selected ? "manual-selection" : "";
  let ambiguousAutomaticMatch = false;

  if (!selected && jobUrl) {
    const targetCanonical = canonicalizeJobIdentityUrl(jobUrl);
    const targetStableId = extractStableJobId(jobUrl);
    const scored = rows.map((row) => {
      const exact = row.jobUrl === jobUrl;
      const rowStableId = extractStableJobId(row.jobUrl, row.applicationId);
      const sameStableId = Boolean(targetStableId && rowStableId && targetStableId === rowStableId);
      const sameCanonical = Boolean(targetCanonical && canonicalizeJobIdentityUrl(row.jobUrl) === targetCanonical);
      const sameHost = Boolean(hostOf(jobUrl) && hostOf(row.jobUrl) === hostOf(jobUrl));
      const score = exact ? 100 : sameStableId ? 95 : sameCanonical ? 80 : sameHost ? 20 : 0;
      return { row, score, reason: exact ? "exact-url" : sameStableId ? "stable-job-id" : sameCanonical ? "canonical-url" : sameHost ? "same-host" : "" };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || (b.row.updatedAt || "").localeCompare(a.row.updatedAt || ""));

    const top = scored[0];
    const tied = top ? scored.filter((item) => item.score === top.score) : [];
    if (top && top.score >= 80 && tied.length === 1) {
      selected = top.row;
      matchedBy = top.reason;
    } else if (top && top.score >= 80 && tied.length > 1) {
      ambiguousAutomaticMatch = true;
    }
  }

  const currentHost = hostOf(jobUrl);
  const candidates = rows
    .slice()
    .sort((a, b) => {
      const aSameHost = Boolean(currentHost && hostOf(a.jobUrl) === currentHost);
      const bSameHost = Boolean(currentHost && hostOf(b.jobUrl) === currentHost);
      if (aSameHost !== bSameHost) return Number(bSameHost) - Number(aSameHost);
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    })
    .map((row) => ({ id: row.id, applicationId: row.applicationId, archiveId: row.archiveId, company: row.company, title: row.title, location: row.location, jobUrl: row.jobUrl }));

  if (requestedTemplateFile) {
    const template = templates.find((item) => item.filename === requestedTemplateFile);
    if (!template) return json({ error: "The selected live CV template is unavailable." }, 404);
    const resume = await resolveResume("", template.filename);
    return json({
      ok: true,
      matched: false,
      selected: true,
      selectionType: "template",
      matchedBy: "manual-template-selection",
      template,
      resume: {
        available: resume.available,
        fileName: resume.fileName,
        source: "live-template",
        reason: resume.successReason,
      },
      candidates,
      templates,
    });
  }

  if (!selected) {
    return json({
      ok: true,
      matched: false,
      needsSelection: candidates.length > 0,
      selectionReason: ambiguousAutomaticMatch ? "ambiguous-auto-match" : "no-auto-match",
      candidateScope: "submitted-applications-and-live-templates",
      candidates,
      templates,
    });
  }

  const archiveId = autofillArchiveId(selected.archiveId || selected.applicationId);
  const resume = await resolveResume(archiveId, selected.resumeVersion);

  return json({
    ok: true,
    matched: true,
    selected: true,
    selectionType: "application",
    matchedBy,
    application: {
      id: selected.id,
      applicationId: selected.applicationId,
      archiveId,
      company: selected.company,
      title: selected.title,
      location: selected.location,
      status: selected.status,
      jobUrl: selected.jobUrl,
    },
    templateFile: selectedTemplateVersion(selected.resumeVersion).fileName,
    resume: {
      available: resume.available,
      fileName: resume.fileName,
      source: resume.source,
      reason: resume.successReason,
    },
    candidates,
    templates,
  });
}
