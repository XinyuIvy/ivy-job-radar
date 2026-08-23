import { NextRequest, NextResponse } from "next/server";

import { getD1 } from "../../../db";
import { deleteSavedJob, listSavedJobs, saveJob } from "../../lib/saved-jobs-store";

export const dynamic = "force-dynamic";

function parseJobId(value: unknown) {
  const jobId = Number(value);
  return Number.isSafeInteger(jobId) && jobId > 0 ? jobId : null;
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

  const result = await saveJob(await getD1(), jobId, new Date().toISOString());
  if (result.outcome === "missing") {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  return NextResponse.json(result.row, {
    status: result.outcome === "created" ? 201 : 200,
  });
}

export async function DELETE(request: NextRequest) {
  const jobId = parseJobId(request.nextUrl.searchParams.get("jobId"));
  if (!jobId) {
    return NextResponse.json({ error: "A valid job id is required." }, { status: 400 });
  }

  const deleted = await deleteSavedJob(await getD1(), jobId);
  return NextResponse.json({ ok: true, jobId, deleted });
}
