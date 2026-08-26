import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getD1, getDb } from "../../../db";
import {
  applicationAutomationTasks,
  applicationStatusEvents,
  applications,
  cvPrebuildJobs,
  jobs,
} from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { templateFiles } from "../../lib/application-archive";
import {
  type AutomationConfig,
  evaluateAutomationCandidate,
} from "../../lib/application-automation";
import {
  getAutomationConfig,
  listAutomationTasks,
  reconcileAutomationTasks,
} from "../../lib/application-automation-store";
import { recommendCvPrebuildTemplate } from "../../lib/cv-prebuild-bundle";
import { getLatestCvPrebuildJob, initializeCvPrebuildJob } from "../../lib/cv-prebuild-store";
import { sameLogicalJob } from "../../lib/job-identity";
import { saveJob } from "../../lib/saved-jobs-store";

export const dynamic = "force-dynamic";

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function hasRunAccess(request: NextRequest) {
  if (await getChatGPTUser()) return true;
  const { env } = await import("cloudflare:workers");
  const configured = String(env.IVY_JOB_RADAR_SYNC_TOKEN ?? "").trim();
  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  return Boolean(configured && provided === configured);
}

function summaryFor(tasks: Awaited<ReturnType<typeof listAutomationTasks>>) {
  const summary = {
    total: tasks.length,
    screening: 0,
    awaitingCv: 0,
    ready: 0,
    running: 0,
    needsReview: 0,
    submitted: 0,
    failed: 0,
    screenedOut: 0,
  };
  for (const task of tasks) {
    if (task.status === "screened_out") summary.screenedOut += 1;
    else if (task.status === "awaiting_cv") summary.awaitingCv += 1;
    else if (task.status === "ready_for_browser") summary.ready += 1;
    else if (["claimed", "filling"].includes(task.status)) summary.running += 1;
    else if (task.status === "needs_review") summary.needsReview += 1;
    else if (task.status === "submitted") summary.submitted += 1;
    else if (["cv_failed", "failed_retryable"].includes(task.status)) summary.failed += 1;
    else summary.screening += 1;
  }
  return summary;
}

export async function GET() {
  if (!(await getChatGPTUser())) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }
  const database = await getD1();
  const now = new Date().toISOString();
  await reconcileAutomationTasks(database, now);
  const [config, tasks] = await Promise.all([
    getAutomationConfig(database),
    listAutomationTasks(database, 150),
  ]);
  return NextResponse.json({
    config,
    summary: summaryFor(tasks),
    tasks: tasks.map((task) => ({
      ...task,
      reasons: parseJsonArray(task.decisionJson),
      blockers: parseJsonArray(task.blockerJson),
      claimToken: undefined,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest) {
  if (!(await getChatGPTUser())) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  }
  const database = await getD1();
  const current = await getAutomationConfig(database);
  const requestedMode = body.executionMode === "automatic" ? "automatic" : "pilot";
  const submitted = await database.prepare(`
    SELECT COUNT(*) AS count FROM application_automation_tasks WHERE status = 'submitted'
  `).first<{ count: number }>();
  const pilotComplete = Number(submitted?.count ?? 0) >= 5;
  const finalSubmitEnabled = requestedMode === "automatic"
    && body.finalSubmitEnabled === true
    && pilotComplete;
  const next: AutomationConfig = {
    ...current,
    enabled: body.enabled === undefined ? current.enabled : body.enabled === true,
    executionMode: finalSubmitEnabled ? "automatic" : "pilot",
    dailyLimit: Math.max(1, Math.min(5, Number(body.dailyLimit) || current.dailyLimit)),
    minimumScore: Math.max(70, Math.min(95, Number(body.minimumScore) || current.minimumScore)),
    defaultLanguage: body.defaultLanguage === "zh" ? "zh" : "en",
    allowedAts: current.allowedAts,
    finalSubmitEnabled,
    updatedAt: new Date().toISOString(),
  };
  await database.prepare(`
    INSERT INTO application_automation_config (
      id, enabled, execution_mode, daily_limit, minimum_score,
      default_language, allowed_ats_json, final_submit_enabled, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      enabled = excluded.enabled,
      execution_mode = excluded.execution_mode,
      daily_limit = excluded.daily_limit,
      minimum_score = excluded.minimum_score,
      default_language = excluded.default_language,
      allowed_ats_json = excluded.allowed_ats_json,
      final_submit_enabled = excluded.final_submit_enabled,
      updated_at = excluded.updated_at
  `).bind(
    next.enabled ? 1 : 0,
    next.executionMode,
    next.dailyLimit,
    next.minimumScore,
    next.defaultLanguage,
    JSON.stringify(next.allowedAts),
    next.finalSubmitEnabled ? 1 : 0,
    next.updatedAt,
  ).run();
  return NextResponse.json({ config: next, pilotComplete });
}

export async function POST(request: NextRequest) {
  if (!await hasRunAccess(request)) {
    return NextResponse.json({ error: "Unauthorized automation request." }, { status: 401 });
  }
  const database = await getD1();
  const config = await getAutomationConfig(database);
  if (!config.enabled) {
    return NextResponse.json({ ok: true, disabled: true, queuedJobIds: [] });
  }

  const db = await getDb();
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const [jobRows, existingTasks, applicationRows] = await Promise.all([
    db.select().from(jobs).orderBy(desc(jobs.discoveredAt), desc(jobs.score)).limit(160),
    db.select().from(applicationAutomationTasks),
    db.select().from(applications),
  ]);
  const existingTaskByJob = new Map(existingTasks.map((task) => [task.jobId, task]));
  const alreadySelectedToday = existingTasks.filter((task) =>
    task.createdAt.startsWith(today) && task.status !== "screened_out",
  ).length;
  let availableSlots = Math.max(0, config.dailyLimit - alreadySelectedToday);
  const queuedJobIds: number[] = [];
  const screenedOut: number[] = [];

  for (const job of jobRows) {
    if (existingTaskByJob.has(job.id)) continue;
    const decision = evaluateAutomationCandidate(job, config);
    if (!decision.eligible) {
      await db.insert(applicationAutomationTasks).values({
        jobId: job.id,
        status: "screened_out",
        stage: "hard_filter",
        atsProvider: decision.atsProvider,
        language: config.defaultLanguage,
        templateTrack: decision.templateTrack,
        eligibilityScore: decision.score,
        decisionJson: JSON.stringify(decision.reasons),
        blockerJson: JSON.stringify(decision.blockers),
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing();
      screenedOut.push(job.id);
      continue;
    }
    if (availableSlots <= 0) continue;

    let application = applicationRows.find((row) => sameLogicalJob(row, job));
    if (!application) {
      [application] = await db.insert(applications).values({
        company: job.company,
        title: job.title,
        region: job.region,
        location: job.location,
        track: job.track,
        jobUrl: job.jobUrl,
        applicationId: job.applicationId,
        source: job.source,
        fit: Math.max(1, Math.min(5, Math.round(job.score / 20))),
        interest: 4,
        priority: job.score >= 85 ? "P1" : "P2",
        status: "准备材料",
        deadline: job.deadline,
        deadlineType: job.deadlineType,
        deadlineSource: job.deadline || job.deadlineType === "rolling" ? "automatic" : "unknown",
        plannedApplicationDate: today,
        discoveredDate: job.discoveredAt.slice(0, 10),
        appliedDate: "",
        followUpDate: "",
        nextAction: "自动投递：等待 CV",
        resumeVersion: "",
        workAuthorization: "需要未来 H-1B Sponsorship",
        interviewNotes: "",
        notes: job.evidence,
        createdAt: now,
        updatedAt: now,
      }).returning();
      applicationRows.push(application);
    } else if (application.status === "收藏") {
      [application] = await db.update(applications).set({
        status: "准备材料",
        plannedApplicationDate: today,
        nextAction: "自动投递：等待 CV",
        updatedAt: now,
      }).where(eq(applications.id, application.id)).returning();
    }

    await saveJob(database, job.id, now);
    const { env } = await import("cloudflare:workers");
    const cvConfigured = Boolean(
      String(env.OPENAI_API_KEY ?? "").trim()
      && String(env.CV_GITHUB_TOKEN ?? "").trim(),
    );
    await initializeCvPrebuildJob(database, job.id, cvConfigured, now);
    let prebuild = await getLatestCvPrebuildJob(database, job.id);
    const selection = recommendCvPrebuildTemplate(job, decision.templateTrack, config.defaultLanguage);
    const templateFile = templateFiles[selection.language][selection.track];
    if (prebuild && !prebuild.generationKey) {
      await db.update(cvPrebuildJobs).set({
        applicationRowId: application.id,
        language: selection.language,
        track: selection.track,
        templateFile,
        status: cvConfigured ? "queued" : "blocked_configuration",
        updatedAt: now,
      }).where(eq(cvPrebuildJobs.id, prebuild.id));
      prebuild = await getLatestCvPrebuildJob(database, job.id);
    }

    const taskStatus = "awaiting_cv";
    await db.insert(applicationAutomationTasks).values({
      jobId: job.id,
      applicationRowId: application.id,
      status: taskStatus,
      stage: prebuild?.status === "ready" && prebuild.draftPdfKey
        ? "cv_ready_pending_decision"
        : "cv_queued",
      atsProvider: decision.atsProvider,
      language: selection.language,
      templateTrack: selection.track,
      eligibilityScore: decision.score,
      decisionJson: JSON.stringify(decision.reasons),
      blockerJson: JSON.stringify(decision.blockers),
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
    queuedJobIds.push(job.id);
    availableSlots -= 1;
  }

  return NextResponse.json({
    ok: true,
    mode: config.executionMode,
    dailyLimit: config.dailyLimit,
    queuedJobIds,
    screenedOut: screenedOut.length,
    selectedToday: alreadySelectedToday + queuedJobIds.length,
  });
}

export async function PATCH(request: NextRequest) {
  if (!(await getChatGPTUser())) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  }
  const taskId = Number(body.taskId);
  if (!Number.isSafeInteger(taskId) || taskId <= 0) {
    return NextResponse.json({ error: "A valid task id is required." }, { status: 400 });
  }
  const db = await getDb();
  const [task] = await db.select().from(applicationAutomationTasks)
    .where(eq(applicationAutomationTasks.id, taskId)).limit(1);
  if (!task) return NextResponse.json({ error: "Automation task not found." }, { status: 404 });
  const now = new Date().toISOString();
  if (body.action === "confirm_submitted") {
    if (task.status !== "needs_review") {
      return NextResponse.json({ error: "Only a reviewed pilot task can be confirmed as submitted." }, { status: 409 });
    }
    await db.update(applicationAutomationTasks).set({
      status: "submitted",
      stage: "user_confirmed_submission",
      submittedAt: now,
      confirmationText: String(body.confirmationText ?? "用户确认申请已提交").slice(0, 1000),
      updatedAt: now,
    }).where(eq(applicationAutomationTasks.id, taskId));
    if (task.applicationRowId) {
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
    return NextResponse.json({ ok: true, taskId, status: "submitted" });
  }
  if (body.action === "retry") {
    if (!["cv_failed", "failed_retryable", "needs_review"].includes(task.status)) {
      return NextResponse.json({ error: "This task cannot be retried from its current state." }, { status: 409 });
    }
    const database = await getD1();
    const prebuild = await getLatestCvPrebuildJob(database, task.jobId);
    const nextStatus = prebuild?.status === "ready" && prebuild.draftPdfKey
      ? "ready_for_browser"
      : "awaiting_cv";
    await db.update(applicationAutomationTasks).set({
      status: nextStatus,
      stage: nextStatus === "ready_for_browser" ? "cv_ready" : "cv_retry_requested",
      claimToken: "",
      claimedAt: "",
      lastError: "",
      updatedAt: now,
    }).where(eq(applicationAutomationTasks.id, taskId));
    return NextResponse.json({ ok: true, taskId, status: nextStatus });
  }
  return NextResponse.json({ error: "Unsupported task action." }, { status: 400 });
}
