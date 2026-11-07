import { and, desc, eq, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../db";
import { applications, cvPrebuildJobs, ignoredJobs, jobs, savedJobs, scanStatus } from "../../../db/schema";
import manualJobAdditions from "../../manual-job-additions.json";
import manualJobStatusCorrections from "../../manual-job-status-corrections.json";
import { ashbyBoards, greenhouseBoards, iCimsBoards, leverBoards, paylocityBoards, workdayBoards } from "../../lib/company-sources";
import { repairBookmarkCompany } from "../../lib/bookmark-capture";
import { isChinaCompanyIdentity, sameCompanyIdentity } from "../../lib/company-identity";
import { extractCoreJobDescription } from "../../lib/job-description";
import { extractDeadline } from "../../lib/data-quality";
import { activeJobStatuses, deadlineHasPassed, verifyPosting } from "../../lib/job-expiration";
import { hardJobExclusionReasons } from "../../lib/job-hard-exclusions";
import { sameDisplayedJob } from "../../lib/job-display-identity";
import { scoreStoredJob } from "../../lib/job-scoring";
import { inferCvTemplateLanguage, isCvTemplateFilename } from "../../lib/cv-template-catalog";
import { evaluateTodayShortlistCandidate, isSpreadsheetApprovedCandidate } from "../../lib/job-shortlist";
import {
  canonicalizeJobIdentityUrl,
  extractStableJobId,
  isPlaceholderJobTitle,
  makeDistinctStoredJobUrl,
  normalizeJobIdentityText,
  normalizeJobLocation,
  sameCompanyRole,
  sameLogicalJob,
} from "../../lib/job-identity";

import { ingestJobs, type IngestionContext } from "../../lib/job-ingestion";
import { createJobIngestionContext } from "../../lib/job-ingestion-store";

export const dynamic = "force-dynamic";

async function ensureManualJobAdditions(db: Awaited<ReturnType<typeof getDb>>) {
  const storedRows = await db.select().from(jobs);
  const existingByUrl = new Map(storedRows.map((row) => [row.jobUrl, row]));
  const writes: Promise<unknown>[] = [];
  for (const row of manualJobAdditions) {
    const values = {
      ...row,
      skills: JSON.stringify(row.skills),
      lastSeenAt: row.checkedAt,
      missedScanCount: 0,
      expirationReason: "",
    };
    const existing = existingByUrl.get(row.jobUrl);
    if (!existing) {
      writes.push(db.insert(jobs).values(values));
      continue;
    }
    const terminalStatus = new Set(["已关闭", "已过期", "忽略", "不适配", "重复归档", "旧年份归档"]);
    const nextStatus = terminalStatus.has(existing.status) ? existing.status : row.status;
    const nextExpirationReason = terminalStatus.has(existing.status) ? existing.expirationReason : "";
    const nextDiscoveredAt = existing.discoveredAt || row.discoveredAt;
    const alreadyCurrent = existing.company === values.company
      && existing.title === values.title
      && existing.location === values.location
      && existing.source === values.source
      && existing.score === values.score
      && existing.description === values.description
      && existing.evidence === values.evidence
      && existing.status === nextStatus
      && existing.checkedAt === values.checkedAt
      && existing.expirationReason === nextExpirationReason
      && existing.discoveredAt === nextDiscoveredAt;
    if (alreadyCurrent) continue;
    writes.push(db.update(jobs).set({
      ...values,
      status: nextStatus,
      expirationReason: nextExpirationReason,
      discoveredAt: nextDiscoveredAt,
    }).where(eq(jobs.id, existing.id)));
  }
  await Promise.all(writes);
}

async function ensureManualJobStatusCorrections(db: Awaited<ReturnType<typeof getDb>>) {
  const storedRows = await db.select({
    id: jobs.id,
    jobUrl: jobs.jobUrl,
    status: jobs.status,
    expirationReason: jobs.expirationReason,
    checkedAt: jobs.checkedAt,
  }).from(jobs);
  const existingByUrl = new Map(storedRows.map((row) => [row.jobUrl, row]));
  const writes: Promise<unknown>[] = [];
  for (const correction of manualJobStatusCorrections) {
    const existing = existingByUrl.get(correction.jobUrl);
    if (!existing) continue;
    if (
      existing.status === correction.status
      && existing.expirationReason === correction.expirationReason
      && existing.checkedAt === correction.checkedAt
    ) continue;
    writes.push(db.update(jobs).set({
      status: correction.status,
      expirationReason: correction.expirationReason,
      checkedAt: correction.checkedAt,
    }).where(eq(jobs.id, existing.id)));
  }
  await Promise.all(writes);
}

async function reconcileExpiration(sources: SourceStats[], now: string) {
  const db = await getDb();
  const activeRows = (await db.select().from(jobs)).filter((row) => activeJobStatuses.has(row.status));

  for (const row of activeRows) {
    if (!deadlineHasPassed(row.deadline, row.deadlineType, now)) continue;
    await db.update(jobs).set({
      status: "已过期",
      expirationReason: `申请截止日期 ${row.deadline} 已过`,
    }).where(eq(jobs.id, row.id));
  }

  for (const source of sources) {
    // A failed or partial source scan must never count as evidence that a job disappeared.
    if (source.boards === 0 || source.succeeded !== source.boards) continue;
    const missing = activeRows.filter((row) =>
      !deadlineHasPassed(row.deadline, row.deadlineType, now)
      && row.source.toLowerCase().startsWith(source.source.toLowerCase())
      && row.checkedAt !== now,
    );
    for (const row of missing) {
      const misses = row.missedScanCount + 1;
      const verification = await verifyPosting(row.jobUrl, row.title);
      if (verification.state === "expired") {
        await db.update(jobs).set({
          status: "已过期",
          missedScanCount: misses,
          expirationReason: verification.reason,
        }).where(eq(jobs.id, row.id));
        continue;
      }
      if (misses < 2) {
        if (verification.state === "open") {
          await db.update(jobs).set({
            status: "开放",
            description: verification.description,
            canonicalUrl: verification.canonicalUrl,
            missedScanCount: 0,
            expirationReason: "",
            checkedAt: now,
          }).where(eq(jobs.id, row.id));
          continue;
        }
        await db.update(jobs).set({
          missedScanCount: misses,
          expirationReason: verification.state === "unknown" ? verification.reason : "",
        }).where(eq(jobs.id, row.id));
        continue;
      }

      await db.update(jobs).set({
        status: "疑似过期",
        missedScanCount: misses,
        expirationReason: "连续两次完整来源扫描未发现该岗位，正在直接核验",
      }).where(eq(jobs.id, row.id));
      if (verification.state === "open") {
        await db.update(jobs).set({
          status: "开放",
          description: verification.description,
          canonicalUrl: verification.canonicalUrl,
          missedScanCount: 0,
          expirationReason: "",
          checkedAt: now,
        }).where(eq(jobs.id, row.id));
      } else {
        await db.update(jobs).set({ expirationReason: verification.reason }).where(eq(jobs.id, row.id));
      }
    }
  }
}

// Tenant-specific ATS endpoints. Add a company here after its official careers
// URL has been verified; the adapters keep the parsing logic shared.
const bambooHrBoards: ReadonlyArray<readonly [string, string]> = [];

const wantedTitles = [
  "data scientist", "applied scientist", "research scientist", "decision scientist",
  "machine learning scientist", "quantitative researcher", "quantitative analyst",
  "statistical scientist", "biostatistician", "epidemiologist", "health economics",
  "outcomes research", "algorithm validation", "imaging scientist", "clinical data scientist",
  "rwe scientist", "real world evidence", "healthcare consultant", "life sciences consultant",
  "数据科学家", "数据科学", "应用科学家", "研究科学家", "算法科学家", "决策科学家",
  "算法研究员", "创新算法", "科学计算", "计算科学家", "计算生物", "ai for science",
  "生物统计", "统计科学家", "临床统计", "医学统计", "统计师", "流行病学",
  "真实世界研究", "真实世界证据", "卫生经济", "健康经济", "结局研究",
  "量化研究", "定量研究", "量化分析", "医学影像", "影像科学家",
  "医疗咨询", "医药咨询", "生命科学咨询",
];

const workdaySearchTerms = [
  "data scientist", "statistic", "biostat", "quantitative", "epidemiology",
  "health economics", "outcomes research", "生物统计", "数据科学", "统计", "量化研究",
];

function stripHtml(html: string) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function fingerprint(company: string, title: string) {
  return `${normalize(company)}::${normalize(title)}`;
}

function canonicalizeJobUrl(raw: string) {
  return canonicalizeJobIdentityUrl(raw);
}

function extractApplicationId(rawUrl: string, supplied?: unknown) {
  const explicit = String(supplied ?? "").trim();
  if (explicit) return explicit;
  try {
    const url = new URL(rawUrl);
    const ghId = url.searchParams.get("gh_jid");
    if (ghId) return ghId;
    const leverId = url.pathname.match(/\/([0-9a-f]{8}-[0-9a-f-]{27,})\/?$/i)?.[1];
    if (leverId) return leverId;
    const amazonId = url.pathname.match(/\/jobs\/(\d+)\//i)?.[1];
    if (amazonId) return amazonId;
    const ashbyId = url.pathname.match(/\/([0-9a-f]{8}-[0-9a-f-]{27,})(?:\/|$)/i)?.[1];
    return ashbyId ?? "";
  } catch {
    return "";
  }
}

type CandidateJob = {
  company: string;
  title: string;
  location: string;
  content: string;
  jobUrl: string;
  applicationId: string;
  source: string;
};

type SourceStats = {
  source: string;
  boards: number;
  succeeded: number;
  scanned: number;
  matched: number;
  failedBoards: string[];
  matchedJobs: string[];
};

async function saveCandidate(candidate: CandidateJob, context: IngestionContext, now: string) {
  const result = await ingestJobs([{
    provider: "ats",
    raw: candidate,
    context: { source: candidate.source, status: "开放", collectedAt: now },
  }], context);
  return result.created + result.updated > 0;
}

async function scanGreenhouse(context: IngestionContext, now: string): Promise<SourceStats> {
  const stats: SourceStats = {
    source: "Greenhouse",
    boards: greenhouseBoards.length,
    succeeded: 0,
    scanned: 0,
    matched: 0,
    failedBoards: [],
    matchedJobs: [],
  };
  for (const [company, token] of greenhouseBoards) {
    try {
      const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`, {
        headers: { Accept: "application/json", "User-Agent": "IvyJobRadar/1.0" },
      });
      if (!response.ok) {
        stats.failedBoards.push(company);
        continue;
      }
      stats.succeeded += 1;
      const payload = await response.json() as { jobs?: Array<Record<string, unknown>> };
      for (const raw of payload.jobs ?? []) {
        stats.scanned += 1;
        const jobUrl = String(raw.absolute_url ?? "");
        if (await saveCandidate({
          company,
          title: String(raw.title ?? "").trim(),
          location: String((raw.location as { name?: string } | undefined)?.name ?? ""),
          content: stripHtml(String(raw.content ?? "")),
          jobUrl,
          applicationId: extractApplicationId(jobUrl, raw.id),
          source: "Greenhouse · 公司官方招聘系统",
        }, context, now)) {
          stats.matched += 1;
          stats.matchedJobs.push(`${company} · ${String(raw.title ?? "").trim()}`);
        }
      }
    } catch {
      stats.failedBoards.push(company);
    }
  }
  return stats;
}

async function scanLever(context: IngestionContext, now: string): Promise<SourceStats> {
  const stats: SourceStats = {
    source: "Lever",
    boards: leverBoards.length,
    succeeded: 0,
    scanned: 0,
    matched: 0,
    failedBoards: [],
    matchedJobs: [],
  };
  for (const [company, token, instance] of leverBoards) {
    const host = instance === "eu" ? "api.eu.lever.co" : "api.lever.co";
    try {
      const response = await fetch(`https://${host}/v0/postings/${token}?mode=json`, {
        headers: { Accept: "application/json", "User-Agent": "IvyJobRadar/1.0" },
      });
      if (!response.ok) {
        stats.failedBoards.push(company);
        continue;
      }
      stats.succeeded += 1;
      const payload = await response.json() as Array<Record<string, unknown>>;
      for (const raw of payload) {
        stats.scanned += 1;
        const categories = raw.categories as Record<string, unknown> | undefined;
        const jobUrl = String(raw.hostedUrl ?? "");
        if (await saveCandidate({
          company,
          title: String(raw.text ?? "").trim(),
          location: String(categories?.location ?? ""),
          content: [
            raw.descriptionPlain, raw.additionalPlain, raw.openingPlain,
          ].map((value) => String(value ?? "")).join(" "),
          jobUrl,
          applicationId: extractApplicationId(jobUrl, raw.id),
          source: "Lever · 公司官方招聘系统",
        }, context, now)) {
          stats.matched += 1;
          stats.matchedJobs.push(`${company} · ${String(raw.text ?? "").trim()}`);
        }
      }
    } catch {
      stats.failedBoards.push(company);
    }
  }
  return stats;
}

async function scanAshby(context: IngestionContext, now: string): Promise<SourceStats> {
  const stats: SourceStats = {
    source: "Ashby",
    boards: ashbyBoards.length,
    succeeded: 0,
    scanned: 0,
    matched: 0,
    failedBoards: [],
    matchedJobs: [],
  };
  for (const [company, token] of ashbyBoards) {
    try {
      const response = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}`, {
        headers: { Accept: "application/json", "User-Agent": "IvyJobRadar/1.0" },
      });
      if (!response.ok) {
        stats.failedBoards.push(company);
        continue;
      }
      stats.succeeded += 1;
      const payload = await response.json() as { jobs?: Array<Record<string, unknown>> };
      for (const raw of payload.jobs ?? []) {
        if (raw.isListed === false) continue;
        stats.scanned += 1;
        const jobUrl = String(raw.jobUrl ?? raw.applyUrl ?? "");
        if (await saveCandidate({
          company,
          title: String(raw.title ?? "").trim(),
          location: String(raw.location ?? ""),
          content: String(raw.descriptionPlain ?? stripHtml(String(raw.descriptionHtml ?? ""))),
          jobUrl,
          applicationId: extractApplicationId(jobUrl),
          source: "Ashby · 公司官方招聘系统",
        }, context, now)) {
          stats.matched += 1;
          stats.matchedJobs.push(`${company} · ${String(raw.title ?? "").trim()}`);
        }
      }
    } catch {
      stats.failedBoards.push(company);
    }
  }
  return stats;
}

function extractLinks(html: string, baseUrl: string, pattern: RegExp) {
  const links = new Set<string>();
  for (const match of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const absolute = new URL(match[1], baseUrl).toString();
      if (pattern.test(absolute)) links.add(absolute);
    } catch {
      // Ignore malformed third-party links.
    }
  }
  return [...links];
}

function htmlTitle(html: string) {
  const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return stripHtml(heading ?? title ?? "").replace(/\s+\|\s+.*$/, "").trim();
}

async function scanHtmlAts(
  source: string,
  boards: ReadonlyArray<readonly [string, string]>,
  linkPattern: RegExp,
  context: IngestionContext,
  now: string,
): Promise<SourceStats> {
  const stats: SourceStats = {
    source,
    boards: boards.length,
    succeeded: 0,
    scanned: 0,
    matched: 0,
    failedBoards: [],
    matchedJobs: [],
  };
  for (const [company, boardUrl] of boards) {
    try {
      const response = await fetch(boardUrl, {
        headers: { Accept: "text/html", "User-Agent": "IvyJobRadar/1.0" },
      });
      if (!response.ok) {
        stats.failedBoards.push(company);
        continue;
      }
      stats.succeeded += 1;
      const listingHtml = await response.text();
      const detailLinks = extractLinks(listingHtml, boardUrl, linkPattern).slice(0, 80);
      for (const jobUrl of detailLinks) {
        try {
          const detailResponse = await fetch(jobUrl, {
            headers: { Accept: "text/html", "User-Agent": "IvyJobRadar/1.0" },
          });
          if (!detailResponse.ok) continue;
          const detailHtml = await detailResponse.text();
          const content = stripHtml(detailHtml);
          const title = htmlTitle(detailHtml);
          stats.scanned += 1;
          if (await saveCandidate({
            company,
            title,
            location: content.match(/(?:Location|Location : Name)\s*[:\-]?\s*([^|]{2,80})/i)?.[1]?.trim() ?? "",
            content,
            jobUrl,
            applicationId: extractApplicationId(jobUrl),
            source: `${source} · 公司官方招聘系统`,
          }, context, now)) {
            stats.matched += 1;
            stats.matchedJobs.push(`${company} · ${title}`);
          }
        } catch {
          // One malformed posting must not fail the whole tenant.
        }
      }
    } catch {
      stats.failedBoards.push(company);
    }
  }
  return stats;
}

async function scanWorkday(context: IngestionContext, now: string): Promise<SourceStats> {
  const stats: SourceStats = {
    source: "Workday",
    boards: workdayBoards.length,
    succeeded: 0,
    scanned: 0,
    matched: 0,
    failedBoards: [],
    matchedJobs: [],
  };
  for (const [company, host, tenant, site] of workdayBoards) {
    try {
      const endpoint = `${host}/wday/cxs/${tenant}/${site}/jobs`;
      const postings = new Map<string, { title?: string; externalPath?: string; locationsText?: string }>();
      for (const searchText of workdaySearchTerms) {
        for (let offset = 0; offset < 1000; offset += 100) {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "IvyJobRadar/1.0" },
            body: JSON.stringify({ appliedFacets: {}, limit: 100, offset, searchText }),
          });
          if (!response.ok) throw new Error(`Workday listing request failed: ${response.status}`);
          const payload = await response.json() as {
            total?: number;
            jobPostings?: Array<{ title?: string; externalPath?: string; locationsText?: string }>;
          };
          const page = payload.jobPostings ?? [];
          for (const posting of page) {
            const path = String(posting.externalPath ?? "");
            if (path) postings.set(path, posting);
          }
          if (page.length < 100 || offset + 100 >= Number(payload.total ?? 0)) break;
        }
      }
      stats.succeeded += 1;
      for (const posting of postings.values()) {
        stats.scanned += 1;
        const title = String(posting.title ?? "").trim();
        const externalPath = String(posting.externalPath ?? "");
        if (!title || !externalPath) continue;
        const detailResponse = await fetch(`${host}/wday/cxs/${tenant}/${site}${externalPath}`, {
          headers: { Accept: "application/json", "User-Agent": "IvyJobRadar/1.0" },
        });
        if (!detailResponse.ok) continue;
        const detail = await detailResponse.json() as { jobPostingInfo?: Record<string, unknown> };
        const info = detail.jobPostingInfo ?? {};
        const jobUrl = `${host}/en-US/${site}${externalPath}`;
        const content = stripHtml(String(info.jobDescription ?? ""));
        if (await saveCandidate({
          company,
          title,
          location: String(posting.locationsText ?? info.location ?? ""),
          content,
          jobUrl,
          applicationId: String(info.jobReqId ?? extractApplicationId(jobUrl)),
          source: "Workday · 公司官方招聘系统",
        }, context, now)) {
          stats.matched += 1;
          stats.matchedJobs.push(`${company} · ${title}`);
        }
      }
    } catch {
      stats.failedBoards.push(company);
    }
  }
  return stats;
}

async function refreshOfficialBoards() {
  const db = await getDb();
  const now = new Date().toISOString();
  const context = await createJobIngestionContext(now);
  const sources = await Promise.all([
    scanGreenhouse(context, now),
    scanLever(context, now),
    scanAshby(context, now),
    scanHtmlAts("BambooHR", bambooHrBoards, /\/careers\/\d+|\/careers\/.*\/job\//i, context, now),
    scanHtmlAts("iCIMS", iCimsBoards, /\.icims\.com\/jobs\/\d+\/[^/?#]+\/job/i, context, now),
    scanHtmlAts("Paylocity", paylocityBoards, /recruiting\.paylocity\.com\/recruiting\/jobs\/Details\/\d+\//i, context, now),
    scanWorkday(context, now),
  ]);
  await reconcileExpiration(sources, now);
  return {
    scanned: sources.reduce((sum, item) => sum + item.scanned, 0),
    matched: sources.reduce((sum, item) => sum + item.matched, 0),
    verifiedAt: now,
    sources,
  };
}

async function refreshStoredOfficialJds(limit = 24) {
  const db = await getDb();
  const rows = (await db.select().from(jobs).orderBy(desc(jobs.checkedAt), desc(jobs.score)))
    .filter((row) => activeJobStatuses.has(row.status))
    .filter((row) => extractCoreJobDescription(row.description).text.length < 300)
    .filter((row) => hardJobExclusionReasons(row).length === 0)
    .filter((row) => wantedTitles.some((signal) => row.title.toLowerCase().includes(signal)))
    .slice(0, Math.max(1, Math.min(50, limit)));
  const now = new Date().toISOString();
  let verified = 0;
  let closed = 0;
  let unverified = 0;

  for (let index = 0; index < rows.length; index += 6) {
    const batch = rows.slice(index, index + 6);
    const results = await Promise.all(batch.map(async (row) => ({
      row,
      verification: await verifyPosting(row.jobUrl, row.title),
    })));
    for (const { row, verification } of results) {
      if (verification.state === "open") {
        const rescored = scoreStoredJob({ title: row.title, content: verification.description, region: row.region });
        await db.update(jobs).set({
          description: verification.description,
          canonicalUrl: verification.canonicalUrl,
          score: rescored.score,
          visa: rescored.visa,
          status: "开放",
          lastSeenAt: now,
          checkedAt: now,
          missedScanCount: 0,
          expirationReason: "",
        }).where(eq(jobs.id, row.id));
        verified += 1;
      } else if (verification.state === "expired") {
        await db.update(jobs).set({
          status: "已过期",
          checkedAt: now,
          expirationReason: verification.reason,
        }).where(eq(jobs.id, row.id));
        closed += 1;
      } else {
        await db.update(jobs).set({
          status: "待官网核验",
          checkedAt: now,
          expirationReason: verification.reason,
        }).where(eq(jobs.id, row.id));
        unverified += 1;
      }
    }
  }
  return { attempted: rows.length, verified, closed, unverified };
}

async function dispatchGlobalScan() {
  const { env } = await import("cloudflare:workers");
  const token = String(env.GITHUB_WORKFLOW_TOKEN ?? "").trim();
  if (!token) {
    return {
      triggered: false,
      status: "not_configured",
      message: "GitHub Actions 触发令牌尚未配置。",
    };
  }

  const response = await fetch(
    "https://api.github.com/repos/XinyuIvy/ivy-job-radar/actions/workflows/daily-us-jobscan.yml/dispatches",
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "IvyJobRadar/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: "main" }),
    },
  );

  if (response.status === 204) {
    return {
      triggered: true,
      status: "queued",
      message: "美国聚合平台和美国公司官网搜索已在后台启动。",
    };
  }

  return {
    triggered: false,
    status: `github_${response.status}`,
    message: "美国公司 ATS 已完成，但美国后台搜索启动失败。",
  };
}

async function dispatchLatestSnapshotSync() {
  const { env } = await import("cloudflare:workers");
  const token = String(env.GITHUB_WORKFLOW_TOKEN ?? "").trim();
  if (!token) {
    return {
      triggered: false,
      status: "not_configured",
      message: "GitHub Actions 触发令牌尚未配置。",
    };
  }

  const response = await fetch(
    "https://api.github.com/repos/XinyuIvy/ivy-job-radar/actions/workflows/sync-latest-job-snapshot.yml/dispatches",
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "IvyJobRadar/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: "main" }),
    },
  );

  if (response.status === 204) {
    return {
      triggered: true,
      status: "queued",
      message: "最新岗位快照已排队重新同步。",
    };
  }

  return {
    triggered: false,
    status: `github_${response.status}`,
    message: "最新岗位快照重新同步启动失败。",
  };
}

type IdentityRow = {
  company?: string;
  title?: string;
  location?: string;
  jobUrl?: string;
  canonicalUrl?: string;
  applicationId?: string;
};

function identityParts(row: IdentityRow) {
  const company = normalizeJobIdentityText(row.company);
  const title = normalizeJobIdentityText(row.title);
  const location = normalizeJobLocation(row.location);
  const stableId = extractStableJobId(row.jobUrl, row.applicationId);
  const canonicalUrl = canonicalizeJobIdentityUrl(row.canonicalUrl || row.jobUrl);
  const usableRole = Boolean(company && title && !isPlaceholderJobTitle(row.title));
  return {
    stableId,
    stableKey: stableId ? `${company}::${stableId}` : "",
    roleKey: usableRole ? `${company}::${title}` : "",
    locationKey: usableRole ? `${company}::${title}::${location}` : "",
    canonicalKey: canonicalUrl || "",
  };
}

function buildTrackedApplicationMatcher(rows: Array<IdentityRow>) {
  const byStable = new Map<string, IdentityRow>();
  const anyByCanonical = new Map<string, IdentityRow>();
  const noStableByCanonical = new Map<string, IdentityRow>();
  const noStableByLocation = new Map<string, IdentityRow>();

  for (const row of rows) {
    const keys = identityParts(row);
    if (keys.stableKey && !byStable.has(keys.stableKey)) byStable.set(keys.stableKey, row);
    if (keys.canonicalKey && !anyByCanonical.has(keys.canonicalKey)) anyByCanonical.set(keys.canonicalKey, row);
    if (!keys.stableId) {
      if (keys.canonicalKey && !noStableByCanonical.has(keys.canonicalKey)) noStableByCanonical.set(keys.canonicalKey, row);
      if (keys.locationKey && !noStableByLocation.has(keys.locationKey)) noStableByLocation.set(keys.locationKey, row);
    }
  }

  return (job: IdentityRow) => {
    const keys = identityParts(job);
    const candidates = keys.stableId
      ? [
        byStable.get(keys.stableKey),
        noStableByCanonical.get(keys.canonicalKey),
        noStableByLocation.get(keys.locationKey),
      ]
      : [
        anyByCanonical.get(keys.canonicalKey),
        noStableByLocation.get(keys.locationKey),
      ];
    return candidates.some((candidate) => candidate && (
      sameLogicalJob(job, candidate) || sameCompanyRole(job, candidate)
    ));
  };
}

function deduplicateDisplayedJobs<Row extends IdentityRow>(rows: Row[], rank: (row: Row) => number) {
  const result: Row[] = [];
  const byStable = new Map<string, number>();
  const anyByCanonical = new Map<string, number>();
  const anyByLocation = new Map<string, number>();
  const anyByRole = new Map<string, number>();
  const ambiguousByCanonical = new Map<string, number>();
  const ambiguousByLocation = new Map<string, number>();
  const ambiguousByRole = new Map<string, number>();

  const register = (row: Row, index: number) => {
    const keys = identityParts(row);
    if (keys.stableKey && !byStable.has(keys.stableKey)) byStable.set(keys.stableKey, index);
    if (keys.canonicalKey && !anyByCanonical.has(keys.canonicalKey)) anyByCanonical.set(keys.canonicalKey, index);
    if (keys.locationKey && !anyByLocation.has(keys.locationKey)) anyByLocation.set(keys.locationKey, index);
    if (keys.roleKey && !anyByRole.has(keys.roleKey)) anyByRole.set(keys.roleKey, index);
    if (!keys.stableId) {
      if (keys.canonicalKey && !ambiguousByCanonical.has(keys.canonicalKey)) ambiguousByCanonical.set(keys.canonicalKey, index);
      if (keys.locationKey && !ambiguousByLocation.has(keys.locationKey)) ambiguousByLocation.set(keys.locationKey, index);
      if (keys.roleKey && !ambiguousByRole.has(keys.roleKey)) ambiguousByRole.set(keys.roleKey, index);
    }
  };

  for (const row of rows) {
    const keys = identityParts(row);
    const candidates = keys.stableId
      ? [
        byStable.get(keys.stableKey),
        ambiguousByCanonical.get(keys.canonicalKey),
        ambiguousByLocation.get(keys.locationKey),
        ambiguousByRole.get(keys.roleKey),
      ]
      : [
        anyByCanonical.get(keys.canonicalKey),
        anyByLocation.get(keys.locationKey),
        anyByRole.get(keys.roleKey),
      ];
    const duplicateIndex = [...new Set(candidates.filter((index): index is number => index !== undefined))]
      .sort((left, right) => left - right)
      .find((index) => sameDisplayedJob(result[index], row));

    if (duplicateIndex === undefined) {
      const index = result.push(row) - 1;
      register(row, index);
      continue;
    }
    if (rank(row) > rank(result[duplicateIndex])) {
      result[duplicateIndex] = row;
      register(row, duplicateIndex);
    }
  }
  return result;
}

export async function GET() {
  const db = await getDb();
  await ensureManualJobAdditions(db);
  await ensureManualJobStatusCorrections(db);
  const now = new Date().toISOString();
  const ignored = new Set((await db.select().from(ignoredJobs)).map((row) => row.fingerprint));
  const savedRows = await db.select().from(savedJobs);
  const savedByJob = new Map(savedRows.map((row) => [row.jobId, row]));
  const savedIds = new Set(savedByJob.keys());
  const cvPrebuildByJob = new Map<number, {
    status: string;
    lastError: string;
    language: string;
    templateFile: string;
    updatedAt: string;
    attempts: number;
  }>();
  const cvPrebuildRows = await db
    .select({
      jobId: cvPrebuildJobs.jobId,
      status: cvPrebuildJobs.status,
      lastError: cvPrebuildJobs.lastError,
      language: cvPrebuildJobs.language,
      templateFile: cvPrebuildJobs.templateFile,
      updatedAt: cvPrebuildJobs.updatedAt,
      attempts: cvPrebuildJobs.attempts,
    })
    .from(cvPrebuildJobs)
    .orderBy(
      sql`CASE WHEN ${cvPrebuildJobs.status} = 'stale' THEN 1 ELSE 0 END`,
      desc(cvPrebuildJobs.updatedAt),
      desc(cvPrebuildJobs.id),
  );
  for (const row of cvPrebuildRows) {
    if (!cvPrebuildByJob.has(row.jobId)) cvPrebuildByJob.set(row.jobId, row);
  }
  const trackedApplications = await db.select().from(applications);
  const rows = (await db.select().from(jobs).orderBy(desc(jobs.discoveredAt))).map((row) => {
    const description = extractCoreJobDescription(row.description).text;
    const rescored = scoreStoredJob({
      title: row.title,
      content: description || row.evidence,
      region: row.region,
    });
    return {
      ...row,
      company: repairBookmarkCompany(row.company, row.title, row.jobUrl),
      description,
      score: /四川大学2027校招页|牛客联影校招直达申请页|Excel同步/.test(row.source)
        ? Math.max(row.score, rescored.score)
        : rescored.score,
      visa: rescored.visa,
    };
  });
  const isTrackedApplication = buildTrackedApplicationMatcher(trackedApplications);
  const savedJobRows = rows.filter((row) => savedIds.has(row.id));
  const isTrackedForToday = (row: (typeof rows)[number]) =>
    isTrackedApplication(row)
    || savedJobRows.some((savedJob) => sameLogicalJob(savedJob, row));

  const filteredRows = rows
    .filter((row) =>
      activeJobStatuses.has(row.status)
      || savedIds.has(row.id)
      || isTrackedForToday(row),
    )
    .filter((row) => !ignored.has(fingerprint(row.company, row.title)));

  const uniqueRows = deduplicateDisplayedJobs(filteredRows, (candidate) =>
      Number(savedIds.has(candidate.id)) * 100
      + Number(candidate.source.includes("手动")) * 30
      + Number(Boolean(candidate.description)) * 10
      + Math.min(10, candidate.skills.length)
      + Math.min(10, candidate.score / 10),
  );

  return NextResponse.json(
    uniqueRows.map((row) => {
      const shortlist = evaluateTodayShortlistCandidate(row, { now });
      const spreadsheetApproved = isSpreadsheetApprovedCandidate(row);
      const tracked = isTrackedForToday(row);
      const saved = savedIds.has(row.id);
      const savedRecord = savedByJob.get(row.id);
      const prebuild = cvPrebuildByJob.get(row.id);
      const linkedApplication = trackedApplications.find((application) => sameLogicalJob(application, row));
      const applicationTemplateFile = String(linkedApplication?.resumeVersion || "").split("@", 1)[0];
      const fallbackTemplateFile = isCvTemplateFilename(applicationTemplateFile)
        ? applicationTemplateFile
        : "";
      const effectiveTemplateFile = savedRecord?.cvTemplateFile
        || prebuild?.templateFile
        || fallbackTemplateFile;
      const effectiveLanguage = savedRecord?.cvLanguage
        || prebuild?.language
        || (effectiveTemplateFile ? inferCvTemplateLanguage(effectiveTemplateFile) : "");
      return {
        ...row,
        skills: JSON.parse(row.skills || "[]"),
        saved: savedIds.has(row.id),
        savedCvLanguage: effectiveLanguage,
        savedCvTemplateFile: effectiveTemplateFile,
        todayEligible: (shortlist.eligible || spreadsheetApproved) && !saved && !tracked,
        todayFitScore: shortlist.fitScore,
        todayBlockers: [
          ...(spreadsheetApproved ? [] : shortlist.blockers),
          ...(saved ? ["岗位已收藏"] : []),
          ...(tracked ? ["该岗位已被收藏或进入申请流程"] : []),
        ],
        cvPrebuildStatus: prebuild?.status ?? null,
        cvPrebuildError: prebuild?.lastError ?? "",
        cvPrebuildUpdatedAt: prebuild?.updatedAt ?? "",
        cvPrebuildAttempts: prebuild?.attempts ?? 0,
      };
    }),
  );
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    const officialBoards = await refreshOfficialBoards();
    const officialJds = await refreshStoredOfficialJds();
    const backgroundScan = await dispatchGlobalScan();
    return NextResponse.json({ ...officialBoards, officialJds, backgroundScan });
  }
  if (body.action === "sync-latest") {
    const result = await dispatchLatestSnapshotSync();
    return NextResponse.json(result, { status: result.triggered ? 202 : 502 });
  }
  if (Object.keys(body).length === 0 || body.action === "refresh") {
    const officialBoards = await refreshOfficialBoards();
    const officialJds = await refreshStoredOfficialJds();
    const db = await getDb();
    const startedAt = new Date().toISOString();
    const totalJobs = (await db.select({ id: jobs.id }).from(jobs)).length;
    await db.insert(scanStatus).values({
      id: 1,
      state: "ats_complete",
      atsScanned: officialBoards.scanned,
      atsMatched: officialBoards.matched,
      created: 0,
      updated: 0,
      skipped: 0,
      totalJobs,
      startedAt,
      completedAt: "",
      message: "美国公司 ATS 已完成，正在启动美国后台搜索。",
      phase: "ATS 初筛",
      currentSource: "美国公司 ATS",
      stepsCompleted: 1,
      stepsTotal: 10,
      scanned: officialBoards.scanned,
      uniqueJobs: officialBoards.scanned,
      filtered: Math.max(0, officialBoards.scanned - officialBoards.matched),
      verified: officialBoards.matched,
      eligible: officialBoards.matched,
      progressUpdatedAt: startedAt,
    }).onConflictDoUpdate({
      target: scanStatus.id,
      set: {
        state: "ats_complete",
        atsScanned: officialBoards.scanned,
        atsMatched: officialBoards.matched,
        created: 0,
        updated: 0,
        skipped: 0,
        totalJobs,
        startedAt,
        completedAt: "",
        message: "美国公司 ATS 已完成，正在启动美国后台搜索。",
        phase: "ATS 初筛",
        currentSource: "美国公司 ATS",
        stepsCompleted: 1,
        stepsTotal: 10,
        scanned: officialBoards.scanned,
        uniqueJobs: officialBoards.scanned,
        filtered: Math.max(0, officialBoards.scanned - officialBoards.matched),
        verified: officialBoards.matched,
        eligible: officialBoards.matched,
        progressUpdatedAt: startedAt,
      },
    });
    const backgroundScan = await dispatchGlobalScan();
    await db.update(scanStatus).set({
      state: backgroundScan.triggered ? "queued" : "failed",
      completedAt: backgroundScan.triggered ? "" : new Date().toISOString(),
      message: backgroundScan.triggered
        ? "美国 ATS 已完成；后台任务已排队，等待美国搜索、核验和回写。"
        : backgroundScan.message,
      phase: backgroundScan.triggered ? "等待云端任务" : "启动失败",
      currentSource: backgroundScan.triggered ? "GitHub Actions" : "美国公司 ATS",
    }).where(eq(scanStatus.id, 1));
    return NextResponse.json({ ...officialBoards, officialJds, backgroundScan });
  }
  const required = ["company", "title", "region", "track", "jobUrl"];
  if (required.some((key) => !String(body[key] ?? "").trim())) {
    return NextResponse.json({ error: "Missing required job fields." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const db = await getDb();
  const jobUrl = String(body.jobUrl).trim();
  const canonicalUrl = canonicalizeJobUrl(jobUrl);
  const applicationId = extractApplicationId(jobUrl, body.applicationId);
  const company = String(body.company).trim();
  const title = String(body.title).trim();
  const location = String(body.location ?? "").trim();
  const incomingIdentity = { company, title, location, jobUrl, canonicalUrl, applicationId };
  const candidates = await db
    .select()
    .from(jobs)
    .where(or(
      eq(jobs.jobUrl, jobUrl),
      eq(jobs.canonicalUrl, canonicalUrl),
      applicationId ? eq(jobs.applicationId, applicationId) : eq(jobs.jobUrl, jobUrl),
      and(eq(jobs.company, company), eq(jobs.title, title)),
    ));
  const existing = candidates.find((row) => sameLogicalJob(row, incomingIdentity));
  const exactUrlCollision = candidates.some((row) => row.jobUrl === jobUrl && !sameLogicalJob(row, incomingIdentity));
  const storedJobUrl = existing?.jobUrl
    || (exactUrlCollision ? makeDistinctStoredJobUrl(jobUrl, incomingIdentity) : jobUrl);
  const values = {
    company,
    title,
    location,
    region: String(body.region).trim(),
    track: String(body.track).trim(),
    score: Math.max(0, Math.min(100, Number(body.score ?? 0))),
    visa: String(body.visa ?? "需人工确认").trim(),
    evidence: String(body.evidence ?? "").trim(),
    description: String(body.description ?? "").trim().slice(0, 50000),
    skills: JSON.stringify(Array.isArray(body.skills) ? body.skills : []),
    jobUrl: storedJobUrl,
    canonicalUrl,
    applicationId,
    source: String(body.source ?? "公司官网").trim(),
    status: String(body.status ?? "开放").trim(),
    deadline: String(body.deadline ?? "").trim(),
    deadlineType: String(body.deadlineType ?? "unknown").trim(),
    lastSeenAt: now,
    missedScanCount: 0,
    expirationReason: "",
    discoveredAt: String(body.discoveredAt ?? now),
    checkedAt: now,
  };
  if (existing) {
    const [updated] = await db.update(jobs).set(values).where(eq(jobs.id, existing.id)).returning();
    return NextResponse.json(updated);
  }
  const [created] = await db
    .insert(jobs)
    .values(values)
    .onConflictDoUpdate({
      target: jobs.jobUrl,
      set: {
        score: Math.max(0, Math.min(100, Number(body.score ?? 0))),
        visa: String(body.visa ?? "需人工确认").trim(),
        evidence: String(body.evidence ?? "").trim(),
        description: String(body.description ?? "").trim().slice(0, 50000),
        skills: JSON.stringify(Array.isArray(body.skills) ? body.skills : []),
        status: String(body.status ?? "开放").trim(),
        checkedAt: now,
      },
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
