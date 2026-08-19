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

export async function GET(request: NextRequest) {
  if (!await authorize(request)) return json({ error: "Invalid autofill key." }, 401);

  const applicationRowId = Number(new URL(request.url).searchParams.get("applicationId"));
  if (!Number.isInteger(applicationRowId) || applicationRowId <= 0) {
    return json({ error: "A valid applicationId is required." }, 400);
  }

  const db = await getDb();
  const [application] = await db.select().from(applications).where(eq(applications.id, applicationRowId)).limit(1);
  if (!application) return json({ error: "Application not found." }, 404);
  if (application.status !== AUTOFILL_APPLICATION_STATUS) return json({ error: "Only submitted applications can provide application-specific autofill data." }, 409);

  const archiveId = archiveIdFrom(application.applicationId);
  if (!archiveId) return json({ error: "This application does not have a finalized archive ID yet." }, 409);

  const fileName = `application_autofill_${archiveId}.json`;
  const { env } = await import("cloudflare:workers");
  const token = String(env.APPLICATION_ARCHIVE_GITHUB_TOKEN || env.CV_GITHUB_TOKEN || "").trim();
  const repository = String(env.APPLICATION_ARCHIVE_GITHUB_REPO || ARCHIVE_REPOSITORY).trim();
  if (!token) return json({ error: "Archive access is not configured." }, 503);

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
    return json({ error: "Application-specific autofill packet is not available yet. Rebuild the finalized customized CV first." }, 404);
  }
  if (!response.ok) return json({ error: `Archive autofill packet fetch failed (${response.status}).` }, 502);

  const packet = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!packet || packet.application_id !== archiveId || packet.authority !== "final_customized_cv_only") {
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
      repository,
      archivePath: archivePath(archiveId),
      fileName,
      authority: "final_customized_cv_only",
    },
    packet,
  });
}
