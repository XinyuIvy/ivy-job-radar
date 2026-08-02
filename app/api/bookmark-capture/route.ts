import { eq, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../db";
import { ignoredJobs, jobs } from "../../../db/schema";
import {
  BOOKMARK_CAPTURE_SOURCE,
  BOOKMARK_CAPTURE_STATUS,
  bookmarkFingerprint,
  canonicalizeBookmarkJobUrl,
  cleanBookmarkText,
  deriveBookmarkCaptureKey,
  inferBookmarkCompany,
  inferBookmarkRegion,
  inferBookmarkSkills,
  inferBookmarkTrack,
  safeBookmarkJobUrl,
  secureBookmarkKeyEqual,
} from "../../lib/bookmark-capture";

export const dynamic = "force-dynamic";

type CaptureBody = Record<string, unknown>;

function htmlEscape(value: unknown) {
  return cleanBookmarkText(value, 4_000)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function readCaptureBody(request: NextRequest): Promise<CaptureBody> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return await request.json() as CaptureBody;
  }
  const form = await request.formData();
  return Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value)]));
}

function wantsJson(request: NextRequest) {
  return (request.headers.get("accept") ?? "").includes("application/json")
    || (request.headers.get("content-type") ?? "").includes("application/json");
}

function resultPage(options: {
  ok: boolean;
  title: string;
  company?: string;
  jobTitle?: string;
  detail: string;
  status?: number;
}) {
  const tone = options.ok ? "#16794b" : "#a1372d";
  const icon = options.ok ? "✓" : "!";
  const closeScript = options.ok
    ? "setTimeout(() => { if (window.opener) window.close(); }, 2200);"
    : "";
  return new NextResponse(`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${htmlEscape(options.title)}</title>
<style>
  body{margin:0;background:#f5f2ea;color:#18221d;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  main{max-width:560px;margin:10vh auto;padding:28px}
  article{background:#fff;border:1px solid #d9d5ca;border-radius:20px;padding:28px;box-shadow:0 18px 55px rgba(28,36,31,.12)}
  .icon{display:grid;width:52px;height:52px;place-items:center;border-radius:50%;background:${tone};color:#fff;font-size:28px;font-weight:800}
  h1{margin:20px 0 10px;font-size:28px} p{line-height:1.65;color:#526058} strong{display:block;margin-top:18px;font-size:18px}
  a,button{display:inline-block;margin-top:22px;border:0;border-radius:999px;padding:12px 18px;background:#18221d;color:#fff;text-decoration:none;font-weight:700;cursor:pointer}
  button{margin-left:8px;background:#e9e5dc;color:#18221d}
</style>
</head>
<body><main><article>
<div class="icon">${icon}</div>
<h1>${htmlEscape(options.title)}</h1>
${options.company || options.jobTitle ? `<strong>${htmlEscape(options.company)} · ${htmlEscape(options.jobTitle)}</strong>` : ""}
<p>${htmlEscape(options.detail)}</p>
<a href="/">返回 Ivy Job Radar</a><button onclick="window.close()">关闭窗口</button>
</article></main><script>${closeScript}</script></body></html>`, {
    status: options.status ?? (options.ok ? 200 : 400),
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function POST(request: NextRequest) {
  let body: CaptureBody;
  try {
    body = await readCaptureBody(request);
  } catch {
    return wantsJson(request)
      ? NextResponse.json({ error: "Invalid capture payload." }, { status: 400 })
      : resultPage({ ok: false, title: "保存失败", detail: "招聘页面信息无法读取。", status: 400 });
  }

  const { env } = await import("cloudflare:workers");
  const expectedKey = await deriveBookmarkCaptureKey(cleanBookmarkText(env.IVY_JOB_RADAR_SYNC_TOKEN));
  const providedKey = cleanBookmarkText(body.key, 200);
  if (!expectedKey || !secureBookmarkKeyEqual(expectedKey, providedKey)) {
    return wantsJson(request)
      ? NextResponse.json({ error: "Invalid bookmark capture key." }, { status: 401 })
      : resultPage({ ok: false, title: "书签需要重新安装", detail: "此 Chrome 书签已失效。请回到 Ivy Job Radar 重新拖动安装按钮。", status: 401 });
  }

  const rawJobUrl = cleanBookmarkText(body.jobUrl, 4_000);
  const safeUrl = safeBookmarkJobUrl(rawJobUrl);
  const canonicalUrl = canonicalizeBookmarkJobUrl(rawJobUrl);
  if (!safeUrl || !canonicalUrl) {
    return wantsJson(request)
      ? NextResponse.json({ error: "A public HTTP(S) job URL is required." }, { status: 400 })
      : resultPage({ ok: false, title: "保存失败", detail: "当前页面不是可保存的公开 HTTP(S) 招聘链接。", status: 400 });
  }

  const sourcePageTitle = cleanBookmarkText(body.sourcePageTitle, 500);
  const title = cleanBookmarkText(body.title, 500) || sourcePageTitle || "待补充职位名称";
  const company = inferBookmarkCompany(body.company, canonicalUrl);
  const location = cleanBookmarkText(body.location, 500);
  const description = cleanBookmarkText(body.description, 50_000);
  const applicationId = cleanBookmarkText(body.applicationId, 500);
  const region = inferBookmarkRegion(canonicalUrl, location, cleanBookmarkText(body.addressCountry, 200));
  const track = inferBookmarkTrack(title, description);
  const skills = inferBookmarkSkills(title, description);
  const now = new Date().toISOString();
  const evidence = "你通过 Chrome 书签在原招聘页面手动确认并加入；此岗位不经过自动核验。";

  const db = await getDb();
  const duplicateCondition = applicationId
    ? or(eq(jobs.jobUrl, canonicalUrl), eq(jobs.canonicalUrl, canonicalUrl), eq(jobs.applicationId, applicationId))
    : or(eq(jobs.jobUrl, canonicalUrl), eq(jobs.canonicalUrl, canonicalUrl));
  const [existing] = await db.select().from(jobs).where(duplicateCondition).limit(1);

  await db.delete(ignoredJobs).where(or(
    eq(ignoredJobs.jobUrl, rawJobUrl),
    eq(ignoredJobs.jobUrl, canonicalUrl),
    eq(ignoredJobs.fingerprint, bookmarkFingerprint(company, title)),
  ));

  let jobId: number;
  let created = false;
  if (existing) {
    const [updated] = await db.update(jobs).set({
      company: company === "待补充公司" ? existing.company : company,
      title: title === "待补充职位名称" ? existing.title : title,
      location: location || existing.location,
      region,
      track,
      score: Math.max(existing.score, 100),
      visa: region === "中国" ? "不适用" : existing.visa || "JD 未明确",
      evidence,
      description: description.length >= existing.description.length ? description : existing.description,
      skills: skills.length ? JSON.stringify(skills) : existing.skills,
      jobUrl: canonicalUrl,
      canonicalUrl,
      applicationId: applicationId || existing.applicationId,
      source: BOOKMARK_CAPTURE_SOURCE,
      status: BOOKMARK_CAPTURE_STATUS,
      lastSeenAt: now,
      checkedAt: now,
      missedScanCount: 0,
      expirationReason: "",
    }).where(eq(jobs.id, existing.id)).returning();
    jobId = updated.id;
  } else {
    const [inserted] = await db.insert(jobs).values({
      company,
      title,
      location,
      region,
      track,
      score: 100,
      visa: region === "中国" ? "不适用" : "JD 未明确",
      evidence,
      description,
      skills: JSON.stringify(skills),
      jobUrl: canonicalUrl,
      canonicalUrl,
      applicationId,
      source: BOOKMARK_CAPTURE_SOURCE,
      status: BOOKMARK_CAPTURE_STATUS,
      lastSeenAt: now,
      discoveredAt: now,
      checkedAt: now,
    }).returning();
    jobId = inserted.id;
    created = true;
  }

  const result = {
    ok: true,
    created,
    duplicate: !created,
    jobId,
    company,
    title,
    jobUrl: canonicalUrl,
    status: BOOKMARK_CAPTURE_STATUS,
  };
  if (wantsJson(request)) return NextResponse.json(result, { status: created ? 201 : 200 });
  return resultPage({
    ok: true,
    title: created ? "已加入岗位池" : "岗位已存在，信息已更新",
    company,
    jobTitle: title,
    detail: created
      ? "该岗位已直接以“开放”状态加入，不会进入核验队列。"
      : "系统已按链接或职位编号去重，并保留了最新页面信息。",
  });
}
