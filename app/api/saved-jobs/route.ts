import { NextRequest, NextResponse } from "next/server";

import { getD1 } from "../../../db";
import { cancelCvPrebuildJob, initializeCvPrebuildJob } from "../../lib/cv-prebuild-store";
import { deleteSavedJob, listSavedJobs, saveJob } from "../../lib/saved-jobs-store";

export const dynamic = "force-dynamic";

function parseJobId(value: unknown) {
  const jobId = Number(value);
  return Number.isSafeInteger(jobId) && jobId > 0 ? jobId : null;
}

async function hasCvPrebuilderConfiguration() {
  const { env } = await import("cloudflare:workers");
  return Boolean(
    String(env.CV_PREBUILDER_AGENT_TRIGGER_ID ?? "").trim()
    && String(env.CV_PREBUILDER_AGENT_ACCESS_TOKEN ?? "").trim(),
  );
}

export async function GET() {
  const rows = await listSavedJobs(await getD1());
  return NextResponse.json(rows, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  }

  const jobId = parseJobId(body.jobId);
  if (!jobId) {
    return NextResponse.json({ error: "A valid job id is required." }, { status: 400 });
  }

  const database = await getD1();
  const now = new Date().toISOString();
  const result = await saveJob(database, jobId, now);
  if (result.outcome === "missing") {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  let prebuildStatus = "failed_retryable";
  try {
    const prebuild = await initializeCvPrebuildJob(
      database,
      jobId,
      await hasCvPrebuilderConfiguration(),
      now,
    );
    prebuildStatus = prebuild?.status ?? prebuildStatus;
  } catch {
    // Saving a job stays authoritative even when prebuild state initialization fails.
  }

  return NextResponse.json({ ...result.row, prebuildStatus }, {
    status: result.outcome === "created" ? 201 : 200,
  });
}

export async function DELETE(request: NextRequest) {
  const jobId = parseJobId(request.nextUrl.searchParams.get("jobId"));
  if (!jobId) {
    return NextResponse.json({ error: "A valid job id is required." }, { status: 400 });
  }

  const database = await getD1();
  const deleted = await deleteSavedJob(database, jobId);
  if (deleted) {
    try {
      await cancelCvPrebuildJob(database, jobId, new Date().toISOString());
    } catch {
      // Removing the saved relation must not depend on prebuild state cleanup.
    }
  }
  return NextResponse.json({ ok: true, jobId, deleted });
}
