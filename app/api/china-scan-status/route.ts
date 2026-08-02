import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../db";
import { chinaScanStatus } from "../../../db/schema";

export const dynamic = "force-dynamic";

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function count(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function parseResults(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const db = await getDb();
  const [status] = await db.select().from(chinaScanStatus).where(eq(chinaScanStatus.id, 1)).limit(1);
  if (!status) return NextResponse.json(null);
  return NextResponse.json({ ...status, results: parseResults(status.results) });
}

export async function POST(request: NextRequest) {
  const { env } = await import("cloudflare:workers");
  const configuredToken = cleanText(env.IVY_JOB_RADAR_SYNC_TOKEN);
  const authorization = request.headers.get("authorization") ?? "";
  const providedToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!configuredToken || providedToken !== configuredToken) {
    return NextResponse.json({ error: "Unauthorized China scan status update." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }

  const status = cleanText(body.status);
  if (!["completed", "partial", "failed"].includes(status) || body.dry_run === true) {
    return NextResponse.json({ error: "Unsupported China scan report." }, { status: 400 });
  }

  const results = Array.isArray(body.results) ? body.results.slice(0, 20) : [];
  const serializedResults = JSON.stringify(results);
  if (serializedResults.length > 100_000) {
    return NextResponse.json({ error: "China scan report is too large." }, { status: 413 });
  }

  const now = new Date().toISOString();
  const values = {
    id: 1,
    status,
    sourcesCompleted: count(body.sources_completed),
    sourcesFailed: count(body.sources_failed),
    jobsDiscovered: count(body.jobs_discovered),
    jobsEligible: count(body.jobs_eligible),
    jobsCreated: count(body.jobs_created),
    jobsUpdatedOrDuplicate: count(body.jobs_updated_or_duplicate),
    results: serializedResults,
    finishedAt: cleanText(body.finished_at) || now,
    receivedAt: now,
  };

  const db = await getDb();
  await db.insert(chinaScanStatus).values(values).onConflictDoUpdate({
    target: chinaScanStatus.id,
    set: values,
  });

  return NextResponse.json({ ok: true, receivedAt: now });
}
