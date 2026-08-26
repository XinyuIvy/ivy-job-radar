import { eq } from "drizzle-orm";

import { getD1, getDb } from "../../db";
import { applications, jobs } from "../../db/schema";
import { evaluateAutomationCandidate } from "./application-automation";
import {
  getAutomationConfig,
  listAutomationTasks,
  reconcileAutomationTasks,
  updateAutomationTask,
} from "./application-automation-store";
import type { CvPrebuildArtifactBucket } from "./cv-prebuild-artifacts";
import { reconcileCvPrebuildRun } from "./cv-prebuild-runtime";
import { getLatestCvPrebuildJob } from "./cv-prebuild-store";

export async function reconcileCvForAutomation() {
  const database = await getD1();
  const db = await getDb();
  const config = await getAutomationConfig(database);
  let tasks = await listAutomationTasks(database, 200);
  const now = new Date().toISOString();

  // Re-check unclaimed tasks against the current hard filters. This prevents a
  // stale or incorrectly classified job from reaching the browser executor.
  for (const task of tasks.filter((row) => ["awaiting_cv", "ready_for_browser"].includes(row.status))) {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, task.jobId)).limit(1);
    if (!job) continue;
    const decision = evaluateAutomationCandidate(job, config);
    if (decision.eligible) continue;
    await updateAutomationTask(database, task.id, {
      status: "screened_out",
      stage: "hard_filter_recheck",
      error: decision.blockers.join("; "),
      now,
    });
    await database.prepare(`
      UPDATE application_automation_tasks
      SET decision_json = ?, blocker_json = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      JSON.stringify(decision.reasons),
      JSON.stringify(decision.blockers),
      now,
      task.id,
    ).run();
    if (task.applicationRowId) {
      await db.update(applications).set({
        status: "收藏",
        nextAction: "自动筛选发现硬性条件不匹配",
        updatedAt: now,
      }).where(eq(applications.id, task.applicationRowId));
    }
  }

  tasks = await listAutomationTasks(database, 200);
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

  tasks = await listAutomationTasks(database, 200);
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
