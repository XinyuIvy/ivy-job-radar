import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../../db";
import { applications } from "../../../../db/schema";
import { ARCHIVE_REPOSITORY } from "../../../lib/application-archive";
import {
  autofillArchiveId,
  buildAutofillResumeCandidates,
  fetchFirstAvailableResume,
} from "../../../lib/autofill-resume";
import { deriveBookmarkCaptureKey, secureBookmarkKeyEqual } from "../../../lib/bookmark-capture";
import { isCvTemplateFilename } from "../../../lib/cv-template-catalog";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "X-Ivy-Autofill-Key, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

const AUTOFILL_APPLICATION_STATUS = "已申请";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

async function authorize(request: NextRequest) {
  const { env } = await import("cloudflare:workers");
  const expected = await deriveBookmarkCaptureKey(String(env.IVY_JOB_RADAR_SYNC_TOKEN ?? "").trim());
  const provided = String(request.headers.get("x-ivy-autofill-key") ?? "").trim();
  return Boolean(expected && secureBookmarkKeyEqual(expected, provided));
}

export async function GET(request: NextRequest) {
  if (!await authorize(request)) {
    return NextResponse.json({ error: "Invalid autofill key." }, { status: 401, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const applicationRowId = Number(url.searchParams.get("applicationId"));
  const templateFile = String(url.searchParams.get("templateFile") || "").trim();
  const { env } = await import("cloudflare:workers");
  const cvToken = String(env.CV_GITHUB_TOKEN || "").trim();
  const archiveToken = String(env.APPLICATION_ARCHIVE_GITHUB_TOKEN || cvToken).trim();
  const repository = String(env.APPLICATION_ARCHIVE_GITHUB_REPO || ARCHIVE_REPOSITORY).trim();

  if (templateFile) {
    if (!isCvTemplateFilename(templateFile)) {
      return NextResponse.json({ error: "A valid CV template filename is required." }, { status: 400, headers: CORS_HEADERS });
    }
    const candidates = buildAutofillResumeCandidates({ archiveId: "", resumeVersion: templateFile, archiveRepository: repository });
    const result = await fetchFirstAvailableResume({
      candidates,
      archiveToken,
      cvToken,
      accept: "application/vnd.github.raw+json",
    });
    if (!result.response || !result.candidate) {
      return NextResponse.json({ error: "The current template PDF is unavailable." }, { status: result.lastStatus === 404 ? 404 : 502, headers: CORS_HEADERS });
    }
    return new NextResponse(await result.response.arrayBuffer(), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.candidate.fileName}"`,
        "X-Ivy-Resume-Source": "live-template",
      },
    });
  }

  if (!Number.isInteger(applicationRowId) || applicationRowId <= 0) {
    return NextResponse.json({ error: "A valid applicationId is required." }, { status: 400, headers: CORS_HEADERS });
  }

  const db = await getDb();
  const [application] = await db.select().from(applications).where(eq(applications.id, applicationRowId)).limit(1);
  if (!application) return NextResponse.json({ error: "Application not found." }, { status: 404, headers: CORS_HEADERS });
  if (application.status !== AUTOFILL_APPLICATION_STATUS) {
    return NextResponse.json({ error: "Only submitted applications can provide an autofill resume." }, { status: 409, headers: CORS_HEADERS });
  }

  const archiveId = autofillArchiveId(application.archiveId || application.applicationId);
  const candidates = buildAutofillResumeCandidates({ archiveId, resumeVersion: application.resumeVersion, archiveRepository: repository });
  if (!candidates.length) return NextResponse.json({ error: "This application has neither a finalized customized CV nor a selected template CV." }, { status: 409, headers: CORS_HEADERS });
  const result = await fetchFirstAvailableResume({
    candidates,
    archiveToken,
    cvToken,
    accept: "application/vnd.github.raw+json",
  });
  if (!result.configuredCandidateCount) return NextResponse.json({ error: "CV repository access is not configured." }, { status: 503, headers: CORS_HEADERS });
  if (!result.response || !result.candidate) {
    return NextResponse.json({ error: "Neither the finalized customized PDF nor the selected template PDF is available." }, { status: result.lastStatus === 404 ? 404 : 502, headers: CORS_HEADERS });
  }

  const bytes = await result.response.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.candidate.fileName}"`,
      "X-Ivy-Application-Id": archiveId || application.applicationId,
      "X-Ivy-Resume-Source": result.candidate.source,
    },
  });
}
