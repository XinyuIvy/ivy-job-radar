import { eq, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../../db";
import { ignoredJobs, jobs, scanStatus } from "../../../../db/schema";
import { extractDeadline } from "../../../lib/data-quality";
import { activeJobStatuses, deadlineHasPassed, verifyPosting } from "../../../lib/job-expiration";

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
  full_description?: unknown;
  salary?: unknown;
  salary_min_monthly_k?: unknown;
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

const chinaRelevant = /生物统计|临床统计|医学统计|统计科学|统计分析|统计建模|统计师|统计|数据科学|应用科学|研究科学|算法研究|科学计算|计算生物|ai\s*for\s*science|量化研究|定量研究|量化分析|真实世界|流行病|卫生经济|健康经济|结局研究|医疗咨询|医药咨询|生命科学咨询|医学影像|biostat|statistical|data scientist|applied scientist|research scientist|quantitative|epidemiolog|health economics/i;
const chinaExcludedTitle = /实习|兼职|高级|资深|首席|专家|总监|经理|负责人|主管|架构师|软件工程|数据工程|算法工程|intern|part.?time|senior|principal|staff|manager|director|lead|head of|vice president|software engineer|data engineer|algorithm engineer/i;
const chinaIrrelevant = /物流统计|仓库统计|生产统计|财务统计|销售统计|门店统计|猪场统计|养殖统计|统计文员|数据录入|文员|会计|出纳|客服|行政专员|logistics|warehouse|bookkeep|accounting clerk|data entry/i;
const chinaExcludedCore = /大语言模型|大模型|自然语言处理|\bllm\b|\bnlp\b|large language model|生成式\s*ai|generative\s*ai/i;

function requiredExperience(content: string) {
  const years = Array.from(content.matchAll(/(?:至少|最低|要求|需具备)\s*(\d+)\s*年|(\d+)\s*年(?:以上)?(?:相关|工作|行业|专业)?经验|(?:minimum|at least)\s+(\d+)\+?\s+years?|((?:\d+))\+?\s+years?(?:\s+of)?\s+(?:relevant|related|professional|industry|work)?\s*experience/gi))
    .flatMap((match) => match.slice(1).filter(Boolean).map(Number));
  return years.length ? Math.max(...years) : null;
}

function monthlySalaryFloorK(content: string) {
  const normalized = content.replace(/,/g, "");
  const annual = [
    [/(\d+(?:\.\d+)?)\s*[-–—~至]\s*\d+(?:\.\d+)?\s*万\s*(?:\/|每)?年/i, 10 / 12],
    [/年薪\s*(\d+(?:\.\d+)?)\s*[-–—~至]\s*\d+(?:\.\d+)?\s*万/i, 10 / 12],
    [/年薪\s*(\d+(?:\.\d+)?)\s*万(?:元)?(?:起|以上)/i, 10 / 12],
  ] as const;
  for (const [pattern, multiplier] of annual) {
    const match = normalized.match(pattern);
    if (match) return Number(match[1]) * multiplier;
  }
  const monthly = [
    [/(\d+(?:\.\d+)?)\s*[-–—~至]\s*\d+(?:\.\d+)?\s*k(?:\s*\/?\s*月)?/i, 1],
    [/(?:月薪\s*)?(\d+(?:\.\d+)?)\s*k(?:\s*(?:起|以上))/i, 1],
    [/(?:月薪\s*)?(\d+(?:\.\d+)?)\s*[-–—~至]\s*\d+(?:\.\d+)?\s*万(?:元)?\s*(?:\/|每)?月/i, 10],
    [/(?:月薪\s*)?(\d{4,6})\s*[-–—~至]\s*\d{4,6}\s*元?\s*(?:\/|每)?月/i, 0.001],
  ] as const;
  for (const [pattern, multiplier] of monthly) {
    const match = normalized.match(pattern);
    if (match) return Number(match[1]) * multiplier;
  }
  return null;
}

function isEligibleChinaImport(raw: ImportJob, title: string, description: string, evidence: string) {
  const salary = cleanText(raw.salary);
  const content = `${title} ${description} ${evidence} ${salary}`;
  const suppliedFloor = Number(raw.salary_min_monthly_k);
  const salaryFloor = Number.isFinite(suppliedFloor) && suppliedFloor > 0
    ? suppliedFloor
    : monthlySalaryFloorK(content);
  const years = requiredExperience(content);
  return chinaRelevant.test(content)
    && !chinaExcludedTitle.test(title)
    && !chinaIrrelevant.test(title)
    && !chinaExcludedCore.test(content)
    && (years === null || years <= 3)
    // Keep missing or negotiable salary for manual verification.
    // Only exclude a salary when its parsed floor is explicitly below 20K.
    && (salaryFloor === null || salaryFloor >= 20);
}

function displayStatus(incomingStatus: string) {
  if (incomingStatus === "已捕获完整JD") return "开放";
  if (incomingStatus === "待核验") return "待官网核验";
  return incomingStatus;
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

  const envelope = !Array.isArray(payload) && payload && typeof payload === "object"
    ? payload as { jobs?: unknown; complete_source?: unknown; seen_urls?: unknown }
    : null;
  const importRows = Array.isArray(payload) ? payload : Array.isArray(envelope?.jobs) ? envelope.jobs : null;
  if (!importRows) {
    return NextResponse.json({ error: "The request body must contain a job array." }, { status: 400 });
  }
  if (importRows.length > 500) {
    return NextResponse.json({ error: "A single import cannot exceed 500 jobs." }, { status: 413 });
  }

  const db = await getDb();
  const ignored = new Set((await db.select().from(ignoredJobs)).map((row) => row.fingerprint));
  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const importedSources = new Set<string>();
  const completedSource = cleanText(envelope?.complete_source) || cleanText(request.headers.get("x-ivy-scan-source"));
  const scanComplete = Boolean(completedSource) && (Boolean(envelope) || request.headers.get("x-ivy-scan-complete") === "true");

  for (const raw of importRows as ImportJob[]) {
    const company = cleanText(raw.company);
    const title = cleanText(raw.title);
    const originalJobUrl = cleanText(raw.original_job_url);
    const officialUrl = cleanText(raw.official_url);
    const jobUrl = officialUrl || cleanText(raw.job_url);
    const region = cleanText(raw.region) || "美国";
    const score = Math.max(0, Math.min(100, Number(raw.score ?? 0)));
    const visa = cleanText(raw.visa) || "JD 未明确";
    const incomingStatus = displayStatus(cleanText(raw.status) || "待官网核验");
    const description = cleanText(raw.description) || cleanText(raw.full_description);
    const evidence = cleanText(raw.evidence);
    const deadline = extractDeadline(`${description} ${evidence}`);
    const chinaEligible = region !== "中国" || isEligibleChinaImport(raw, title, description, evidence);

    // Recheck hard filters at the website boundary.
    if (
      !company ||
      !title ||
      !jobUrl ||
      !["美国", "中国"].includes(region) ||
      (region !== "中国" && score < 55) ||
      (region !== "中国" && isExcludedTitle(title)) ||
      !chinaEligible ||
      ignored.has(fingerprint(company, title))
    ) {
      skipped += 1;
      continue;
    }

    const canonicalUrl = cleanText(raw.canonical_url) || canonicalizeJobUrl(jobUrl);
    const applicationId = cleanText(raw.application_id);
    const [existing] = await db
      .select()
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
      evidence,
      description: description.slice(0, 50000),
      skills: JSON.stringify(skills),
      jobUrl,
      canonicalUrl,
      applicationId,
      source: cleanText(raw.source) || "JobSpy",
      status: region === "美国" && visa === "明确不支持" && incomingStatus === "开放"
        ? "不合格"
        : incomingStatus,
      deadline: deadline.deadline || existing?.deadline || "",
      deadlineType: deadline.deadlineType === "unknown" ? existing?.deadlineType || "unknown" : deadline.deadlineType,
      lastSeenAt: cleanText(raw.checked_at) || now,
      missedScanCount: 0,
      expirationReason: "",
      discoveredAt: existing?.discoveredAt || cleanText(raw.discovered_at) || now,
      checkedAt: cleanText(raw.checked_at) || now,
    };
    importedSources.add(values.source);

    if (existing) {
      const incomingHasFullJd = values.description.length > 0;
      const mergedValues = {
        ...values,
        company: values.company === "待核验公司" ? existing.company : values.company,
        location: values.location || existing.location,
        score: Math.max(values.score, existing.score),
        visa: values.visa === "JD 未明确" ? existing.visa : values.visa,
        evidence: values.evidence || existing.evidence,
        description: values.description || existing.description,
        skills: values.skills === "[]" ? existing.skills : values.skills,
        canonicalUrl: values.canonicalUrl || existing.canonicalUrl,
        applicationId: values.applicationId || existing.applicationId,
        source: incomingHasFullJd || !existing.source ? values.source : existing.source,
        status: values.status === "待官网核验" && existing.status === "开放" ? existing.status : values.status,
        discoveredAt: existing.discoveredAt,
      };
      await db.update(jobs).set(mergedValues).where(eq(jobs.id, existing.id));
      updated += 1;
    } else {
      await db.insert(jobs).values(values);
      created += 1;
    }
  }

  const activeRows = (await db.select().from(jobs)).filter((row) => activeJobStatuses.has(row.status));
  for (const row of activeRows) {
    if (!deadlineHasPassed(row.deadline, row.deadlineType, now)) continue;
    await db.update(jobs).set({
      status: "已过期",
      expirationReason: `申请截止日期 ${row.deadline} 已过`,
    }).where(eq(jobs.id, row.id));
  }

  if (scanComplete && completedSource) {
    const envelopeSeenUrls = Array.isArray(envelope?.seen_urls) ? envelope.seen_urls.map(cleanText) : [];
    const seenUrls = new Set([
      ...envelopeSeenUrls,
      ...(importRows as ImportJob[]).flatMap((raw) => [
        cleanText(raw.job_url), cleanText(raw.original_job_url), cleanText(raw.official_url), cleanText(raw.canonical_url),
      ]),
    ].filter(Boolean).map(canonicalizeJobUrl));
    const sourceRows = activeRows.filter((row) =>
      row.source === completedSource && !deadlineHasPassed(row.deadline, row.deadlineType, now),
    );
    for (const row of sourceRows) {
      const rowUrls = [row.jobUrl, row.canonicalUrl].filter(Boolean).map(canonicalizeJobUrl);
      if (rowUrls.some((url) => seenUrls.has(url))) continue;
      const misses = row.missedScanCount + 1;
      const verification = await verifyPosting(row.jobUrl);
      if (verification.state === "expired") {
        await db.update(jobs).set({
          status: "已过期",
          missedScanCount: misses,
          expirationReason: verification.reason,
        }).where(eq(jobs.id, row.id));
        continue;
      }
      if (misses < 2) {
        await db.update(jobs).set({
          missedScanCount: misses,
          expirationReason: verification.state === "unknown" ? verification.reason : "",
        }).where(eq(jobs.id, row.id));
        continue;
      }
      if (verification.state === "open") {
        await db.update(jobs).set({
          status: "开放",
          missedScanCount: 0,
          expirationReason: "",
          checkedAt: now,
        }).where(eq(jobs.id, row.id));
      } else {
        await db.update(jobs).set({
          status: "疑似过期",
          missedScanCount: misses,
          expirationReason: verification.reason,
        }).where(eq(jobs.id, row.id));
      }
    }
  }

  if (envelope && importRows.length === 0) {
    return NextResponse.json({ ok: true, received: 0, created: 0, updated: 0, skipped: 0, reconciledAt: now });
  }

  const totalJobs = (await db.select({ id: jobs.id }).from(jobs)).length;
  const includesUsJobs = importRows.some((row) => cleanText(row.region) === "美国");
  const [currentUsScan] = await db.select().from(scanStatus).where(eq(scanStatus.id, 1)).limit(1);
  // Workflow batches must not mark the scan complete before every source is imported.
  // China imports also must not overwrite the independent US progress lane.
  if (includesUsJobs && !["queued", "running", "ats_complete"].includes(currentUsScan?.state ?? "")) {
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
  }

  return NextResponse.json({
    ok: true,
    received: importRows.length,
    created,
    updated,
    skipped,
    importedAt: now,
  });
}
