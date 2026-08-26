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
  updateAutomationTask,
} from "../../../lib/application-automation-store";
import { reconcileCvForAutomation } from "../../../lib/application-automation-runtime";
import { deriveBookmarkCaptureKey, secureBookmarkKeyEqual } from "../../../lib/bookmark-capture";

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
