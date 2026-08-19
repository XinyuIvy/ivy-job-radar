import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../../db";
import { applications } from "../../../../db/schema";
import { archivePath, ARCHIVE_REPOSITORY } from "../../../lib/application-archive";
import { deriveBookmarkCaptureKey, secureBookmarkKeyEqual } from "../../../lib/bookmark-capture";
import { canonicalizeJobIdentityUrl, extractStableJobId } from "../../../lib/job-identity";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "X-Ivy-Autofill-Key, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
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

function stableArchiveId(value: string) {
  return /^APP-\d{4}-[A-Z0-9]{3,12}-\d{3,}$/i.test(value.trim()) ? value.trim().toUpperCase() : "";
}

async function authorize(request: NextRequest) {
  const { env } = await import("cloudflare:workers");
  const expected = await deriveBookmarkCaptureKey(String(env.IVY_JOB_RADAR_SYNC_TOKEN ?? "").trim());
  const provided = String(request.headers.get("x-ivy-autofill-key") ?? "").trim();
  return Boolean(expected && secureBookmarkKeyEqual(expected, provided));
}

async function resumeExists(archiveId: string) {
  const { env } = await import("cloudflare:workers");
  const token = String(env.APPLICATION_ARCHIVE_GITHUB_TOKEN || env.CV_GITHUB_TOKEN || "").trim();
  const repository = String(env.APPLICATION_ARCHIVE_GITHUB_REPO || ARCHIVE_REPOSITORY).trim();
  if (!token || !archiveId) return false;
  const fileName = `cv_customized_${archiveId}.pdf`;
  const response = await fetch(
    `https://api.github.com/repos/${repository}/contents/${archivePath(archiveId)}/${fileName}?ref=main`,
    {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Ivy-Job-Radar-Autofill",
      },
    },
  );
  return response.ok;
}

export async function GET(request: NextRequest) {
  if (!await authorize(request)) return json({ error: "Invalid autofill key." }, 401);

  const url = new URL(request.url);
  const jobUrl = String(url.searchParams.get("jobUrl") || "").trim();
  const requestedApplicationRowId = Number(url.searchParams.get("applicationId") || 0);
  const db = await getDb();
  const rows = (await db.select().from(applications)).filter((row) => row.status === "准备材料");

  let selected = Number.isInteger(requestedApplicationRowId) && requestedApplicationRowId > 0
    ? rows.find((row) => row.id === requestedApplicationRowId) ?? null
    : null;
  let matchedBy = selected ? "manual-selection" : "";

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
    }
  }

  const sameHostCandidates = jobUrl
    ? rows.filter((row) => hostOf(row.jobUrl) && hostOf(row.jobUrl) === hostOf(jobUrl))
    : rows;
  const candidates = sameHostCandidates
    .slice()
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .slice(0, 12)
    .map((row) => ({ id: row.id, applicationId: row.applicationId, company: row.company, title: row.title, location: row.location, jobUrl: row.jobUrl }));

  if (!selected) {
    return json({ ok: true, matched: false, needsSelection: candidates.length > 0, candidates });
  }

  const archiveId = stableArchiveId(selected.applicationId);
  const fileName = archiveId ? `cv_customized_${archiveId}.pdf` : "";
  const available = archiveId ? await resumeExists(archiveId) : false;

  return json({
    ok: true,
    matched: true,
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
    resume: {
      available,
      fileName,
      reason: available ? "final-customized-cv" : archiveId ? "final-pdf-not-found" : "application-archive-not-created",
    },
    candidates,
  });
}
