import { desc, gt } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "../../../../db";
import { jobs, savedJobs } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { activeJobStatuses } from "../../../lib/job-expiration";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getChatGPTUser())) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }

  const db = await getDb();
  const savedRows = await db.select().from(savedJobs);
  const savedIds = new Set(savedRows.map((row) => row.jobId));
  const lastSavedJobId = Math.max(0, ...savedRows.map((row) => row.jobId));
  if (!lastSavedJobId) return NextResponse.json([]);

  const rows = await db.select().from(jobs)
    .where(gt(jobs.id, lastSavedJobId))
    .orderBy(desc(jobs.id))
    .limit(12);

  return NextResponse.json(rows
    .filter((job) => !savedIds.has(job.id) && activeJobStatuses.has(job.status))
    .map((job) => ({
      ...job,
      skills: JSON.parse(job.skills || "[]"),
      saved: false,
      cvPrebuildStatus: null,
      cvPrebuildError: "",
    })), { headers: { "Cache-Control": "no-store" } });
}
