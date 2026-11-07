import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../../db";
import { jobs, scanStatus } from "../../../../db/schema";
import { activeJobStatuses, deadlineHasPassed, verifyPosting } from "../../../lib/job-expiration";
import { canonicalizeJobIdentityUrl } from "../../../lib/job-identity";
import { ingestJobs } from "../../../lib/job-ingestion";
import { createJobIngestionContext } from "../../../lib/job-ingestion-store";

export const dynamic = "force-dynamic";

type ImportJob = Record<string, unknown>;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function canonicalizeJobUrl(raw: string) {
  return canonicalizeJobIdentityUrl(raw);
}

export async function POST(request: NextRequest) {
  const { env } = await import("cloudflare:workers");
  const configuredToken = cleanText(env.IVY_JOB_RADAR_SYNC_TOKEN);
  const authorization = request.headers.get("authorization") ?? "";
  const providedToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!configuredToken || providedToken !== configuredToken) {
    return NextResponse.json({ error: "Unauthorized import request." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }

  const envelope = !Array.isArray(payload) && payload && typeof payload === "object"
    ? payload as { jobs?: unknown; complete_source?: unknown; seen_urls?: unknown; finalize_run?: unknown }
    : null;
  const importRows = Array.isArray(payload) ? payload : Array.isArray(envelope?.jobs) ? envelope.jobs : null;
  if (!importRows) {
    return NextResponse.json({ error: "The request body must contain a job array." }, { status: 400 });
  }
  if (importRows.length > 500) {
    return NextResponse.json({ error: "A single import cannot exceed 500 jobs." }, { status: 413 });
  }

  const db = await getDb();
  const now = new Date().toISOString();
  const context = await createJobIngestionContext(now);
  const ingestion = await ingestJobs(importRows, context);
  const { created, updated, skipped } = ingestion;
  const importedSources = new Set(importRows.flatMap((row) => {
    const raw = row && typeof row === "object" ? row as ImportJob : {};
    const metadata = raw.context && typeof raw.context === "object" ? raw.context as ImportJob : {};
    return [cleanText(metadata.source) || cleanText(raw.source) || cleanText(raw.provider)].filter(Boolean);
  }));
  const completedSource = cleanText(envelope?.complete_source) || cleanText(request.headers.get("x-ivy-scan-source"));
  const scanComplete = Boolean(completedSource) && (Boolean(envelope) || request.headers.get("x-ivy-scan-complete") === "true");

  const rawBatch = importRows.every(row => row && typeof row === "object" && "raw" in row);
  const finalize = !rawBatch || envelope?.finalize_run === true || scanComplete;
  const activeRows = finalize ? (await db.select().from(jobs)).filter((row) => activeJobStatuses.has(row.status)) : [];
  for (const row of activeRows) {
    if (!deadlineHasPassed(row.deadline, row.deadlineType, now)) continue;
    await db.update(jobs).set({
      status: "已过期",
      expirationReason: `申请截止日期 ${row.deadline} 已过`,
    }).where(eq(jobs.id, row.id));
  }

  if (scanComplete && completedSource) {
    const envelopeSeenUrls = Array.isArray(envelope?.seen_urls) ? envelope.seen_urls.map(cleanText) : [];
    const seenUrls = new Set([
      ...envelopeSeenUrls,
      ...(importRows as ImportJob[]).filter(raw => raw && typeof raw === "object").flatMap((raw) => [
        cleanText(raw.job_url), cleanText(raw.original_job_url), cleanText(raw.official_url), cleanText(raw.canonical_url),
      ]),
    ].filter(Boolean).map(canonicalizeJobUrl));
    const sourceRows = activeRows.filter((row) =>
      row.source === completedSource && !deadlineHasPassed(row.deadline, row.deadlineType, now),
    );
    for (const row of sourceRows) {
      const rowUrls = [row.jobUrl, row.canonicalUrl].filter(Boolean).map(canonicalizeJobUrl);
      if (rowUrls.some((url) => seenUrls.has(url))) continue;
      const misses = row.missedScanCount + 1;
      const verification = await verifyPosting(row.jobUrl);
      if (verification.state === "expired") {
        await db.update(jobs).set({
          status: "已过期",
          missedScanCount: misses,
          expirationReason: verification.reason,
        }).where(eq(jobs.id, row.id));
        continue;
      }
      if (misses < 2) {
        await db.update(jobs).set({
          missedScanCount: misses,
          expirationReason: verification.state === "unknown" ? verification.reason : "",
        }).where(eq(jobs.id, row.id));
        continue;
      }
      if (verification.state === "open") {
        await db.update(jobs).set({
          status: "开放",
          missedScanCount: 0,
          expirationReason: "",
          checkedAt: now,
        }).where(eq(jobs.id, row.id));
      } else {
        await db.update(jobs).set({
          status: "疑似过期",
          missedScanCount: misses,
          expirationReason: verification.reason,
        }).where(eq(jobs.id, row.id));
      }
    }
  }

  if (envelope && importRows.length === 0) {
    return NextResponse.json({ ok: true, ...ingestion, pipeline: "shared-backend-v1", reconciledAt: now });
  }

  const [count] = await db.select({ total: sql<number>`count(*)` }).from(jobs);
  const totalJobs = Number(count.total);
  const includesUsJobs = importRows.some((row) => {
    if (!row || typeof row !== "object") return false;
    const value = row as ImportJob;
    const metadata = value.context && typeof value.context === "object" ? value.context as ImportJob : {};
    return cleanText(value.region || metadata.region) === "美国";
  });
  const [currentUsScan] = await db.select().from(scanStatus).where(eq(scanStatus.id, 1)).limit(1);
  // Workflow batches must not mark the scan complete before every source is imported.
  // China imports also must not overwrite the independent US progress lane.
  if (includesUsJobs && !["queued", "running", "ats_complete"].includes(currentUsScan?.state ?? "")) {
    const sourceSummary = Array.from(importedSources).join("、") || "外部采集器";
    await db.insert(scanStatus).values({
      id: 1,
      state: "completed",
      created,
      updated,
      skipped,
      totalJobs,
      completedAt: now,
      message: created > 0
        ? `${sourceSummary} 已完成同步，本轮新增 ${created} 个岗位。`
        : `${sourceSummary} 已完成同步，本轮没有新增岗位。`,
    }).onConflictDoUpdate({
      target: scanStatus.id,
      set: {
        state: "completed",
        created,
        updated,
        skipped,
        totalJobs,
        completedAt: now,
        message: created > 0
          ? `${sourceSummary} 已完成同步，本轮新增 ${created} 个岗位。`
          : `${sourceSummary} 已完成同步，本轮没有新增岗位。`,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    ...ingestion,
    importedAt: now,
    pipeline: "shared-backend-v1",
  });
}
