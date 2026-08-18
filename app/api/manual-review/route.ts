import { and, eq, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../db";
import { ignoredJobs, jobRequests, jobs, savedJobs } from "../../../db/schema";
import {
  bookmarkFingerprint,
  canonicalizeBookmarkJobUrl,
  inferBookmarkCompany,
  inferBookmarkRegion,
  inferBookmarkSkills,
  inferBookmarkTrack,
} from "../../lib/bookmark-capture";
import {
  makeDistinctStoredJobUrl,
  sameLogicalJob,
} from "../../lib/job-identity";

export const dynamic = "force-dynamic";

function clean(value: unknown, maximum = 50_000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maximum);
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>;
  const id = Number(body.id);
  const action = clean(body.action, 40);
  if (!Number.isInteger(id) || !["approve", "ignore", "delete"].includes(action)) {
    return NextResponse.json({ error: "A valid request id and action are required." }, { status: 400 });
  }

  const db = await getDb();
  const [item] = await db.select().from(jobRequests).where(eq(jobRequests.id, id)).limit(1);
  if (!item) return NextResponse.json({ error: "Verification request not found." }, { status: 404 });

  if (action === "delete") {
    await db.delete(jobRequests).where(eq(jobRequests.id, id));
    return NextResponse.json({ ok: true, action });
  }

  const company = clean(item.company, 300);
  const title = clean(item.title, 500);
  const rawJobUrl = clean(item.jobUrl, 4_000);
  const fingerprint = bookmarkFingerprint(company, title);

  if (action === "ignore") {
    const [existingIgnored] = await db.select().from(ignoredJobs).where(eq(ignoredJobs.fingerprint, fingerprint)).limit(1);
    if (existingIgnored) {
      await db.update(ignoredJobs).set({
        company,
        title,
        jobUrl: rawJobUrl || existingIgnored.jobUrl,
        reason: "核验失败后人工加入黑名单",
      }).where(eq(ignoredJobs.id, existingIgnored.id));
    } else {
      await db.insert(ignoredJobs).values({
        company,
        title,
        jobUrl: rawJobUrl,
        fingerprint,
        reason: "核验失败后人工加入黑名单",
        createdAt: new Date().toISOString(),
      });
    }

    const matchingJobs = await db.select({ id: jobs.id }).from(jobs).where(
      rawJobUrl
        ? or(eq(jobs.jobUrl, rawJobUrl), eq(jobs.canonicalUrl, canonicalizeBookmarkJobUrl(rawJobUrl)), and(eq(jobs.company, company), eq(jobs.title, title)))
        : and(eq(jobs.company, company), eq(jobs.title, title)),
    );
    for (const row of matchingJobs) {
      await db.delete(savedJobs).where(eq(savedJobs.jobId, row.id));
      await db.delete(jobs).where(eq(jobs.id, row.id));
    }
    await db.delete(jobRequests).where(eq(jobRequests.id, id));
    return NextResponse.json({ ok: true, action, removedJobs: matchingJobs.length });
  }

  if (!rawJobUrl) {
    return NextResponse.json({ error: "人工通过前需要补充岗位链接。" }, { status: 400 });
  }

  const canonicalUrl = canonicalizeBookmarkJobUrl(rawJobUrl);
  if (!canonicalUrl) return NextResponse.json({ error: "岗位链接无效。" }, { status: 400 });
  const now = new Date().toISOString();
  const description = clean(item.notes, 50_000);
  const inferredCompany = inferBookmarkCompany(company, canonicalUrl);
  const region = inferBookmarkRegion(canonicalUrl, "", "");
  const track = inferBookmarkTrack(title, description);
  const skills = inferBookmarkSkills(title, description);
  const incomingIdentity = {
    company: inferredCompany,
    title,
    location: "",
    jobUrl: rawJobUrl,
    canonicalUrl,
    applicationId: "",
  };
  const candidates = await db.select().from(jobs).where(
    or(
      eq(jobs.jobUrl, rawJobUrl),
      eq(jobs.jobUrl, canonicalUrl),
      eq(jobs.canonicalUrl, canonicalUrl),
      and(eq(jobs.company, inferredCompany), eq(jobs.title, title)),
    ),
  );
  const existing = candidates.find((row) => sameLogicalJob(row, incomingIdentity));
  const exactUrlCollision = candidates.some((row) => row.jobUrl === rawJobUrl && !sameLogicalJob(row, incomingIdentity));
  const storedJobUrl = existing?.jobUrl
    || (exactUrlCollision ? makeDistinctStoredJobUrl(rawJobUrl, incomingIdentity) : rawJobUrl);

  let jobId: number;
  if (existing) {
    const [updated] = await db.update(jobs).set({
      company: inferredCompany,
      title,
      region,
      track,
      score: Math.max(existing.score, 100),
      visa: region === "中国" ? "不适用" : existing.visa || "JD 未明确",
      evidence: "核验未能自动确认，由你人工检查原 JD 后直接通过。",
      description: description || existing.description,
      skills: skills.length ? JSON.stringify(skills) : existing.skills,
      jobUrl: existing.jobUrl,
      canonicalUrl,
      source: "核验队列人工通过",
      status: "开放",
      lastSeenAt: now,
      checkedAt: now,
      missedScanCount: 0,
      expirationReason: "",
    }).where(eq(jobs.id, existing.id)).returning();
    jobId = updated.id;
  } else {
    const [inserted] = await db.insert(jobs).values({
      company: inferredCompany,
      title,
      location: "",
      region,
      track,
      score: 100,
      visa: region === "中国" ? "不适用" : "JD 未明确",
      evidence: "核验未能自动确认，由你人工检查原 JD 后直接通过。",
      description,
      skills: JSON.stringify(skills),
      jobUrl: storedJobUrl,
      canonicalUrl,
      applicationId: "",
      source: "核验队列人工通过",
      status: "开放",
      deadline: "",
      deadlineType: "unknown",
      lastSeenAt: now,
      discoveredAt: now,
      checkedAt: now,
    }).returning();
    jobId = inserted.id;
  }

  await db.delete(ignoredJobs).where(eq(ignoredJobs.fingerprint, fingerprint));
  await db.delete(jobRequests).where(eq(jobRequests.id, id));
  return NextResponse.json({ ok: true, action, jobId });
}
