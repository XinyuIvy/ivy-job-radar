import { desc, eq, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../db";
import { applications, ignoredJobs, jobs, savedJobs, scanStatus } from "../../../db/schema";
import { ashbyBoards, greenhouseBoards, iCimsBoards, leverBoards, paylocityBoards, workdayBoards } from "../../lib/company-sources";
import { extractDeadline } from "../../lib/data-quality";
import { activeJobStatuses, deadlineHasPassed, verifyPosting } from "../../lib/job-expiration";

export const dynamic = "force-dynamic";

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
      if (misses < 2) {
        await db.update(jobs).set({ missedScanCount: misses }).where(eq(jobs.id, row.id));
        continue;
      }

      await db.update(jobs).set({
        status: "疑似过期",
        missedScanCount: misses,
        expirationReason: "连续两次完整来源扫描未发现该岗位，正在直接核验",
      }).where(eq(jobs.id, row.id));
      const verification = await verifyPosting(row.jobUrl);
      if (verification.state === "expired") {
        await db.update(jobs).set({ status: "已过期", expirationReason: verification.reason }).where(eq(jobs.id, row.id));
      } else if (verification.state === "open") {
        await db.update(jobs).set({
          status: "开放",
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

const initialJobs = [
  {
    company: "Amazon",
    title: "Applied Scientist, Pricing Science",
    location: "Seattle, WA",
    region: "美国",
    track: "Technology",
    score: 72,
    visa: "JD 未明确",
    evidence: "申请入口核验时有效；学历：明确接受博士；核心优势：因果推断与实验设计；主要缺口：较强 Python 与生产级建模要求。",
    skills: JSON.stringify(["Causal inference", "Experimentation", "Python"]),
    jobUrl: "https://www.amazon.jobs/en/jobs/10414298/applied-scientist-pricing-science",
    source: "Amazon Careers",
    status: "开放",
    discoveredAt: "2026-07-30T23:30:00.000Z",
    checkedAt: "2026-07-30T23:30:00.000Z",
  },
  {
    company: "Boston Red Sox",
    title: "Data Scientist, Baseball Analytics",
    location: "Boston, MA",
    region: "美国",
    track: "Technology",
    score: 78,
    visa: "JD 未明确",
    evidence: "公司官方招聘系统的申请入口核验时有效；学历：接受统计等定量专业；核心优势：统计建模、R/Python 与研究沟通。",
    skills: JSON.stringify(["Statistical modeling", "R / Python", "SQL"]),
    jobUrl: "https://jobs.lever.co/redsox/46e29255-3049-4733-8c5a-047eefa3cbd0",
    source: "Lever",
    status: "开放",
    discoveredAt: "2026-07-30T23:30:00.000Z",
    checkedAt: "2026-07-30T23:30:00.000Z",
  },
  {
    company: "Artera",
    title: "Biostatistics Research Associate",
    location: "Remote, US/Canada",
    region: "美国",
    track: "Healthcare AI",
    score: 34,
    visa: "明确不支持",
    evidence: "公司官方招聘系统的申请入口核验时有效；专业内容匹配，但 JD 明确不提供 sponsorship，因此不进入美国推荐列表。",
    skills: JSON.stringify(["Biostatistics", "Clinical AI validation", "R"]),
    jobUrl: "https://jobs.lever.co/artera/1de03f42-aadf-41b7-99bd-51ef67c50528",
    source: "Lever",
    status: "开放",
    discoveredAt: "2026-07-30T23:30:00.000Z",
    checkedAt: "2026-07-30T23:30:00.000Z",
  },
];

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

const excludedTitles = [
  "intern", "postdoc", "postdoctoral", "software engineer", "data engineer",
  "machine learning engineer", "nlp", "language model", "generative ai", "llm",
  "director", "vice president", "senior", "principal", "staff",
  "manager", "lead", "head of", "technical leadership",
];

function isExcludedTitle(title: string) {
  const lower = title.toLowerCase();
  return excludedTitles.some((signal) => lower.includes(signal))
    || /\bsr\.?(?:\s|$)/i.test(title)
    || /\bexperienced hire\b/i.test(title)
    || /\bresearch scientist\s+(?:iii|iv|v|[3-9])\b/i.test(title);
}

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
  try {
    const url = new URL(raw);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const removable = [
      "gh_jid", "gh_src", "source", "src", "ref", "referrer",
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    ];
    removable.forEach((key) => url.searchParams.delete(key));
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return raw.trim();
  }
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

function classifyTrack(text: string) {
  const lower = text.toLowerCase();
  if (/quantitative researcher|quantitative analyst|systematic|量化研究|定量研究|量化分析/.test(lower)) return "Quant";
  if (/biostat|statistical scientist|clinical trial|epidemiol|health economics|outcomes research|生物统计|临床统计|医学统计|流行病|卫生经济|健康经济|真实世界/.test(lower)) return "Pharma";
  if (/healthcare consultant|life sciences consultant|医疗咨询|医药咨询|生命科学咨询/.test(lower)) return "Healthcare Consulting";
  if (/health|clinical ai|medical|imaging/.test(lower)) return "Healthcare AI";
  if (/device|diagnostic|algorithm validation/.test(lower)) return "Medical Device";
  return "Technology";
}

function sponsorship(text: string) {
  const lower = text.toLowerCase();
  if (/(will not|does not|unable to|not provide).{0,40}(sponsor|sponsorship)/.test(lower)) return "明确不支持";
  if (/(visa|h-?1b).{0,40}(sponsor|sponsorship)|sponsorship available/.test(lower)) return "可能支持";
  return "JD 未明确";
}

function experienceYears(text: string) {
  const years = [
    ...text.matchAll(/(?:minimum|min\.?|at least|至少)\s*(\d+)\+?\s*(?:years?|年)/gi),
    ...text.matchAll(/(\d+)\+?\s*(?:years?|年)\s+(?:of\s+)?(?:relevant|related|professional|industry|work)?\s*experience/gi),
    ...text.matchAll(/(\d+)\s*年(?:及|或)?以上(?:相关)?(?:工作)?经验/gi),
  ].map((match) => Number(match[1]));
  return years.length ? Math.max(...years) : null;
}

function extractSkills(text: string) {
  const rules: Array<[string, RegExp]> = [
    ["Python", /\bpython\b/i], ["R", /(?:^|\W)R(?:\W|$)/], ["SQL", /\bsql\b/i],
    ["SAS", /\bsas\b/i], ["Statistics", /\bstatistic/i], ["Biostatistics", /\bbiostat/i],
    ["Causal inference", /causal inference|propensity score|inverse probability|target trial/i],
    ["Experimentation", /experiment(?:al)? design|a\/b test|randomized experiment/i],
    ["Machine learning", /machine learning|statistical learning|predictive model/i],
    ["Clinical trials", /clinical trial|randomized controlled trial|estimand/i],
    ["Longitudinal data", /longitudinal|repeated measures|mixed.effects|survival analysis/i],
    ["Model validation", /external validation|calibration|generaliz|fairness|bias analysis|model evaluation/i],
    ["Medical imaging", /medical imaging|neuroimaging|multimodal imaging|digital biomarker/i],
    ["RWE / HEOR", /real.world evidence|\brwe\b|\bheor\b|health economics|pharmacoepidemi/i],
  ];
  return rules.filter(([, pattern]) => pattern.test(text)).map(([label]) => label).slice(0, 7);
}

type ScoreResult = {
  score: number;
  details: string[];
  eligible: boolean;
};

function scoreJob(title: string, content: string, region: string, years: number | null, visa: string): ScoreResult {
  const text = `${title} ${content}`;
  const lower = text.toLowerCase();
  const details: string[] = [];
  let score = 0;

  // 1. Degree and career-stage feasibility: 20 points.
  const phdAccepted = /\bph\.?d\.?\b|doctoral|doctorate|博士|硕博|硕士(?:研究生)?(?:及|或)?以上/.test(lower);
  const quantitativeDegree = /statistics|biostatistics|epidemiology|data science|mathematics|economics|quantitative|统计|生物统计/.test(lower);
  if (phdAccepted) score += 10;
  else if (quantitativeDegree) score += 6;
  if (years === null) score += 4;
  else if (years === 0) score += 10;
  else if (years <= 3) score += 8;
  details.push(phdAccepted ? "学历：明确接受博士" : quantitativeDegree ? "学历：接受相关定量专业" : "学历：未确认博士匹配");
  details.push(years === null ? "经验：未写明最低年限" : `经验：最低要求约 ${years} 年`);

  // 2. Core statistics and research strengths: 30 points.
  const coreSignals: Array<[number, RegExp]> = [
    [10, /biostatistics|statistical modeling|statistical analysis|statistics|生物统计|统计建模/],
    [7, /study design|research design|experimental design|clinical trial|研究设计|临床试验/],
    [6, /predictive model|risk prediction|risk stratification|machine learning|预测模型|风险分层/],
    [7, /causal inference|longitudinal|repeated measures|missing data|survival analysis|因果推断|纵向数据|缺失数据/],
  ];
  const coreScore = Math.min(30, coreSignals.reduce((sum, [points, pattern]) => sum + (pattern.test(lower) ? points : 0), 0));
  score += coreScore;
  details.push(`核心专业：${coreScore}/30`);

  // 3. Domain transferability: 20 points.
  const domainSignals: Array<[number, RegExp]> = [
    [8, /clinical|healthcare|medical|patient|ehr|pharma|biotech|临床|医疗|医药/],
    [6, /neuroimaging|medical imaging|multimodal|digital biomarker|wearable|医学影像|神经影像/],
    [6, /real.world evidence|\brwe\b|\bheor\b|epidemiology|pharmacoepidemiology|regulatory science/],
    [5, /experimentation|decision science|product analytics|quantitative research|systematic research/],
  ];
  const domainScore = Math.min(20, domainSignals.reduce((sum, [points, pattern]) => sum + (pattern.test(lower) ? points : 0), 0));
  score += domainScore;
  details.push(`领域迁移：${domainScore}/20`);

  // 4. Verified tools and implementation fit: 15 points.
  let toolScore = 0;
  if (/(?:^|\W)r(?:\W|$)|\brstudio\b/i.test(text)) toolScore += 7;
  if (/\bpython\b/i.test(text)) toolScore += 5;
  if (/data analysis|statistical programming|数据分析/.test(lower)) toolScore += 3;
  score += Math.min(15, toolScore);
  details.push(`工具匹配：${Math.min(15, toolScore)}/15`);

  // 5. Work authorization: 15 points for US roles; neutral for China roles.
  if (region === "美国") {
    if (visa === "可能支持") score += 15;
    else if (visa === "JD 未明确") score += 7;
    details.push(`工作授权：${visa}`);
  } else {
    score += 15;
    details.push("工作授权：中国岗位不适用 sponsorship");
  }

  // Treat unsupported capabilities as real gaps, not keyword matches.
  const aiCoreSignals = [
    /large language model|\bllm\b|\brag\b|natural language processing|\bnlp\b/,
    /fine.tun(?:e|ing)|reinforcement learning|foundation model/,
    /deep learning architecture|computer vision|image segmentation/,
    /production ml|mlops|distributed training|model serving/,
    /full.stack|backend engineer|frontend engineer|software engineering/,
  ];
  const aiGapCount = aiCoreSignals.filter((pattern) => pattern.test(lower)).length;
  if (aiGapCount > 0) {
    score -= Math.min(40, aiGapCount * 15);
    details.push(`硬技能缺口：检测到 ${aiGapCount} 类未具备的核心研发要求`);
  }

  const citizenshipRestricted = /u\.?s\.? citizen|us citizenship|required clearance|security clearance|公民身份/.test(lower);
  const sponsorshipBlocked = region === "美国" && visa === "明确不支持";
  const experienceBlocked = years !== null && years > 3 && !/(ph\.?d\.?|doctorate).{0,80}(?:count|equivalent|substitut)/i.test(content);
  const eligible = !citizenshipRestricted && !sponsorshipBlocked && !experienceBlocked && aiGapCount < 2;

  if (citizenshipRestricted) details.push("硬性限制：要求美国公民身份或安全许可");
  if (sponsorshipBlocked) details.push("硬性限制：明确不提供 sponsorship");
  if (experienceBlocked) details.push("硬性限制：经验要求超过 3 年");

  return { score: Math.max(0, Math.min(100, Math.round(score))), details, eligible };
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

async function saveCandidate(candidate: CandidateJob, ignored: Set<string>, now: string) {
  const { company, title, location, content, jobUrl, applicationId, source } = candidate;
  if (!title || !jobUrl || ignored.has(fingerprint(company, title))) return false;
  const lowerTitle = title.toLowerCase();
  if (!wantedTitles.some((signal) => lowerTitle.includes(signal))) return false;
  if (isExcludedTitle(lowerTitle)) return false;

  const region = /china|greater china|beijing|shanghai|shenzhen|guangzhou|suzhou|hangzhou|nanjing|chengdu|wuhan|tianjin|wuxi|xiamen|qingdao|中国|北京|上海|深圳|广州|苏州|杭州|南京|成都|武汉|天津|无锡|厦门|青岛|重庆|西安|合肥|长沙|大连|珠海|东莞/i.test(location)
    ? "中国"
    : "美国";
  const years = experienceYears(content);
  const visa = sponsorship(content);
  const scoring = scoreJob(title, content, region, years, visa);
  const deadline = extractDeadline(content);
  const phdTargeted = /\bph\.?d\.?\b|doctoral|doctorate|博士|硕博|硕士(?:研究生)?(?:及|或)?以上/i.test(content);
  if (!scoring.eligible || !phdTargeted || scoring.score < 55) return false;

  const db = await getDb();
  const canonicalUrl = canonicalizeJobUrl(jobUrl);
  const [existing] = await db
    .select({ id: jobs.id, discoveredAt: jobs.discoveredAt })
    .from(jobs)
    .where(
      or(
        eq(jobs.jobUrl, jobUrl),
        eq(jobs.canonicalUrl, canonicalUrl),
        applicationId ? eq(jobs.applicationId, applicationId) : eq(jobs.jobUrl, jobUrl),
      ),
    )
    .limit(1);
  const values = {
    company,
    title,
    location,
    region,
    track: classifyTrack(`${title} ${content}`),
    score: scoring.score,
    visa,
    evidence: ["公司当前职位列表中仍有该岗位", ...scoring.details].join("；"),
    skills: JSON.stringify(extractSkills(content)),
    jobUrl,
    canonicalUrl,
    applicationId,
    source,
    status: "开放",
    deadline: deadline.deadline,
    deadlineType: deadline.deadlineType,
    lastSeenAt: now,
    missedScanCount: 0,
    expirationReason: "",
    discoveredAt: existing?.discoveredAt ?? now,
    checkedAt: now,
  };
  if (existing) await db.update(jobs).set(values).where(eq(jobs.id, existing.id));
  else await db.insert(jobs).values(values);
  return true;
}

async function scanGreenhouse(ignored: Set<string>, now: string): Promise<SourceStats> {
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
        }, ignored, now)) {
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

async function scanLever(ignored: Set<string>, now: string): Promise<SourceStats> {
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
        }, ignored, now)) {
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

async function scanAshby(ignored: Set<string>, now: string): Promise<SourceStats> {
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
        }, ignored, now)) {
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
  ignored: Set<string>,
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
          }, ignored, now)) {
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

async function scanWorkday(ignored: Set<string>, now: string): Promise<SourceStats> {
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
        if (!title || !externalPath || !wantedTitles.some((signal) => title.toLowerCase().includes(signal))) continue;
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
        }, ignored, now)) {
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
  const ignored = new Set((await db.select().from(ignoredJobs)).map((row) => row.fingerprint));
  const now = new Date().toISOString();
  const sources = await Promise.all([
    scanGreenhouse(ignored, now),
    scanLever(ignored, now),
    scanAshby(ignored, now),
    scanHtmlAts("BambooHR", bambooHrBoards, /\/careers\/\d+|\/careers\/.*\/job\//i, ignored, now),
    scanHtmlAts("iCIMS", iCimsBoards, /\.icims\.com\/jobs\/\d+\/[^/?#]+\/job/i, ignored, now),
    scanHtmlAts("Paylocity", paylocityBoards, /recruiting\.paylocity\.com\/recruiting\/jobs\/Details\/\d+\//i, ignored, now),
    scanWorkday(ignored, now),
  ]);
  await reconcileExpiration(sources, now);
  return {
    scanned: sources.reduce((sum, item) => sum + item.scanned, 0),
    matched: sources.reduce((sum, item) => sum + item.matched, 0),
    verifiedAt: now,
    sources,
  };
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

async function seedInitialJobs() {
  const db = await getDb();
  for (const job of initialJobs) {
    const canonicalUrl = canonicalizeJobUrl(job.jobUrl);
    const applicationId = extractApplicationId(job.jobUrl);
    await db.insert(jobs).values({ ...job, canonicalUrl, applicationId }).onConflictDoUpdate({
      target: jobs.jobUrl,
      set: {
        score: job.score,
        visa: job.visa,
        evidence: job.evidence,
        skills: job.skills,
        canonicalUrl,
        applicationId,
        checkedAt: job.checkedAt,
      },
    });
  }
  return db;
}

export async function GET() {
  const db = await seedInitialJobs();
  const ignored = new Set((await db.select().from(ignoredJobs)).map((row) => row.fingerprint));
  const savedIds = new Set((await db.select().from(savedJobs)).map((row) => row.jobId));
  const activeApplicationStatuses = new Set(["已申请", "一面", "二面/技术面", "终面", "Offer", "拒绝"]);
  const activeApplications = (await db.select().from(applications))
    .filter((row) => activeApplicationStatuses.has(row.status));
  const appliedFingerprints = new Set(activeApplications.map((row) => fingerprint(row.company, row.title)));
  const appliedUrls = new Set(activeApplications.map((row) => canonicalizeJobUrl(row.jobUrl)).filter(Boolean));
  const appliedIds = new Set(activeApplications.map((row) => normalize(row.applicationId)).filter(Boolean));
  const rows = await db.select().from(jobs).orderBy(desc(jobs.discoveredAt));

  const seen = new Set<string>();
  return NextResponse.json(
    rows
      .filter((row) => {
        const tracked = savedIds.has(row.id)
          || appliedFingerprints.has(fingerprint(row.company, row.title))
          || appliedUrls.has(row.canonicalUrl || canonicalizeJobUrl(row.jobUrl))
          || Boolean(row.applicationId && appliedIds.has(normalize(row.applicationId)));
        return activeJobStatuses.has(row.status) || tracked;
      })
      .filter((row) => !ignored.has(fingerprint(row.company, row.title)))
      .filter((row) => !activeJobStatuses.has(row.status) || !appliedFingerprints.has(fingerprint(row.company, row.title)))
      .filter((row) => !activeJobStatuses.has(row.status) || !appliedUrls.has(row.canonicalUrl || canonicalizeJobUrl(row.jobUrl)))
      .filter((row) => !activeJobStatuses.has(row.status) || !row.applicationId || !appliedIds.has(normalize(row.applicationId)))
      .filter((row) => !activeJobStatuses.has(row.status) || !(row.region === "美国" && row.visa === "明确不支持"))
      .filter((row) => !activeJobStatuses.has(row.status) || !isExcludedTitle(row.title))
      .filter((row) => !activeJobStatuses.has(row.status) || row.score >= 55)
      .filter((row) => {
        const canonicalUrl = row.canonicalUrl || canonicalizeJobUrl(row.jobUrl);
        const key = row.status === "待官网核验"
          ? `pending::${fingerprint(row.company, row.title)}`
          : row.applicationId
          ? `${normalize(row.company)}::id::${normalize(row.applicationId)}`
          : canonicalUrl
            ? `url::${canonicalUrl}`
            : `${fingerprint(row.company, row.title)}::${normalize(row.location)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((row) => ({
        ...row,
        skills: JSON.parse(row.skills || "[]"),
      })),
  );
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    const [officialBoards, backgroundScan] = await Promise.all([
      refreshOfficialBoards(),
      dispatchGlobalScan(),
    ]);
    return NextResponse.json({ ...officialBoards, backgroundScan });
  }
  if (Object.keys(body).length === 0 || body.action === "refresh") {
    const officialBoards = await refreshOfficialBoards();
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
      },
    });
    const backgroundScan = await dispatchGlobalScan();
    await db.update(scanStatus).set({
      state: backgroundScan.triggered ? "queued" : "failed",
      completedAt: backgroundScan.triggered ? "" : new Date().toISOString(),
      message: backgroundScan.triggered
        ? "美国 ATS 已完成；后台任务已排队，等待美国搜索、核验和回写。"
        : backgroundScan.message,
    }).where(eq(scanStatus.id, 1));
    return NextResponse.json({ ...officialBoards, backgroundScan });
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
  const [existing] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      or(
        eq(jobs.jobUrl, jobUrl),
        eq(jobs.canonicalUrl, canonicalUrl),
        applicationId ? eq(jobs.applicationId, applicationId) : eq(jobs.jobUrl, jobUrl),
      ),
    )
    .limit(1);
  const values = {
    company: String(body.company).trim(),
    title: String(body.title).trim(),
    location: String(body.location ?? "").trim(),
    region: String(body.region).trim(),
    track: String(body.track).trim(),
    score: Math.max(0, Math.min(100, Number(body.score ?? 0))),
    visa: String(body.visa ?? "需人工确认").trim(),
    evidence: String(body.evidence ?? "").trim(),
    description: String(body.description ?? "").trim().slice(0, 50000),
    skills: JSON.stringify(Array.isArray(body.skills) ? body.skills : []),
    jobUrl,
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
