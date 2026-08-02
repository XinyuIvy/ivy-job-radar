import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../db";
import { chinaScanControl } from "../../../db/schema";

export const dynamic = "force-dynamic";

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function signedInUser(request: NextRequest) {
  return Boolean(request.headers.get("oai-authenticated-user-email")?.trim());
}

async function collectorAuthorized(request: NextRequest) {
  const { env } = await import("cloudflare:workers");
  const configuredToken = cleanText(env.IVY_JOB_RADAR_SYNC_TOKEN);
  const authorization = request.headers.get("authorization") ?? "";
  const providedToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  return Boolean(configuredToken && providedToken === configuredToken);
}

function idleControl() {
  return {
    id: 1,
    requestId: "",
    state: "idle",
    requestedAt: "",
    claimedAt: "",
    completedAt: "",
    message: "",
  };
}

function responseControl(control: typeof chinaScanControl.$inferSelect | ReturnType<typeof idleControl>) {
  let progress: Record<string, unknown> | null = null;
  let message = control.message;
  if (message.startsWith("progress:")) {
    try {
      progress = JSON.parse(message.slice("progress:".length)) as Record<string, unknown>;
      message = cleanText(progress.message) || "中国岗位扫描正在运行。";
    } catch {
      progress = null;
    }
  }
  return { ...control, message, progress };
}

export async function GET(request: NextRequest) {
  if (!signedInUser(request) && !(await collectorAuthorized(request))) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }
  const db = await getDb();
  const [control] = await db.select().from(chinaScanControl).where(eq(chinaScanControl.id, 1)).limit(1);
  return NextResponse.json(responseControl(control ?? idleControl()), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }

  const action = cleanText(body.action);
  const db = await getDb();
  const now = new Date().toISOString();

  if (action === "start") {
    if (!signedInUser(request)) {
      return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    }
    const [current] = await db.select().from(chinaScanControl).where(eq(chinaScanControl.id, 1)).limit(1);
    if (current && ["queued", "running"].includes(current.state)) {
      return NextResponse.json(current, { status: 409 });
    }
    const values = {
      id: 1,
      requestId: crypto.randomUUID(),
      state: "queued",
      requestedAt: now,
      claimedAt: "",
      completedAt: "",
      message: "等待 Mac 采集服务领取任务。",
    };
    await db.insert(chinaScanControl).values(values).onConflictDoUpdate({
      target: chinaScanControl.id,
      set: values,
    });
    return NextResponse.json(values, { status: 201 });
  }

  if (!(await collectorAuthorized(request))) {
    return NextResponse.json({ error: "Collector authentication failed." }, { status: 401 });
  }

  const requestId = cleanText(body.request_id);
  if (!requestId) {
    return NextResponse.json({ error: "request_id is required." }, { status: 400 });
  }

  if (action === "claim") {
    const updated = await db.update(chinaScanControl).set({
      state: "running",
      claimedAt: now,
      message: "Mac 已领取任务，正在扫描中国招聘平台。",
    }).where(and(
      eq(chinaScanControl.id, 1),
      eq(chinaScanControl.requestId, requestId),
      eq(chinaScanControl.state, "queued"),
    )).returning();
    return NextResponse.json({ claimed: updated.length === 1, control: updated[0] ?? null });
  }

  if (action === "progress") {
    const rawProgress = body.progress && typeof body.progress === "object"
      ? body.progress as Record<string, unknown>
      : {};
    const progress = {
      source: cleanText(rawProgress.source).slice(0, 80),
      phase: cleanText(rawProgress.phase).slice(0, 80),
      message: cleanText(rawProgress.message).slice(0, 300),
      completed: Math.max(0, Math.floor(Number(rawProgress.completed) || 0)),
      total: Math.max(0, Math.floor(Number(rawProgress.total) || 0)),
      scanned: Math.max(0, Math.floor(Number(rawProgress.scanned) || 0)),
      unique: Math.max(0, Math.floor(Number(rawProgress.unique) || 0)),
      filtered: Math.max(0, Math.floor(Number(rawProgress.filtered) || 0)),
      detailCandidates: Math.max(0, Math.floor(Number(rawProgress.detail_candidates) || 0)),
      eligible: Math.max(0, Math.floor(Number(rawProgress.eligible) || 0)),
      created: Math.max(0, Math.floor(Number(rawProgress.created) || 0)),
      duplicate: Math.max(0, Math.floor(Number(rawProgress.duplicate) || 0)),
      rejectionReasons: rawProgress.rejection_reasons && typeof rawProgress.rejection_reasons === "object"
        ? rawProgress.rejection_reasons
        : {},
      updatedAt: now,
    };
    const updated = await db.update(chinaScanControl).set({
      state: "running",
      message: `progress:${JSON.stringify(progress)}`.slice(0, 4000),
    }).where(and(
      eq(chinaScanControl.id, 1),
      eq(chinaScanControl.requestId, requestId),
    )).returning();
    return NextResponse.json({ updated: updated.length === 1, control: updated[0] ? responseControl(updated[0]) : null });
  }

  if (action === "finish") {
    const state = cleanText(body.state);
    if (!["completed", "failed", "attention_required"].includes(state)) {
      return NextResponse.json({ error: "Unsupported final state." }, { status: 400 });
    }
    const updated = await db.update(chinaScanControl).set({
      state,
      completedAt: now,
      message: cleanText(body.message).slice(0, 1000),
    }).where(and(
      eq(chinaScanControl.id, 1),
      eq(chinaScanControl.requestId, requestId),
    )).returning();
    return NextResponse.json({ updated: updated.length === 1, control: updated[0] ?? null });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
