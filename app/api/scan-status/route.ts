import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../db";
import { jobs, scanStatus } from "../../../db/schema";

export const dynamic = "force-dynamic";

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function count(value: unknown) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

async function readStatus() {
  const db = await getDb();
  const [status] = await db.select().from(scanStatus).where(eq(scanStatus.id, 1)).limit(1);
  const totalJobs = (await db.select({ id: jobs.id }).from(jobs)).length;
  return {
    ...(status ?? {
      id: 1,
      state: "idle",
      atsScanned: 0,
      atsMatched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      startedAt: "",
      completedAt: "",
      message: "",
      phase: "",
      currentSource: "",
      stepsCompleted: 0,
      stepsTotal: 0,
      scanned: 0,
      uniqueJobs: 0,
      filtered: 0,
      verified: 0,
      eligible: 0,
      progressUpdatedAt: "",
    }),
    totalJobs,
    timeoutMinutes: 60,
  };
}

export async function GET() {
  return NextResponse.json(await readStatus());
}

export async function POST(request: NextRequest) {
  const { env } = await import("cloudflare:workers");
  const configuredToken = cleanText(env.IVY_JOB_RADAR_SYNC_TOKEN);
  const authorization = request.headers.get("authorization") ?? "";
  const providedToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!configuredToken || providedToken !== configuredToken) {
    return NextResponse.json({ error: "Unauthorized status update." }, { status: 401 });
  }

  const body = await request.json() as Record<string, unknown>;
  const state = cleanText(body.state);
  if (!["queued", "running", "completed", "failed"].includes(state)) {
    return NextResponse.json({ error: "Unsupported scan state." }, { status: 400 });
  }

  const db = await getDb();
  const now = new Date().toISOString();
  const [current] = await db.select().from(scanStatus).where(eq(scanStatus.id, 1)).limit(1);
  const progressCount = (camel: string, snake: string, previous: number | undefined) =>
    body[camel] !== undefined || body[snake] !== undefined
      ? count(body[camel] ?? body[snake])
      : previous ?? 0;
  const progressValues = {
    phase: cleanText(body.phase) || current?.phase || "",
    currentSource: cleanText(body.current_source ?? body.currentSource) || current?.currentSource || "",
    stepsCompleted: progressCount("stepsCompleted", "steps_completed", current?.stepsCompleted),
    stepsTotal: progressCount("stepsTotal", "steps_total", current?.stepsTotal),
    scanned: progressCount("scanned", "scanned", current?.scanned),
    uniqueJobs: progressCount("uniqueJobs", "unique_jobs", current?.uniqueJobs),
    filtered: progressCount("filtered", "filtered", current?.filtered),
    verified: progressCount("verified", "verified", current?.verified),
    eligible: progressCount("eligible", "eligible", current?.eligible),
    progressUpdatedAt: now,
  };
  const values = state === "running" || state === "queued"
    ? {
      id: 1,
      state,
      created: body.created === undefined ? current?.created ?? 0 : count(body.created),
      updated: body.updated === undefined ? current?.updated ?? 0 : count(body.updated),
      skipped: body.skipped === undefined ? current?.skipped ?? 0 : count(body.skipped),
      startedAt: cleanText(body.started_at ?? body.startedAt) || current?.startedAt || now,
      completedAt: "",
      message: cleanText(body.message) || "美国岗位更新正在运行。",
      ...progressValues,
    }
    : state === "completed"
      ? {
        id: 1,
        state,
        created: count(body.created),
        updated: count(body.updated),
        skipped: count(body.skipped),
        completedAt: now,
        message: cleanText(body.message) || "GitHub Actions 已完成本轮扫描和回写。",
        ...progressValues,
      }
      : {
      id: 1,
      state,
      completedAt: now,
      message: cleanText(body.message) || "GitHub Actions 执行失败，请查看运行日志。",
      ...progressValues,
    };

  await db.insert(scanStatus).values(values).onConflictDoUpdate({
    target: scanStatus.id,
    set: values,
  });
  return NextResponse.json(await readStatus());
}
