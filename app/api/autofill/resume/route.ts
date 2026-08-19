import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../../db";
import { applications } from "../../../../db/schema";
import { archivePath, ARCHIVE_REPOSITORY } from "../../../lib/application-archive";
import { deriveBookmarkCaptureKey, secureBookmarkKeyEqual } from "../../../lib/bookmark-capture";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "X-Ivy-Autofill-Key, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

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

export async function GET(request: NextRequest) {
  if (!await authorize(request)) {
    return NextResponse.json({ error: "Invalid autofill key." }, { status: 401, headers: CORS_HEADERS });
  }

  const applicationRowId = Number(new URL(request.url).searchParams.get("applicationId"));
  if (!Number.isInteger(applicationRowId) || applicationRowId <= 0) {
    return NextResponse.json({ error: "A valid applicationId is required." }, { status: 400, headers: CORS_HEADERS });
  }

  const db = await getDb();
  const [application] = await db.select().from(applications).where(eq(applications.id, applicationRowId)).limit(1);
  if (!application) return NextResponse.json({ error: "Application not found." }, { status: 404, headers: CORS_HEADERS });
  if (application.status !== "准备材料") {
    return NextResponse.json({ error: "Only pending applications can provide an autofill resume." }, { status: 409, headers: CORS_HEADERS });
  }

  const archiveId = archiveIdFrom(application.applicationId);
  if (!archiveId) {
    return NextResponse.json({ error: "This application does not have a finalized archive ID yet." }, { status: 409, headers: CORS_HEADERS });
  }

  const fileName = `cv_customized_${archiveId}.pdf`;
  const { env } = await import("cloudflare:workers");
  const token = String(env.APPLICATION_ARCHIVE_GITHUB_TOKEN || env.CV_GITHUB_TOKEN || "").trim();
  const repository = String(env.APPLICATION_ARCHIVE_GITHUB_REPO || ARCHIVE_REPOSITORY).trim();
  if (!token) return NextResponse.json({ error: "Archive access is not configured." }, { status: 503, headers: CORS_HEADERS });

  const response = await fetch(
    `https://api.github.com/repos/${repository}/contents/${archivePath(archiveId)}/${fileName}?ref=main`,
    {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.raw+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Ivy-Job-Radar-Autofill",
      },
    },
  );
  if (response.status === 404) {
    return NextResponse.json({ error: "Final customized PDF is not available yet." }, { status: 404, headers: CORS_HEADERS });
  }
  if (!response.ok) {
    return NextResponse.json({ error: `Archive PDF fetch failed (${response.status}).` }, { status: 502, headers: CORS_HEADERS });
  }

  const bytes = await response.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "X-Ivy-Application-Id": archiveId,
    },
  });
}
