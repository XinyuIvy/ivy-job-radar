import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "../../../db";
import { jobs } from "../../../db/schema";
import { requireChatGPTUser } from "../../chatgpt-auth";

function deadlineLabel(deadline: string, type: string) {
  if (type === "rolling") return "滚动招聘，建议尽早申请";
  return deadline || "JD 未公布";
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId: rawJobId } = await params;
  await requireChatGPTUser(`/jobs/${encodeURIComponent(rawJobId)}`);
  const jobId = Number(rawJobId);
  if (!Number.isSafeInteger(jobId) || jobId <= 0) notFound();

  const db = await getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) notFound();
  const skills = JSON.parse(job.skills || "[]") as string[];

  return (
    <main className="detail-shell">
      <nav className="detail-nav"><Link href="/">← 返回岗位雷达</Link><a href={job.jobUrl} target="_blank" rel="noreferrer">打开原始 JD ↗</a></nav>
      <header className="detail-header">
        <div><p className="eyebrow">JOB DETAIL</p><h1>{job.title}</h1><p>{job.company} · {job.location || job.region}</p></div>
        <span className="priority">{job.score} · {job.status}</span>
      </header>
      <section className="detail-grid" aria-label="岗位信息">
        <article><span>赛道</span><strong>{job.track}</strong></article>
        <article><span>地区</span><strong>{job.region}</strong></article>
        <article><span>申请截止</span><strong>{deadlineLabel(job.deadline, job.deadlineType)}</strong></article>
        <article><span>工作授权</span><strong>{job.visa}</strong></article>
        <article><span>来源</span><strong>{job.source}</strong></article>
        <article><span>Application ID</span><strong>{job.applicationId || "未提供"}</strong></article>
      </section>
      {skills.length > 0 && <section className="detail-section"><h2>技能关键词</h2><div className="skills">{skills.map((skill) => <span key={skill}>{skill}</span>)}</div></section>}
      <section className="detail-section"><h2>岗位核验摘要</h2><p>{job.evidence || "暂无核验摘要。"}</p></section>
      <section className="detail-section"><h2>完整 Job Description</h2><p className="detail-long-text">{job.description || "尚未采集到完整 JD。"}</p></section>
    </main>
  );
}
