import { NextRequest, NextResponse } from "next/server";

import {
  cleanBookmarkText,
  deriveBookmarkCaptureKey,
  secureBookmarkKeyEqual,
} from "../../../lib/bookmark-capture";

export const dynamic = "force-dynamic";

const SESSION_STORAGE_KEY = "ivy-job-radar:bookmark-payload:v1";
const MAX_PAYLOAD_LENGTH = 180_000;

function safeScriptString(value: string) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function responsePage(title: string, body: string, status = 200) {
  return new NextResponse(`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f2ea;color:#18221d;font-family:Arial,"PingFang SC","Microsoft YaHei",sans-serif}
main{width:min(520px,calc(100% - 40px));padding:28px;border:1px solid #d9d5ca;border-radius:22px;background:#fff;box-shadow:0 18px 55px rgba(28,36,31,.12)}
h1{margin:0 0 10px;font-size:26px}p{margin:0;color:#526058;line-height:1.65}a{display:inline-block;margin-top:18px;border-radius:999px;padding:11px 16px;background:#18221d;color:#fff;text-decoration:none;font-weight:700}
</style>
</head>
<body><main>${body}</main></body>
</html>`, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: NextRequest) {
  // Sign-in resumes browser navigation with GET even when the original capture used POST.
  // The capture page then requests the payload again from the still-open job page.
  return NextResponse.redirect(new URL("/bookmarklet/capture?transport=auth-retry", request.url), 303);
}

export async function POST(request: NextRequest) {
  let serializedPayload = "";
  try {
    const form = await request.formData();
    serializedPayload = String(form.get("payload") || "");
  } catch {
    return responsePage("无法读取岗位", "<h1>没有收到岗位信息</h1><p>请返回招聘页面后重新点击保存书签。</p><a href=\"/bookmarklet\">重新安装书签</a>", 400);
  }

  if (!serializedPayload || serializedPayload.length > MAX_PAYLOAD_LENGTH) {
    return responsePage("无法读取岗位", "<h1>岗位信息不完整</h1><p>页面内容为空或过长，请重新点击保存书签；仍失败时可在确认页手动粘贴核心 JD。</p><a href=\"/bookmarklet\">重新安装书签</a>", 400);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(serializedPayload) as Record<string, unknown>;
  } catch {
    return responsePage("无法读取岗位", "<h1>岗位信息格式错误</h1><p>请重新安装最新版保存岗位书签后再试。</p><a href=\"/bookmarklet\">重新安装书签</a>", 400);
  }

  const { env } = await import("cloudflare:workers");
  const expectedKey = await deriveBookmarkCaptureKey(cleanBookmarkText(env.IVY_JOB_RADAR_SYNC_TOKEN));
  const providedKey = cleanBookmarkText(payload.key, 200);
  if (!expectedKey || !secureBookmarkKeyEqual(expectedKey, providedKey)) {
    return responsePage("书签需要重新安装", "<h1>书签已经失效</h1><p>请回到 Ivy Job Radar 重新拖动最新版“保存岗位”按钮。</p><a href=\"/bookmarklet\">重新安装书签</a>", 401);
  }

  const storedPayload = safeScriptString(JSON.stringify(payload));
  const storageKey = safeScriptString(SESSION_STORAGE_KEY);
  return new NextResponse(`<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>正在读取岗位</title></head>
<body><p>正在读取岗位信息…</p><script>
try {
  sessionStorage.setItem(${storageKey}, ${storedPayload});
  location.replace("/bookmarklet/capture?transport=form");
} catch (error) {
  document.body.innerHTML = "<p>岗位信息暂时无法转交，请关闭窗口后重试。</p>";
}
</script></body>
</html>`, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
