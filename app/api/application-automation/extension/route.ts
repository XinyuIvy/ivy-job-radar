import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getD1, getDb } from "../../../../db";
import { applicationStatusEvents, applications } from "../../../../db/schema";
import {
  automationTaskStatuses,
  type AutomationTaskStatus,
} from "../../../lib/application-automation";
import {
  getAutomationConfig,
  listAutomationTasks,
  reconcileAutomationTasks,
  updateAutomationTask,
} from "../../../lib/application-automation-store";
import { deriveBookmarkCaptureKey, secureBookmarkKeyEqual } from "../../../lib/bookmark-capture";
import type { CvPrebuildArtifactBucket } from "../../../lib/cv-prebuild-artifacts";
import { reconcileCvPrebuildRun } from "../../../lib/cv-prebuild-runtime";
import { getLatestCvPrebuildJob } from "../../../lib/cv-prebuild-store";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "X-Ivy-Autofill-Key, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

async function authorize(request: NextRequest) {
  const { env } = await import("cloudflare:workers");
  const expected = await deriveBookmarkCaptureKey(String(env.IVY_JOB_RADAR_SYNC_TOKEN ?? "").trim());
  const provided = String(request.headers.get("x-ivy-autofill-key") ?? "").trim();
  return Boolean(expected && secureBookmarkKeyEqual(expected, provided));
}

function parseTaskId(value: unknown) {
  const taskId = Number(value);
  return Number.isSafeInteger(taskId) && taskId > 0 ? taskId : null;
}

async function reconcileCvForAutomation() {
  const database = await getD1();
  let tasks = await listAutomationTasks(database, 20);
  const { env } = await import("cloudflare:workers");
  const apiKey = String(env.OPENAI_API_KEY ?? "").trim();
  if (apiKey && env.BUCKET) {
    for (const task of tasks.filter((row) => ["awaiting_cv", "ready_for_browser"].includes(row.status))) {
      const prebuild = await getLatestCvPrebuildJob(database, task.jobId);
      if (!prebuild?.openaiResponseId || !["agent_queued", "agent_running"].includes(prebuild.status)) continue;
      await reconcileCvPrebuildRun({
        database,
        bucket: env.BUCKET as CvPrebuildArtifactBucket,
        row: prebuild,
        apiKey,
        now: new Date().toISOString(),
      });
    }
  }
  tasks = await listAutomationTasks(database, 20);
  if (env.BUCKET) {
    for (const task of tasks.filter((row) => row.status === "awaiting_cv")) {
      const prebuild = await getLatestCvPrebuildJob(database, task.jobId);
      if (prebuild?.status !== "ready") continue;
      if (!prebuild.decisionKey) {
        await updateAutomationTask(database, task.id, {
          status: "needs_review",
          stage: "ai_decision_missing",
          error: "The CV completed without a structured application decision.",
          now: new Date().toISOString(),
        });
        continue;
      }
      const object = await (env.BUCKET as CvPrebuildArtifactBucket).get(prebuild.decisionKey);
      let decision: {
        eligible?: boolean;
        confidence?: number;
        recommended_action?: string;
        hard_blockers?: unknown[];
        matched_requirements?: unknown[];
      } | null = null;
      try {
        decision = object ? JSON.parse(await object.text()) as typeof decision : null;
      } catch {}
      const confidence = Number(decision?.confidence ?? 0);
      const normalizedConfidence = confidence > 1 ? confidence / 100 : confidence;
      const hardBlockers = Array.isArray(decision?.hard_blockers) ? decision.hard_blockers.map(String) : [];
      const matchedRequirements = Array.isArray(decision?.matched_requirements) ? decision.matched_requirements.map(String) : [];
      const action = String(decision?.recommended_action ?? "review");
      await database.prepare(`
        UPDATE application_automation_tasks
        SET decision_json = ?, blocker_json = ?, updated_at = ?
        WHERE id = ?
      `).bind(
        JSON.stringify(matchedRequirements),
        JSON.stringify(hardBlockers),
        new Date().toISOString(),
        task.id,
      ).run();
      if (action === "apply" && decision?.eligible === true && normalizedConfidence >= 0.8 && hardBlockers.length === 0) {
        await updateAutomationTask(database, task.id, {
          status: "ready_for_browser",
          stage: "ai_decision_approved",
          now: new Date().toISOString(),
        });
        continue;
      }
      const nextStatus = action === "skip" || hardBlockers.length ? "screened_out" : "needs_review";
      await updateAutomationTask(database, task.id, {
        status: nextStatus,
        stage: nextStatus === "screened_out" ? "ai_hard_filter" : "ai_review_required",
        error: hardBlockers.join("; ") || "The structured application decision requires review.",
        now: new Date().toISOString(),
      });
      if (nextStatus === "screened_out" && task.applicationRowId) {
        const db = await getDb();
        await db.update(applications).set({
          status: "收藏",
          nextAction: "AI 复核发现硬性条件不匹配",
          updatedAt: new Date().toISOString(),
        }).where(eq(applications.id, task.applicationRowId));
      }
    }
  }
  await reconcileAutomationTasks(database, new Date().toISOString());
  return database;
}

export async function GET(request: NextRequest) {
  if (!await authorize(request)) return json({ error: "Invalid autofill key." }, 401);
  const database = await reconcileCvForAutomation();
  const [config, tasks] = await Promise.all([
    getAutomationConfig(database),
    listAutomationTasks(database, 30),
  ]);
  const ready = tasks.filter((task) => task.status === "ready_for_browser");
  const active = tasks.filter((task) => ["claimed", "filling"].includes(task.status));
  return json({
    ok: true,
    config: {
      enabled: config.enabled,
      executionMode: config.executionMode,
      finalSubmitEnabled: config.finalSubmitEnabled,
      allowedAts: config.allowedAts,
      defaultLanguage: config.defaultLanguage,
    },
    ready: ready.map((task) => ({
      id: task.id,
      jobId: task.jobId,
      applicationRowId: task.applicationRowId,
      company: task.company,
      title: task.title,
      location: task.location,
      jobUrl: task.jobUrl,
      atsProvider: task.atsProvider,
      language: task.language,
      templateTrack: task.templateTrack,
      cvReady: Boolean(task.draftPdfKey),
      allowFinalSubmit: config.executionMode === "automatic"
        && config.finalSubmitEnabled
        && config.allowedAts.includes(task.atsProvider as typeof config.allowedAts[number]),
    })),
    active: active.map((task) => ({ id: task.id, status: task.status, updatedAt: task.updatedAt })),
  });
}

export async function POST(request: NextRequest) {
  if (!await authorize(request)) return json({ error: "Invalid autofill key." }, 401);
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "A valid JSON body is required." }, 400);
  }
  const taskId = parseTaskId(body.taskId);
  const action = String(body.action ?? "").trim();
  if (!taskId) return json({ error: "A valid task id is required." }, 400);

  const database = await getD1();
  const tasks = await listAutomationTasks(database, 200);
  const task = tasks.find((row) => row.id === taskId);
  if (!task) return json({ error: "Automation task not found." }, 404);
  const now = new Date().toISOString();

  if (action === "claim") {
    if (task.status !== "ready_for_browser") return json({ error: "Task is not ready to claim." }, 409);
    const claimToken = crypto.randomUUID();
    await updateAutomationTask(database, taskId, {
      status: "claimed",
      stage: "browser_claimed",
      claimToken,
      now,
    });
    return json({ ok: true, taskId, claimToken });
  }

  const claimToken = String(body.claimToken ?? "").trim();
  if (!claimToken || claimToken !== task.claimToken) {
    return json({ error: "The browser claim token is invalid." }, 409);
  }
  const status = String(body.status ?? "") as AutomationTaskStatus;
  if (!automationTaskStatuses.includes(status)) return json({ error: "Invalid task status." }, 400);
  const allowedTransitions: Record<string, AutomationTaskStatus[]> = {
    claimed: ["filling", "needs_review", "failed_retryable"],
    filling: ["needs_review", "submitted", "failed_retryable"],
    needs_review: ["filling", "submitted", "failed_retryable"],
  };
  if (!(allowedTransitions[task.status] ?? []).includes(status)) {
    return json({ error: "Invalid automation task transition." }, 409);
  }

  const config = await getAutomationConfig(database);
  if (status === "submitted") {
    if (!config.finalSubmitEnabled && body.confirmedByUser !== true) {
      return json({ error: "Pilot tasks require explicit user confirmation before recording submission." }, 409);
    }
    if (task.applicationRowId) {
      const db = await getDb();
      await db.update(applications).set({
        status: "已申请",
        appliedDate: now.slice(0, 10),
        nextAction: "等待招聘方回复",
        updatedAt: now,
      }).where(eq(applications.id, task.applicationRowId));
      await db.insert(applicationStatusEvents).values({
        applicationId: task.applicationRowId,
        status: "已申请",
        occurredAt: now,
      });
    }
  }

  await updateAutomationTask(database, taskId, {
    status,
    stage: String(body.stage ?? status),
    error: String(body.error ?? ""),
    confirmationText: String(body.confirmationText ?? ""),
    now,
  });
  return json({ ok: true, taskId, status });
}
