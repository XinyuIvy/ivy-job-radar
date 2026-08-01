import { eq, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../../db";
import { ignoredJobs, jobs, scanStatus } from "../../../../db/schema";

export const dynamic = "force-dynamic";

type ImportJob = {
  company?: unknown;
  title?: unknown;
  location?: unknown;
  region?: unknown;
  track?: unknown;
  score?: unknown;
  visa?: unknown;
  evidence?: unknown;
  description?: unknown;
  skills?: unknown;
  job_url?: unknown;
  original_job_url?: unknown;
  official_url?: unknown;
  canonical_url?: unknown;
  application_id?: unknown;
  source?: unknown;
  status?: unknown;
  discovered_at?: unknown;
  checked_at?: unknown;
};

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function fingerprint(company: string, title: string) {
  return `${normalize(company)}::${normalize(title)}`;
}

function isExcludedTitle(title: string) {
  return /\b(?:senior|principal|staff|manager|director|lead)\b/i.test(title)
    || /\bsr\.?(?:\s|$)/i.test(title)
    || /\bvice president\b|\bhead of\b|\bexperienced hire\b/i.test(title)
    || /\bresearch scientist\s+(?:iii|iv|v|[3-9])\b/i.test(title);
}

function canonicalizeJobUrl(raw: string) {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    [
      "gh_jid", "gh_src", "source", "src", "ref", "referrer",
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    ].forEach((key) => url.searchParams.delete(key));
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return raw.trim();
  }
}

export async function POST(request: NextRequest) {
  const { env } = await import("cloudflare:workers");
  const configuredToken = cleanText(env.IVY_JOB_RADAR_SYNC_TOKEN);
  const authorization = request.headers.get("authorization") ?? "";
  const providedToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!configuredToken || providedToken !== configuredToken) {
    return NextResponse.json({ error: "Unauthorized import request." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }

  if (!Array.isArray(payload)) {
    return NextResponse.json({ error: "The request body must be a job array." }, { status: 400 });
  }
  if (payload.length > 500) {
    return NextResponse.json({ error: "A single import cannot exceed 500 jobs." }, { status: 413 });
  }

  const db = await getDb();
  const ignored = new Set((await db.select().from(ignoredJobs)).map((row) => row.fingerprint));
  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const importedSources = new Set<string>();

  for (const raw of payload as ImportJob[]) {
    const company = cleanText(raw.company);
    const title = cleanText(raw.title);
    const originalJobUrl = cleanText(raw.original_job_url);
    const officialUrl = cleanText(raw.official_url);
    const jobUrl = officialUrl || cleanText(raw.job_url);
    const region = cleanText(raw.region) || "美国";
    const score = Math.max(0, Math.min(100, Number(raw.score ?? 0)));
    const visa = cleanText(raw.visa) || "JD 未明确";
    const incomingStatus = cleanText(raw.status) || "待官网核验";

    // Recheck hard filters at the website boundary.
    if (
      !company ||
      !title ||
      !jobUrl ||
      !["美国", "中国"].includes(region) ||
      score < 55 ||
      isExcludedTitle(title) ||
      ignored.has(fingerprint(company, title))
    ) {
      skipped += 1;
      continue;
    }

    const canonicalUrl = cleanText(raw.canonical_url) || canonicalizeJobUrl(jobUrl);
    const applicationId = cleanText(raw.application_id);
    const [existing] = await db
      .select({ id: jobs.id, discoveredAt: jobs.discoveredAt })
      .from(jobs)
      .where(
        or(
          eq(jobs.jobUrl, jobUrl),
          originalJobUrl ? eq(jobs.jobUrl, originalJobUrl) : eq(jobs.jobUrl, jobUrl),
          eq(jobs.canonicalUrl, canonicalUrl),
          applicationId ? eq(jobs.applicationId, applicationId) : eq(jobs.jobUrl, jobUrl),
        ),
      )
      .limit(1);

    const skills = Array.isArray(raw.skills)
      ? raw.skills.map(cleanText).filter(Boolean).slice(0, 12)
      : cleanText(raw.skills).split("|").map((item) => item.trim()).filter(Boolean).slice(0, 12);
    const values = {
      company,
      title,
      location: cleanText(raw.location),
      region,
      track: cleanText(raw.track) || "Technology",
      score,
      visa,
      evidence: cleanText(raw.evidence),
      description: cleanText(raw.description).slice(0, 50000),
      skills: JSON.stringify(skills),
      jobUrl,
      canonicalUrl,
      applicationId,
      source: cleanText(raw.source) || "JobSpy",
      status: region === "美国" && visa === "明确不支持" && incomingStatus === "开放"
        ? "不合格"
        : incomingStatus,
      discoveredAt: existing?.discoveredAt || cleanText(raw.discovered_at) || now,
      checkedAt: cleanText(raw.checked_at) || now,
    };
    importedSources.add(values.source);

    if (existing) {
      await db.update(jobs).set(values).where(eq(jobs.id, existing.id));
      updated += 1;
    } else {
      await db.insert(jobs).values(values);
      created += 1;
    }
  }

  const totalJobs = (await db.select({ id: jobs.id }).from(jobs)).length;
  const sourceSummary = Array.from(importedSources).join("、") || "外部采集器";
  await db.insert(scanStatus).values({
    id: 1,
    state: "completed",
    created,
    updated,
    skipped,
    totalJobs,
    completedAt: now,
    message: created > 0
      ? `${sourceSummary} 已完成同步，本轮新增 ${created} 个岗位。`
      : `${sourceSummary} 已完成同步，本轮没有新增岗位。`,
  }).onConflictDoUpdate({
    target: scanStatus.id,
    set: {
      state: "completed",
      created,
      updated,
      skipped,
      totalJobs,
      completedAt: now,
      message: created > 0
        ? `${sourceSummary} 已完成同步，本轮新增 ${created} 个岗位。`
        : `${sourceSummary} 已完成同步，本轮没有新增岗位。`,
    },
  });

  return NextResponse.json({
    ok: true,
    received: payload.length,
    created,
    updated,
    skipped,
    importedAt: now,
  });
}
