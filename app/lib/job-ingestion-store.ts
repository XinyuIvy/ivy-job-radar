import { and, eq, or } from "drizzle-orm";
import { getDb } from "../../db";
import { applications, ignoredJobs, jobs, savedJobs } from "../../db/schema";
import { isChinaCompanyIdentity, sameCompanyIdentity } from "./company-identity";
import { makeDistinctStoredJobUrl, sameLogicalJob } from "./job-identity";
import { getApprovedScreeningRules } from "./screening-learning-store";
import { mergeStoredIngestionJob } from "./job-ingestion";
import type { IngestionContext, NormalizedJob, StoredIngestionJob } from "./job-ingestion";

export async function createJobIngestionContext(now = new Date().toISOString()): Promise<IngestionContext> {
  const db = await getDb();
  const [ignored, rules] = await Promise.all([
    db.select().from(ignoredJobs), getApprovedScreeningRules(),
  ]);
  let reviewed: Promise<string[]> | undefined;
  const reviewedCompanies = () => reviewed ??= Promise.all([
    db.select().from(applications), db.select().from(savedJobs), db.select().from(jobs),
  ]).then(([applicationRows, savedRows, storedRows]) => {
    const savedIds = new Set(savedRows.map(row => row.jobId));
    return [
      ...applicationRows.filter(row => ["准备材料", "已申请", "一面", "二面/技术面", "终面", "Offer"].includes(row.status)).map(row => row.company),
      ...storedRows.filter(row => savedIds.has(row.id)).map(row => row.company),
    ];
  });
  return {
    now, rules, ignored: new Set(ignored.map(row => row.fingerprint)),
    store: {
      companyBlocked: async company => isChinaCompanyIdentity(company)
        && (await reviewedCompanies()).some(value => sameCompanyIdentity(value, company)),
      async find(job) {
        return await db.select().from(jobs).where(or(
          eq(jobs.jobUrl, job.jobUrl), eq(jobs.canonicalUrl, job.canonicalUrl),
          job.applicationId ? eq(jobs.applicationId, job.applicationId) : eq(jobs.jobUrl, job.jobUrl),
          job.originalJobUrl ? eq(jobs.jobUrl, job.originalJobUrl) : eq(jobs.jobUrl, job.jobUrl),
          and(eq(jobs.company, job.company), eq(jobs.title, job.title)),
        )) as StoredIngestionJob[];
      },
      async write(job: NormalizedJob, existing, candidates = []) {
        const { originalJobUrl: _originalJobUrl, ...values } = job;
        const collision = candidates.some(row => row.jobUrl === job.jobUrl && !sameLogicalJob(row, job));
        values.jobUrl = existing?.jobUrl || (collision ? makeDistinctStoredJobUrl(job.jobUrl, job) : job.jobUrl);
        if (!existing) { await db.insert(jobs).values(values); return; }
        const { originalJobUrl: _original, ...merged } = mergeStoredIngestionJob({ ...job, jobUrl: values.jobUrl }, existing);
        await db.update(jobs).set(merged).where(eq(jobs.id, existing.id));
      },
    },
  };
}
