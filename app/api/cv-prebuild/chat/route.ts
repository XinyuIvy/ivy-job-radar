import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getD1, getDb } from "../../../../db";
import { jobs, savedJobs } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import {
  readCvPrebuildArtifactText,
  type CvPrebuildArtifactBucket,
} from "../../../lib/cv-prebuild-artifacts";
import {
  appendCvPrebuildMessage,
  ensurePendingAssistantMessage,
  getLatestCvPrebuildJob,
  startCvPrebuildRun,
} from "../../../lib/cv-prebuild-store";
import {
  DEFAULT_CV_MODEL,
  DEFAULT_CV_SERVICE_TIER,
  startCvRevisionResponse,
} from "../../../lib/openai-cv-prebuilder";

export const dynamic = "force-dynamic";

function parseJobId(value: unknown) {
  const jobId = Number(value);
  return Number.isSafeInteger(jobId) && jobId > 0 ? jobId : null;
}

export async function POST(request: NextRequest) {
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
  const message = String(body.message ?? "").trim();
  if (!jobId || !message || message.length > 6_000) {
    return NextResponse.json({ error: "A job id and a message up to 6000 characters are required." }, { status: 400 });
  }

  const db = await getDb();
  const [[job], [saved]] = await Promise.all([
    db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1),
    db.select().from(savedJobs).where(eq(savedJobs.jobId, jobId)).limit(1),
  ]);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (!saved) {
    return NextResponse.json({ error: "Only saved jobs have a CV workspace." }, { status: 409 });
  }

  const database = await getD1();
  const prebuild = await getLatestCvPrebuildJob(database, jobId);
  if (!prebuild?.generationKey || !prebuild.openaiConversationId) {
    return NextResponse.json({ error: "Generate the first CV draft before sending a revision." }, { status: 409 });
  }
  if (prebuild.status !== "ready") {
    return NextResponse.json({ error: "Wait for the current CV generation to finish." }, { status: 409 });
  }

  const { env } = await import("cloudflare:workers");
  const apiKey = String(env.OPENAI_API_KEY ?? "").trim();
  const bucket = env.BUCKET as CvPrebuildArtifactBucket | undefined;
  if (!apiKey || !bucket) {
    return NextResponse.json({ error: "CV Chat is not configured." }, { status: 503 });
  }
  const [currentTex, currentReview] = await Promise.all([
    readCvPrebuildArtifactText(bucket, prebuild.draftTexKey),
    readCvPrebuildArtifactText(bucket, prebuild.reviewKey),
  ]);
  if (!currentTex) {
    return NextResponse.json({ error: "The current CV draft is unavailable." }, { status: 409 });
  }

  try {
    const response = await startCvRevisionResponse({
      apiKey,
      conversationId: prebuild.openaiConversationId,
      prebuildId: prebuild.prebuildId,
      generationKey: prebuild.generationKey,
      message,
      currentTex,
      currentReview,
      model: prebuild.model || DEFAULT_CV_MODEL,
    });
    const now = new Date().toISOString();
    await appendCvPrebuildMessage(database, {
      cvPrebuildJobId: prebuild.id,
      role: "user",
      content: message,
      now,
    });
    const started = await startCvPrebuildRun(database, prebuild.generationKey, {
      conversationId: prebuild.openaiConversationId,
      responseId: response.id,
      model: prebuild.model || DEFAULT_CV_MODEL,
      serviceTier: String(response.service_tier || DEFAULT_CV_SERVICE_TIER),
      now,
    });
    await ensurePendingAssistantMessage(database, prebuild.id, response.id, now);
    return NextResponse.json({ ok: true, status: started?.status ?? "agent_queued" }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "The CV revision could not be started." }, { status: 502 });
  }
}

