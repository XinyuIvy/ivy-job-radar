import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getD1, getDb } from "../../../../db";
import { jobs, savedJobs } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import {
  cvPrebuildArtifactDefinition,
  type CvPrebuildArtifactBucket,
  type CvPrebuildArtifactKind,
} from "../../../lib/cv-prebuild-artifacts";
import { getLatestCvPrebuildJob } from "../../../lib/cv-prebuild-store";

export const dynamic = "force-dynamic";

const validKinds = new Set<CvPrebuildArtifactKind>(["pdf", "tex", "text", "review", "decision"]);

function parseJobId(value: unknown) {
  const jobId = Number(value);
  return Number.isSafeInteger(jobId) && jobId > 0 ? jobId : null;
}

export async function GET(request: NextRequest) {
  if (!(await getChatGPTUser())) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }
  const jobId = parseJobId(request.nextUrl.searchParams.get("jobId"));
  const kind = String(request.nextUrl.searchParams.get("kind") ?? "") as CvPrebuildArtifactKind;
  if (!jobId || !validKinds.has(kind)) {
    return NextResponse.json({ error: "A valid job id and artifact kind are required." }, { status: 400 });
  }

  const db = await getDb();
  const [[job], [saved]] = await Promise.all([
    db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1),
    db.select().from(savedJobs).where(eq(savedJobs.jobId, jobId)).limit(1),
  ]);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (!saved) return NextResponse.json({ error: "This job is not saved." }, { status: 409 });

  const prebuild = await getLatestCvPrebuildJob(await getD1(), jobId);
  const keyByKind: Record<CvPrebuildArtifactKind, string> = {
    pdf: prebuild?.draftPdfKey ?? "",
    tex: prebuild?.draftTexKey ?? "",
    text: prebuild?.draftTextKey ?? "",
    review: prebuild?.reviewKey ?? "",
    decision: prebuild?.decisionKey ?? "",
  };
  const key = keyByKind[kind];
  if (!key) return NextResponse.json({ error: "The requested artifact is not ready." }, { status: 404 });

  const { env } = await import("cloudflare:workers");
  const bucket = env.BUCKET as CvPrebuildArtifactBucket | undefined;
  const object = bucket ? await bucket.get(key) : null;
  if (!object) return NextResponse.json({ error: "The requested artifact is unavailable." }, { status: 404 });

  const definition = cvPrebuildArtifactDefinition(kind);
  const disposition = kind === "pdf" ? "inline" : "attachment";
  const filename = `${prebuild?.prebuildId || `job-${jobId}`}-${definition.filename}`;
  return new NextResponse(object.body as BodyInit, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": definition.contentType,
      "Content-Disposition": `${disposition}; filename="${filename}"`,
    },
  });
}
