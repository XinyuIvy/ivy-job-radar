import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../../db";
import { jobFactScores, savedJobs } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import type { ApplicationFactFitScore } from "../../../lib/application-fit-score";

export const dynamic = "force-dynamic";

function parseJobId(value: unknown) {
  const jobId = Number(value);
  return Number.isSafeInteger(jobId) && jobId > 0 ? jobId : null;
}

function validScore(value: unknown): value is ApplicationFactFitScore {
  if (!value || typeof value !== "object") return false;
  const score = value as Partial<ApplicationFactFitScore>;
  return Number.isFinite(Number(score.score))
    && Number(score.score) >= 0
    && Number(score.score) <= 100
    && typeof score.label === "string"
    && Number.isFinite(Number(score.evidenceCoverage))
    && Number.isFinite(Number(score.directCoverage))
    && Number.isFinite(Number(score.transferableCoverage))
    && Number.isFinite(Number(score.cvCoverage))
    && Number.isFinite(Number(score.gapRisk))
    && Array.isArray(score.topMatches)
    && Array.isArray(score.gaps);
}

async function savedJobExists(jobId: number) {
  const db = await getDb();
  const [saved] = await db.select({ jobId: savedJobs.jobId })
    .from(savedJobs)
    .where(eq(savedJobs.jobId, jobId))
    .limit(1);
  return Boolean(saved);
}

export async function GET(request: NextRequest) {
  if (!(await getChatGPTUser())) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }
  const jobId = parseJobId(request.nextUrl.searchParams.get("jobId"));
  if (!jobId) {
    return NextResponse.json({ error: "A valid jobId is required." }, { status: 400 });
  }
  if (!(await savedJobExists(jobId))) {
    return NextResponse.json({ error: "Only saved jobs have a fact score." }, { status: 409 });
  }

  const db = await getDb();
  const [stored] = await db.select().from(jobFactScores)
    .where(eq(jobFactScores.jobId, jobId))
    .limit(1);
  if (!stored) {
    return NextResponse.json({ score: null }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const score = JSON.parse(stored.scoreJson) as unknown;
    return NextResponse.json({
      score: validScore(score) ? score : null,
      updatedAt: stored.updatedAt,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ score: null }, { headers: { "Cache-Control": "no-store" } });
  }
}

export async function PUT(request: NextRequest) {
  if (!(await getChatGPTUser())) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  }
  const jobId = parseJobId(body.jobId);
  if (!jobId || !validScore(body.score)) {
    return NextResponse.json({ error: "A valid jobId and fact score are required." }, { status: 400 });
  }
  if (!(await savedJobExists(jobId))) {
    return NextResponse.json({ error: "Only saved jobs can save a fact score." }, { status: 409 });
  }

  const db = await getDb();
  const updatedAt = new Date().toISOString();
  await db.insert(jobFactScores).values({
    jobId,
    scoreJson: JSON.stringify(body.score),
    updatedAt,
  }).onConflictDoUpdate({
    target: jobFactScores.jobId,
    set: { scoreJson: JSON.stringify(body.score), updatedAt },
  });
  return NextResponse.json({ ok: true, updatedAt });
}
