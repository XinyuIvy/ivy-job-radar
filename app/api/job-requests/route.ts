import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../db";
import { applications, jobRequests } from "../../../db/schema";

export const dynamic = "force-dynamic";

const closedSignals = [
  "job is no longer available",
  "position has been filled",
  "position is no longer available",
  "job has expired",
  "no longer accepting applications",
  "职位已下线",
  "职位已关闭",
  "停止招聘",
  "招聘已结束",
];

const sponsorshipNegativeSignals = [
  "will not sponsor",
  "does not sponsor",
  "not provide sponsorship",
  "without current or future sponsorship",
  "without sponsorship",
  "no sponsorship",
  "不提供签证",
];

const sponsorshipPositiveSignals = [
  "visa sponsorship",
  "sponsorship available",
  "h-1b sponsorship",
  "h1b sponsorship",
  "提供签证",
];

const experiencePattern = /(?:minimum|min\.?|at least|至少)\s*(\d+)\+?\s*(?:years?|年)/gi;

function stripHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function safeJobUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      /^(127|10|0)\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) return null;
    return url;
  } catch {
    return null;
  }
}

async function verifyJob(company: string, title: string, jobUrl: string) {
  const url = safeJobUrl(jobUrl);
  if (!url) {
    return {
      status: "需复核",
      note: "未提供可读取的公开岗位链接，网站无法自动核验。请补充公司官网或招聘页面链接。",
      eligible: false,
    };
  }

  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; IvyJobRadar/1.0; +https://chatgpt.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("text/html")) {
      return {
        status: response.status === 404 || response.status === 410 ? "已关闭" : "需复核",
        note: `岗位页面返回 HTTP ${response.status}，暂时无法确认仍开放。`,
        eligible: false,
      };
    }

    const html = (await response.text()).slice(0, 1_500_000);
    const text = stripHtml(html);
    const lower = text.toLowerCase();
    const companyFound = lower.includes(company.toLowerCase());
    const titleWords = title.toLowerCase().split(/\s+/).filter((word) => word.length > 2);
    const titleHits = titleWords.filter((word) => lower.includes(word)).length;
    const closed = closedSignals.some((signal) => lower.includes(signal));
    const sponsorshipNegative = sponsorshipNegativeSignals.some((signal) => lower.includes(signal));
    const sponsorshipPositive = sponsorshipPositiveSignals.some((signal) => lower.includes(signal));
    const experienceYears = [...lower.matchAll(experiencePattern)].map((match) => Number(match[1]));
    const minimumYears = experienceYears.length ? Math.max(...experienceYears) : null;

    if (closed) {
      return {
        status: "已关闭",
        note: "页面明确显示岗位已关闭、已过期或不再接受申请。",
        eligible: false,
      };
    }

    const identityStrong = titleHits >= Math.max(1, Math.ceil(titleWords.length / 2));
    const evidence = [
      `页面可访问（HTTP ${response.status}）`,
      companyFound ? "页面出现公司名称" : "页面未稳定识别公司名称",
      identityStrong ? "职位名称与页面内容匹配" : "职位名称匹配度不足",
      minimumYears === null ? "未识别到明确最低年限" : `识别到最低经验要求最高为 ${minimumYears} 年`,
      sponsorshipNegative
        ? "JD 出现不提供 sponsorship 的表述"
        : sponsorshipPositive
          ? "JD 出现提供 sponsorship 的表述"
          : "sponsorship 未明确",
    ];

    const eligible = identityStrong && (minimumYears === null || minimumYears <= 3);
    return {
      status: eligible ? "已确认" : "需复核",
      note: evidence.join("；") + "。自动核验基于公开页面文本，申请前仍应打开原 JD 复查。",
      eligible,
      workAuthorization: sponsorshipNegative
        ? "JD 明确不提供 Sponsorship"
        : sponsorshipPositive
          ? "JD 显示可能提供 Sponsorship"
          : "Sponsorship 未明确",
    };
  } catch {
    return {
      status: "需复核",
      note: "岗位页面阻止自动读取或暂时不可访问，需要人工打开原链接确认。",
      eligible: false,
    };
  }
}

export async function GET() {
  const db = await getDb();
  const rows = await db.select().from(jobRequests).orderBy(desc(jobRequests.updatedAt));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const company = String(body.company ?? "").trim();
  const title = String(body.title ?? "").trim();
  if (!company || !title) {
    return NextResponse.json({ error: "Company and job title are required." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const db = await getDb();
  const result = await verifyJob(company, title, String(body.jobUrl ?? "").trim());
  const [created] = await db
    .insert(jobRequests)
    .values({
      company,
      title,
      jobUrl: String(body.jobUrl ?? "").trim(),
      notes: String(body.notes ?? "").trim(),
      status: result.status,
      verificationNote: result.note,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (result.eligible) {
    const jobUrl = String(body.jobUrl ?? "").trim();
    const duplicate = await db
      .select({ id: applications.id })
      .from(applications)
      .where(
        jobUrl
          ? eq(applications.jobUrl, jobUrl)
          : and(eq(applications.company, company), eq(applications.title, title)),
      )
      .limit(1);
    if (duplicate.length === 0) {
      await db.insert(applications).values({
        company,
        title,
        jobUrl,
        status: "待研究",
        source: "岗位核验",
        workAuthorization: result.workAuthorization ?? "Sponsorship 未明确",
        notes: result.note,
        discoveredDate: now.slice(0, 10),
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return NextResponse.json(created, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const id = Number(body.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "A valid request id is required." }, { status: 400 });
  }
  const db = await getDb();
  const [item] = await db.select().from(jobRequests).where(eq(jobRequests.id, id)).limit(1);
  if (!item) return NextResponse.json({ error: "Request not found." }, { status: 404 });

  const result = await verifyJob(item.company, item.title, item.jobUrl);
  const now = new Date().toISOString();
  const [updated] = await db
    .update(jobRequests)
    .set({ status: result.status, verificationNote: result.note, updatedAt: now })
    .where(eq(jobRequests.id, id))
    .returning();

  if (result.eligible) {
    const duplicate = await db
      .select({ id: applications.id })
      .from(applications)
      .where(
        item.jobUrl
          ? eq(applications.jobUrl, item.jobUrl)
          : and(eq(applications.company, item.company), eq(applications.title, item.title)),
      )
      .limit(1);
    if (duplicate.length === 0) {
      await db.insert(applications).values({
        company: item.company,
        title: item.title,
        jobUrl: item.jobUrl,
        status: "待研究",
        source: "岗位核验",
        workAuthorization: result.workAuthorization ?? "Sponsorship 未明确",
        notes: result.note,
        discoveredDate: now.slice(0, 10),
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "A valid request id is required." }, { status: 400 });
  }
  const db = await getDb();
  await db.delete(jobRequests).where(eq(jobRequests.id, id));
  return NextResponse.json({ ok: true });
}
