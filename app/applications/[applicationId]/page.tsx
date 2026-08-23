import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getD1, getDb } from "../../../db";
import { applications, jobs } from "../../../db/schema";
import { requireChatGPTUser } from "../../chatgpt-auth";
import { cvPrebuildStatusView } from "../../lib/cv-prebuild-status";
import { getLatestCvPrebuildJob } from "../../lib/cv-prebuild-store";
import { sameLogicalJob } from "../../lib/job-identity";

function displayDate(value: string) {
  return value || "未设置";
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId: rawApplicationId } = await params;
  await requireChatGPTUser(`/applications/${encodeURIComponent(rawApplicationId)}`);
  const applicationId = Number(rawApplicationId);
  if (!Number.isSafeInteger(applicationId) || applicationId <= 0) notFound();

  const db = await getDb();
  const [application] = await db.select().from(applications).where(eq(applications.id, applicationId)).limit(1);
  if (!application) notFound();
  const jobRows = await db.select().from(jobs);
  const linkedJob = jobRows.find((job) => sameLogicalJob(application, job));
  const cvTask = linkedJob ? await getLatestCvPrebuildJob(await getD1(), linkedJob.id) : null;
  const cvStatus = cvPrebuildStatusView(cvTask?.status);

  return (
    <main className="detail-shell">
      <nav className="detail-nav"><Link href="/">← 返回岗位雷达</Link>{application.jobUrl && <a href={application.jobUrl} target="_blank" rel="noreferrer">打开原始 JD ↗</a>}</nav>
      <header className="detail-header">
        <div><p className="eyebrow">APPLICATION DETAIL</p><h1>{application.title}</h1><p>{application.company} · {application.location || application.region}</p></div>
        <span className="priority">{application.priority} · {application.status}</span>
      </header>
      <div className="detail-primary-actions">
        {linkedJob && cvTask && <a className="primary" href={`/cv-prebuild/${linkedJob.id}`}>{cvTask.status === "ready" ? "打开 CV Chat" : "查看 CV 进度"}</a>}
        <a href={`/cv-tailor?applicationId=${application.id}`}>手动定制 CV</a>
      </div>
      <section className="detail-grid" aria-label="申请信息">
        <article><span>CV 自动化</span><strong>{cvStatus?.label || "等待建立任务"}</strong></article>
        <article><span>匹配度</span><strong>{application.fit}/5</strong></article>
        <article><span>兴趣度</span><strong>{application.interest}/5</strong></article>
        <article><span>申请截止</span><strong>{displayDate(application.deadline)}</strong></article>
        <article><span>计划申请</span><strong>{displayDate(application.plannedApplicationDate)}</strong></article>
        <article><span>已申请日期</span><strong>{displayDate(application.appliedDate)}</strong></article>
        <article><span>下一步</span><strong>{application.nextAction || "未设置"}</strong></article>
        <article><span>Application ID</span><strong>{application.applicationId || "未提供"}</strong></article>
      </section>
      <section className="detail-section"><h2>工作授权</h2><p>{application.workAuthorization || "未填写"}</p></section>
      <section className="detail-section"><h2>申请记录</h2><p className="detail-long-text">{application.notes || "暂无记录。"}</p></section>
      {linkedJob?.description && <section className="detail-section"><h2>完整 Job Description</h2><p className="detail-long-text">{linkedJob.description}</p></section>}
      {cvTask?.lastError && <section className="detail-section detail-error"><h2>CV 任务说明</h2><p>{cvTask.lastError}</p></section>}
    </main>
  );
}
