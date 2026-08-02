import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../db";
import { jobs, scanStatus } from "../../../db/schema";

export const dynamic = "force-dynamic";

function cleanText(value: unknown) {
  return String(value ?? "").trim();
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
  if (!["running", "completed", "failed"].includes(state)) {
    return NextResponse.json({ error: "Unsupported scan state." }, { status: 400 });
  }

  const db = await getDb();
  const now = new Date().toISOString();
  const values = state === "running"
    ? {
      id: 1,
      state,
      created: 0,
      updated: 0,
      skipped: 0,
      startedAt: now,
      completedAt: "",
      message: "GitHub Actions 正在执行美国聚合平台和美国公司官网扫描。",
    }
    : state === "completed"
      ? {
        id: 1,
        state,
        completedAt: now,
        message: cleanText(body.message) || "GitHub Actions 已完成本轮扫描和回写。",
      }
      : {
      id: 1,
      state,
      completedAt: now,
      message: cleanText(body.message) || "GitHub Actions 执行失败，请查看运行日志。",
    };

  await db.insert(scanStatus).values(values).onConflictDoUpdate({
    target: scanStatus.id,
    set: values,
  });
  return NextResponse.json(await readStatus());
}
