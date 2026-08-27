import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getD1, getDb } from "../../../db";
import {
  applicationAutomationTasks,
  applicationStatusEvents,
  applications,
  cvPrebuildJobs,
  jobs,
  savedJobs,
} from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { templateFiles } from "../../lib/application-archive";
import {
  type AutomationConfig,
  evaluateAutomationCandidate,
} from "../../lib/application-automation";
import {
  getAutomationConfig,
  listAutomationReviewBatch,
  listAutomationTasks,
} from "../../lib/application-automation-store";
import { reconcileCvForAutomation } from "../../lib/application-automation-runtime";
import { isChinaCompanyIdentity, sameCompanyIdentity } from "../../lib/company-identity";
import { recommendCvPrebuildTemplate } from "../../lib/cv-prebuild-bundle";
import { getLatestCvPrebuildJob, initializeCvPrebuildJob } from "../../lib/cv-prebuild-store";
import { extractCoreJobDescription } from "../../lib/job-description";
import { sameLogicalJob } from "../../lib/job-identity";
import { scoreStoredJob } from "../../lib/job-scoring";
import { evaluateTodayShortlistCandidate } from "../../lib/job-shortlist";
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

async function completeAutomationSummary(database: Awaited<ReturnType<typeof reconcileCvForAutomation>>) {
  const result = await database.prepare(`
    SELECT status, COUNT(*) AS count
    FROM application_automation_tasks
    GROUP BY status
  `).all<{ status: string; count: number }>();
  const summary = {
    total: 0,
    awaitingReview: 0,
    screening: 0,
    awaitingCv: 0,
    ready: 0,
    running: 0,
    needsReview: 0,
    submitted: 0,
    failed: 0,
    screenedOut: 0,
  };
  for (const row of result.results ?? []) {
    const count = Number(row.count) || 0;
    summary.total += count;
    if (row.status === "awaiting_user_approval") summary.awaitingReview += count;
    else if (row.status === "screened_out") summary.screenedOut += count;
    else if (row.status === "awaiting_cv") summary.awaitingCv += count;
    else if (row.status === "ready_for_browser") summary.ready += count;
    else if (["claimed", "filling"].includes(row.status)) summary.running += count;
    else if (row.status === "needs_review") summary.needsReview += count;
    else if (row.status === "submitted") summary.submitted += count;
    else if (["cv_failed", "failed_retryable"].includes(row.status)) summary.failed += count;
    else if (row.status !== "cancelled") summary.screening += count;
  }
  return summary;
}

const trackedApplicationStatuses = new Set([
  "准备材料",
  "已申请",
  "一面",
  "二面/技术面",
  "终面",
  "Offer",
]);

function applicationAlreadyTracksJob(
  job: typeof jobs.$inferSelect,
  applicationRows: Array<typeof applications.$inferSelect>,
  savedJobRows: Array<typeof jobs.$inferSelect>,
  reviewedCompanies: string[],
) {
  return applicationRows.some((application) =>
    sameLogicalJob(application, job),
  ) || savedJobRows.some((savedJob) => sameLogicalJob(savedJob, job))
    || (
      isChinaCompanyIdentity(job.company)
      && reviewedCompanies.some((company) => sameCompanyIdentity(company, job.company))
    );
}

export async function GET() {
  if (!(await getChatGPTUser())) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }
  const database = await reconcileCvForAutomation();
  const now = new Date().toISOString();
  await database.prepare(`
    UPDATE application_automation_tasks
    SET status = 'cancelled', stage = 'superseded_by_verified_today_pool',
      last_error = '旧批次来自历史混合岗位池，已取消', updated_at = ?
    WHERE status = 'awaiting_user_approval'
      AND stage <> 'verified_today_batch'
  `).bind(now).run();
  const [config, tasks, reviewBatch, summary] = await Promise.all([
    getAutomationConfig(database),
    listAutomationTasks(database, 200),
    listAutomationReviewBatch(database, 10),
    completeAutomationSummary(database),
  ]);
  return NextResponse.json({
    config,
    summary,
    reviewBatch: reviewBatch.map((task) => ({
      ...task,
      reasons: parseJsonArray(task.decisionJson),
      blockers: parseJsonArray(task.blockerJson),
    })),
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
  const submitted = await database.prepare(`
    SELECT COUNT(*) AS count FROM application_automation_tasks WHERE status = 'submitted'
  `).first<{ count: number }>();
  const pilotComplete = Number(submitted?.count ?? 0) >= 5;
  const finalSubmitEnabled = false;
  const next: AutomationConfig = {
    ...current,
    enabled: body.enabled === undefined ? current.enabled : body.enabled === true,
    executionMode: "pilot",
    dailyLimit: 10,
    minimumScore: Math.max(50, Math.min(80, Number(body.minimumScore) || current.minimumScore)),
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
  const [storedJobs, existingTasks, savedRows, allApplications] = await Promise.all([
    db.select().from(jobs).orderBy(desc(jobs.checkedAt), desc(jobs.discoveredAt), desc(jobs.score)),
    db.select().from(applicationAutomationTasks),
    db.select().from(savedJobs),
    db.select().from(applications),
  ]);
  const savedIds = new Set(savedRows.map((row) => row.jobId));
  const trackedApplications = allApplications.filter((row) => trackedApplicationStatuses.has(row.status));
  const savedJobRows = storedJobs.filter((job) => savedIds.has(job.id));
  const reviewedCompanies = [
    ...trackedApplications.map((application) => application.company),
    ...savedJobRows.map((job) => job.company),
  ];
  const existingTaskByJob = new Map(existingTasks.map((task) => [task.jobId, task]));
  const activeTaskStatuses = new Set([
    "awaiting_cv",
    "ready_for_browser",
    "claimed",
    "filling",
    "needs_review",
    "submitted",
    "cv_failed",
    "failed_retryable",
  ]);
  const candidates: Array<{
    job: typeof jobs.$inferSelect;
    decision: ReturnType<typeof evaluateAutomationCandidate>;
  }> = [];
  let todayEligible = 0;
  let trackedOrSaved = 0;

  for (const storedJob of storedJobs) {
    const description = extractCoreJobDescription(storedJob.description).text;
    const rescored = scoreStoredJob({
      title: storedJob.title,
      content: description || storedJob.evidence,
      region: storedJob.region,
    });
    const job = {
      ...storedJob,
      description,
      score: rescored.score,
      visa: rescored.visa,
    };
    const shortlist = evaluateTodayShortlistCandidate(job, { now });
    const alreadyTracked = savedIds.has(job.id)
      || applicationAlreadyTracksJob(job, trackedApplications, savedJobRows, reviewedCompanies);
    if (!shortlist.eligible || alreadyTracked) {
      if (alreadyTracked) trackedOrSaved += 1;
      continue;
    }
    todayEligible += 1;
    const decision = evaluateAutomationCandidate(job, config);
    if (!decision.eligible) continue;
    const existingTask = existingTaskByJob.get(job.id);
    if (existingTask && activeTaskStatuses.has(existingTask.status)) continue;
    candidates.push({ job, decision });
  }

  candidates.sort((left, right) =>
    right.decision.score - left.decision.score
    || right.job.score - left.job.score
    || right.job.checkedAt.localeCompare(left.job.checkedAt),
  );
  const candidateIds = new Set(candidates.map(({ job }) => job.id));
  const validOpenReviewBatch = existingTasks.filter((task) =>
    task.status === "awaiting_user_approval"
    && task.stage === "verified_today_batch"
    && candidateIds.has(task.jobId),
  );
  for (const task of existingTasks.filter((row) => row.status === "awaiting_user_approval" && !validOpenReviewBatch.includes(row))) {
    await db.update(applicationAutomationTasks).set({
      status: "cancelled",
      stage: "superseded_by_verified_today_pool",
      lastError: "岗位不再属于已核验的今日高匹配池",
      updatedAt: now,
    }).where(eq(applicationAutomationTasks.id, task.id));
  }
  if (validOpenReviewBatch.length) {
    return NextResponse.json({
      ok: true,
      mode: config.executionMode,
      batchSize: config.dailyLimit,
      reviewJobIds: validOpenReviewBatch.slice(0, config.dailyLimit).map((task) => task.jobId),
      queuedJobIds: [],
      sourcePool: storedJobs.length,
      todayEligible,
      automationEligible: candidates.length,
      trackedOrSaved,
      screenedOut: Math.max(0, storedJobs.length - candidates.length),
      existingBatch: true,
    });
  }
  const reviewJobIds: number[] = [];

  for (const { job, decision } of candidates.slice(0, config.dailyLimit)) {
    const values = {
      status: "awaiting_user_approval" as const,
      stage: "verified_today_batch",
      atsProvider: decision.atsProvider,
      language: config.defaultLanguage,
      templateTrack: decision.templateTrack,
      eligibilityScore: decision.score,
      decisionJson: JSON.stringify(decision.reasons),
      blockerJson: JSON.stringify(decision.blockers),
      claimToken: "",
      claimedAt: "",
      lastError: "",
      createdAt: now,
      updatedAt: now,
    };
    const existingTask = existingTaskByJob.get(job.id);
    if (existingTask) {
      await db.update(applicationAutomationTasks).set(values).where(eq(applicationAutomationTasks.id, existingTask.id));
    } else {
      await db.insert(applicationAutomationTasks).values({ jobId: job.id, ...values }).onConflictDoNothing();
    }
    reviewJobIds.push(job.id);
  }

  return NextResponse.json({
    ok: true,
    mode: config.executionMode,
    batchSize: config.dailyLimit,
    reviewJobIds,
    queuedJobIds: [],
    sourcePool: storedJobs.length,
    todayEligible,
    automationEligible: candidates.length,
    trackedOrSaved,
    screenedOut: Math.max(0, storedJobs.length - candidates.length),
    selectedForReview: reviewJobIds.length,
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
  if (body.action === "approve_batch") {
    const database = await getD1();
    const db = await getDb();
    const config = await getAutomationConfig(database);
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const [allTasks, applicationRows] = await Promise.all([
      db.select().from(applicationAutomationTasks),
      db.select().from(applications),
    ]);
    const reviewTasks = allTasks
      .filter((task) => task.status === "awaiting_user_approval")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id - right.id)
      .slice(0, config.dailyLimit);
    if (!reviewTasks.length) {
      return NextResponse.json({ error: "当前没有等待确认的岗位批次。" }, { status: 409 });
    }

    const { env } = await import("cloudflare:workers");
    const cvConfigured = Boolean(
      String(env.OPENAI_API_KEY ?? "").trim()
      && String(env.CV_GITHUB_TOKEN ?? "").trim(),
    );
    const queuedJobIds: number[] = [];
    const screenedOutJobIds: number[] = [];
    const failedJobIds: number[] = [];

    for (const task of reviewTasks) {
      try {
        const [job] = await db.select().from(jobs).where(eq(jobs.id, task.jobId)).limit(1);
        if (!job) throw new Error("岗位记录不存在");
        const decision = evaluateAutomationCandidate(job, config);
        if (!decision.eligible) {
          await db.update(applicationAutomationTasks).set({
            status: "screened_out",
            stage: "hard_filter_recheck",
            decisionJson: JSON.stringify(decision.reasons),
            blockerJson: JSON.stringify(decision.blockers),
            lastError: decision.blockers.join("; "),
            updatedAt: now,
          }).where(eq(applicationAutomationTasks.id, task.id));
          screenedOutJobIds.push(job.id);
          continue;
        }

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
            nextAction: "已确认整批投递，等待 CV",
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
            nextAction: "已确认整批投递，等待 CV",
            updatedAt: now,
          }).where(eq(applications.id, application.id)).returning();
        }

        await saveJob(database, job.id, now);
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

        await db.update(applicationAutomationTasks).set({
          applicationRowId: application.id,
          status: "awaiting_cv",
          stage: prebuild?.status === "ready" && prebuild.draftPdfKey
            ? "cv_ready_pending_decision"
            : "cv_queued",
          language: selection.language,
          templateTrack: selection.track,
          decisionJson: JSON.stringify(decision.reasons),
          blockerJson: JSON.stringify(decision.blockers),
          lastError: "",
          updatedAt: now,
        }).where(eq(applicationAutomationTasks.id, task.id));
        queuedJobIds.push(job.id);
      } catch (error) {
        failedJobIds.push(task.jobId);
        await db.update(applicationAutomationTasks).set({
          status: "failed_retryable",
          stage: "batch_activation_failed",
          lastError: error instanceof Error ? error.message.slice(0, 500) : "批次启动失败",
          updatedAt: now,
        }).where(eq(applicationAutomationTasks.id, task.id));
      }
    }

    return NextResponse.json({
      ok: true,
      approved: reviewTasks.length,
      queuedJobIds,
      screenedOutJobIds,
      failedJobIds,
    });
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
