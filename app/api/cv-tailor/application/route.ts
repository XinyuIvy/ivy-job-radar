import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../../db";
import { applications, jobs } from "../../../../db/schema";

export const dynamic = "force-dynamic";

function normalize(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function inferTrack(track: string) {
  const lower = track.toLocaleLowerCase();
  if (lower.includes("pharma") || lower.includes("biostat")) return "pharma";
  if (lower.includes("quant")) return "quant";
  if (lower.includes("consult")) return "consulting";
  return "tech";
}

export async function GET(request: NextRequest) {
  const id = Number(new URL(request.url).searchParams.get("applicationId"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "A valid applicationId is required." }, { status: 400 });
  }

  const db = await getDb();
  const [application] = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
  if (!application) return NextResponse.json({ error: "Application not found." }, { status: 404 });

  const allJobs = await db.select().from(jobs);
  const companyKey = normalize(application.company);
  const titleKey = normalize(application.title);
  const job = allJobs.find((row) => application.jobUrl && row.jobUrl === application.jobUrl)
    ?? allJobs.find((row) => normalize(row.company) === companyKey && normalize(row.title) === titleKey)
    ?? null;

  return NextResponse.json({
    applicationId: application.id,
    company: application.company,
    title: application.title,
    track: inferTrack(application.track),
    jobUrl: application.jobUrl,
    jd: job?.description || "",
    resumeVersion: application.resumeVersion,
    applicationStatus: application.status,
  });
}
