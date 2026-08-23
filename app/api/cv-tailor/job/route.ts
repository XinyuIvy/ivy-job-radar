import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../../db";
import { jobs } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { extractCoreJobDescription } from "../../../lib/job-description";

export const dynamic = "force-dynamic";

function inferTrack(track: string) {
  const lower = track.toLocaleLowerCase();
  if (lower.includes("pharma") || lower.includes("biostat")) return "pharma";
  if (lower.includes("quant")) return "quant";
  if (lower.includes("consult")) return "consulting";
  if (
    lower.includes("neuro")
    || lower.includes("medical device")
    || lower.includes("脑科学")
    || lower.includes("医疗器械")
  ) return "clinical_neuro";
  return "tech";
}

function parseJobId(value: string | null) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(request: NextRequest) {
  if (!(await getChatGPTUser())) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }

  const jobId = parseJobId(request.nextUrl.searchParams.get("jobId"));
  if (!jobId) {
    return NextResponse.json({ error: "A valid jobId is required." }, { status: 400 });
  }

  const db = await getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  return NextResponse.json({
    jobId: job.id,
    company: job.company,
    title: job.title,
    track: inferTrack(job.track),
    language: /\u4e2d\u56fd|china/i.test(job.region) ? "zh" : "en",
    region: job.region,
    jobUrl: job.jobUrl,
    jd: extractCoreJobDescription(job.description).text,
  }, { headers: { "Cache-Control": "no-store" } });
}
