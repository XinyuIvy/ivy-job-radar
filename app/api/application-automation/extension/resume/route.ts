import { NextRequest, NextResponse } from "next/server";

import { getD1 } from "../../../../../db";
import { getAutomationConfig, listAutomationTasks } from "../../../../lib/application-automation-store";
import { deriveBookmarkCaptureKey, secureBookmarkKeyEqual } from "../../../../lib/bookmark-capture";
import type { CvPrebuildArtifactBucket } from "../../../../lib/cv-prebuild-artifacts";
import { getLatestCvPrebuildJob } from "../../../../lib/cv-prebuild-store";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "X-Ivy-Autofill-Key, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

export async function GET(request: NextRequest) {
  if (!await authorize(request)) {
    return NextResponse.json({ error: "Invalid autofill key." }, { status: 401, headers: CORS_HEADERS });
  }
  const taskId = Number(request.nextUrl.searchParams.get("taskId"));
  if (!Number.isSafeInteger(taskId) || taskId <= 0) {
    return NextResponse.json({ error: "A valid task id is required." }, { status: 400, headers: CORS_HEADERS });
  }
  const database = await getD1();
  const [config, tasks] = await Promise.all([
    getAutomationConfig(database),
    listAutomationTasks(database, 200),
  ]);
  if (!config.enabled) {
    return NextResponse.json({ error: "Application automation is disabled." }, { status: 409, headers: CORS_HEADERS });
  }
  const task = tasks.find((row) => row.id === taskId);
  if (!task || !["ready_for_browser", "claimed", "filling", "needs_review"].includes(task.status)) {
    return NextResponse.json({ error: "Automation task is not ready for its CV." }, { status: 409, headers: CORS_HEADERS });
  }
  const prebuild = await getLatestCvPrebuildJob(database, task.jobId);
  if (!prebuild?.draftPdfKey) {
    return NextResponse.json({ error: "The customized CV is not ready." }, { status: 404, headers: CORS_HEADERS });
  }
  const { env } = await import("cloudflare:workers");
  const bucket = env.BUCKET as CvPrebuildArtifactBucket | undefined;
  const object = bucket ? await bucket.get(prebuild.draftPdfKey) : null;
  if (!object) {
    return NextResponse.json({ error: "The customized CV file is unavailable." }, { status: 404, headers: CORS_HEADERS });
  }
  return new NextResponse(object.body as BodyInit, {
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "private, no-store",
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${prebuild.prebuildId || `job-${task.jobId}`}-cv.pdf"`,
    },
  });
}
