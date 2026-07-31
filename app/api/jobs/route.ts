import { desc, eq, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../db";
import { ignoredJobs, jobs } from "../../../db/schema";

export const dynamic = "force-dynamic";

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

const greenhouseBoards = [
  ["OpenAI", "openai"],
  ["Datadog", "datadog"],
  ["Roblox", "roblox"],
  ["Instacart", "instacart"],
  ["Figma", "figma"],
  ["Scale AI", "scaleai"],
  ["Oscar Health", "oscar"],
  ["Flatiron Health", "flatironhealth"],
  ["Recursion", "recursionpharmaceuticals"],
  ["Moderna", "moderna"],
] as const;

const wantedTitles = [
  "data scientist", "applied scientist", "research scientist", "decision scientist",
  "machine learning scientist", "quantitative researcher", "quantitative analyst",
  "statistical scientist", "biostatistician", "epidemiologist", "health economics",
  "outcomes research", "algorithm validation", "imaging scientist",
];

const excludedTitles = [
  "intern", "postdoc", "postdoctoral", "software engineer", "data engineer",
  "machine learning engineer", "nlp", "language model", "generative ai", "llm",
  "director", "vice president",
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
    return amazonId ?? "";
  } catch {
    return "";
  }
}

function classifyTrack(text: string) {
  const lower = text.toLowerCase();
  if (/quantitative researcher|quantitative analyst|systematic/.test(lower)) return "Quant";
  if (/biostat|statistical scientist|clinical trial|epidemiol|health economics|outcomes research/.test(lower)) return "Pharma";
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
  const phdAccepted = /\bph\.?d\.?\b|doctoral|doctorate|博士/.test(lower);
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

async function refreshOfficialBoards() {
  const db = await getDb();
  const ignored = new Set((await db.select().from(ignoredJobs)).map((row) => row.fingerprint));
  const now = new Date().toISOString();
  let scanned = 0;
  let matched = 0;
  for (const [company, token] of greenhouseBoards) {
    try {
      const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`, {
        headers: { Accept: "application/json", "User-Agent": "IvyJobRadar/1.0" },
      });
      if (!response.ok) continue;
      const payload = await response.json() as { jobs?: Array<Record<string, unknown>> };
      for (const raw of payload.jobs ?? []) {
        scanned += 1;
        const title = String(raw.title ?? "").trim();
        if (ignored.has(fingerprint(company, title))) continue;
        const lowerTitle = title.toLowerCase();
        if (!wantedTitles.some((signal) => lowerTitle.includes(signal))) continue;
        if (excludedTitles.some((signal) => lowerTitle.includes(signal))) continue;
        const content = stripHtml(String(raw.content ?? ""));
        const location = String((raw.location as { name?: string } | undefined)?.name ?? "");
        const region = /china|beijing|shanghai|shenzhen|guangzhou/i.test(location) ? "中国" : "美国";
        const years = experienceYears(content);
        const visa = sponsorship(content);
        const skillList = extractSkills(content);
        const scoring = scoreJob(title, content, region, years, visa);
        if (!scoring.eligible) continue;
        const score = scoring.score;
        const evidence = [
          "公司当前职位列表中仍有该岗位",
          ...scoring.details,
        ].join("；");
        const jobUrl = String(raw.absolute_url ?? "");
        if (!jobUrl) continue;
        const canonicalUrl = canonicalizeJobUrl(jobUrl);
        const applicationId = extractApplicationId(jobUrl, raw.id);
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
          company, title, location,
          region,
          track: classifyTrack(`${title} ${content}`),
          score, visa, evidence, skills: JSON.stringify(skillList), jobUrl,
          canonicalUrl, applicationId,
          source: "Greenhouse · 公司公开招聘接口", status: "开放",
          discoveredAt: now, checkedAt: now,
        };
        if (existing) {
          await db.update(jobs).set(values).where(eq(jobs.id, existing.id));
        } else {
          await db.insert(jobs).values(values);
        }
        matched += 1;
      }
    } catch {
      // Continue when one public board is temporarily unavailable.
    }
  }
  return { scanned, matched, verifiedAt: now };
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
  const rows = await db
    .select()
    .from(jobs)
    .where(eq(jobs.status, "开放"))
    .orderBy(desc(jobs.discoveredAt));

  const seen = new Set<string>();
  return NextResponse.json(
    rows
      .filter((row) => !ignored.has(fingerprint(row.company, row.title)))
      .filter((row) => !(row.region === "美国" && row.visa === "明确不支持"))
      .filter((row) => {
        const canonicalUrl = row.canonicalUrl || canonicalizeJobUrl(row.jobUrl);
        const key = row.applicationId
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
    return NextResponse.json(await refreshOfficialBoards());
  }
  if (Object.keys(body).length === 0 || body.action === "refresh") {
    return NextResponse.json(await refreshOfficialBoards());
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
    skills: JSON.stringify(Array.isArray(body.skills) ? body.skills : []),
    jobUrl,
    canonicalUrl,
    applicationId,
    source: String(body.source ?? "公司官网").trim(),
    status: String(body.status ?? "开放").trim(),
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
        skills: JSON.stringify(Array.isArray(body.skills) ? body.skills : []),
        status: String(body.status ?? "开放").trim(),
        checkedAt: now,
      },
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
