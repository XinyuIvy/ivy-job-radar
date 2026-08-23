"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { resolveBookmarkCaptureFields } from "../../lib/bookmark-capture";
import { extractCoreJobDescription } from "../../lib/job-description";

type CaptureResult = {
  ok: boolean;
  created: boolean;
  duplicate: boolean;
  jobId: number;
  company: string;
  title: string;
  jobUrl: string;
  applicationId: string;
  description: string;
  location?: string;
};

type CapturePayload = {
  company?: string;
  title?: string;
  location?: string;
  applicationId?: string;
  description?: string;
  jobUrl?: string;
  addressCountry?: string;
  captureId?: string;
  bookmarkVersion?: string;
  titleCandidates?: Array<{ source?: string; value?: string }>;
  companyCandidates?: Array<{ source?: string; value?: string }>;
  confirmedFields?: boolean;
  key?: string;
  sourcePageTitle?: string;
};

type CaptureMessage = { type?: unknown; payload?: unknown };
type CaptureState =
  | { status: "receiving" }
  | { status: "reviewing"; payload: CapturePayload; title: string; company: string }
  | { status: "saving" }
  | { status: "success"; result: CaptureResult }
  | { status: "error"; message: string };

export default function BookmarkCapturePage() {
  const [state, setState] = useState<CaptureState>({ status: "receiving" });

  const save = async (payload: CapturePayload, title: string, company: string) => {
    setState({ status: "saving" });
    const confirmedPayload = { ...payload, title, company, confirmedFields: true };
    try {
      const response = await fetch("/api/bookmark-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(confirmedPayload),
      });
      const result = await response.json() as CaptureResult & { error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "岗位保存失败。");

      const savedResponse = await fetch("/api/saved-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: result.jobId }),
      });
      const savedResult = await savedResponse.json().catch(() => ({})) as { error?: string };
      if (!savedResponse.ok) throw new Error(savedResult.error || "岗位已加入岗位池，但写入收藏失败。");

      setState({ status: "success", result });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "岗位保存失败。" });
    }
  };

  useEffect(() => {
    let active = true;
    let received = false;

    const receive = (event: MessageEvent<CaptureMessage>) => {
      if (received || event.source !== window.opener || event.data?.type !== "ivy-job-radar-capture") return;
      received = true;
      const payload = (event.data.payload && typeof event.data.payload === "object" ? event.data.payload : {}) as CapturePayload;
      const review = async () => {
        let reviewedPayload: CapturePayload = {
          ...payload,
          description: extractCoreJobDescription(payload.description || "").text,
        };
        let fields = resolveBookmarkCaptureFields(reviewedPayload);
        try {
          const hostname = new URL(payload.jobUrl || "").hostname.toLowerCase();
          if (hostname === "talent.baidu.com") {
            const response = await fetch("/api/bookmark-capture", {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({ ...payload, previewOnly: true }),
            });
            const preview = await response.json() as CaptureResult & { error?: string };
            if (response.ok && preview.ok) {
              reviewedPayload = {
                ...payload,
                title: preview.title,
                company: preview.company,
                location: preview.location || payload.location,
                applicationId: preview.applicationId || payload.applicationId,
                description: preview.description,
              };
              fields = { title: preview.title, company: preview.company };
            }
          }
        } catch {
          // Keep the browser-extracted content when the server fallback is temporarily unavailable.
        }
        if (active) setState({ status: "reviewing", payload: reviewedPayload, title: fields.title, company: fields.company });
      };
      void review();
    };

    window.addEventListener("message", receive);
    const announce = () => window.opener?.postMessage("ivy-job-radar-ready", "*");
    announce();
    const secondAnnouncement = window.setTimeout(announce, 500);
    const timeout = window.setTimeout(() => {
      if (!received && active) setState({ status: "error", message: "没有收到招聘页面信息。请返回岗位页并重新点击保存书签。" });
    }, 8_000);

    return () => {
      active = false;
      window.removeEventListener("message", receive);
      window.clearTimeout(secondAnnouncement);
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (state.status !== "success") return;
    const timer = window.setTimeout(() => window.close(), 1600);
    return () => window.clearTimeout(timer);
  }, [state.status]);

  const successful = state.status === "success";
  const failed = state.status === "error";
  const reviewing = state.status === "reviewing";

  return (
    <main style={{ minHeight: "100vh", background: "#f5f2ea", color: "#18221d", display: "grid", placeItems: "center", padding: 24 }}>
      <article style={{ width: "min(520px,100%)", background: "#fff", border: "1px solid #d9d5ca", borderRadius: 22, padding: 30, boxShadow: "0 18px 55px rgba(28,36,31,.12)" }}>
        <div style={{ display: "grid", width: 54, height: 54, placeItems: "center", borderRadius: "50%", background: successful ? "#16794b" : failed ? "#a1372d" : "#d7a638", color: "#fff", fontSize: 28, fontWeight: 850 }}>
          {successful ? "✓" : failed ? "!" : "…"}
        </div>
        <h1 style={{ margin: "20px 0 10px", fontSize: 28 }}>
          {state.status === "receiving" ? "正在读取岗位" : reviewing ? "确认岗位信息" : state.status === "saving" ? "正在加入收藏" : successful ? "已加入收藏" : "保存失败"}
        </h1>
        {reviewing && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save(state.payload, state.title, state.company);
            }}
          >
            <label style={{ display: "grid", gap: 7, marginTop: 18, fontWeight: 750 }}>
              岗位名称
              <input
                required
                value={state.title}
                onChange={(event) => setState({ ...state, title: event.target.value })}
                style={{ width: "100%", boxSizing: "border-box", border: "1px solid #c9c5ba", borderRadius: 12, padding: "12px 13px", color: "#18221d", font: "inherit" }}
              />
            </label>
            <label style={{ display: "grid", gap: 7, marginTop: 14, fontWeight: 750 }}>
              公司
              <input
                required
                value={state.company}
                onChange={(event) => setState({ ...state, company: event.target.value })}
                style={{ width: "100%", boxSizing: "border-box", border: "1px solid #c9c5ba", borderRadius: 12, padding: "12px 13px", color: "#18221d", font: "inherit" }}
              />
            </label>
            <label style={{ display: "grid", gap: 7, marginTop: 14, fontWeight: 750 }}>
              核心 JD 预览
              <textarea
                required
                minLength={80}
                value={state.payload.description || ""}
                onChange={(event) => setState({
                  ...state,
                  payload: { ...state.payload, description: event.target.value },
                })}
                placeholder="如果页面没有正确暴露 JD，请在这里粘贴岗位职责和任职要求。"
                style={{ width: "100%", minHeight: 220, boxSizing: "border-box", border: "1px solid #c9c5ba", borderRadius: 12, padding: "12px 13px", color: "#18221d", font: "inherit", lineHeight: 1.55, resize: "vertical" }}
              />
            </label>
            <p style={{ lineHeight: 1.65, color: "#526058" }}>系统已尝试截掉页面导航、推荐职位、隐私条款和页脚。请快速确认正文开头与结尾，必要时可直接修改。你在这里修改的内容会作为最终值，CV 只会读取这里的内容。</p>
            <button type="submit" style={{ border: 0, borderRadius: 999, padding: "12px 18px", background: "#16794b", color: "#fff", fontWeight: 800, cursor: "pointer" }}>确认并保存</button>
          </form>
        )}
        {successful && <strong style={{ display: "block", marginTop: 16, fontSize: 18 }}>{state.result.company} · {state.result.title}</strong>}
        {!reviewing && <p style={{ lineHeight: 1.65, color: "#526058" }}>
          {state.status === "receiving"
            ? "正在从当前招聘页面提取结构化岗位信息。"
            : state.status === "saving"
            ? "正在保存完整岗位信息并写入收藏，不会创建 CV 任务。"
            : successful
              ? "该岗位已进入收藏。只有之后点击“进入待申请”才会创建 CV 任务。"
              : state.message}
        </p>}
        <Link href="/" style={{ display: "inline-block", marginTop: 18, borderRadius: 999, padding: "12px 18px", background: "#18221d", color: "#fff", textDecoration: "none", fontWeight: 750 }}>返回 Ivy Job Radar</Link>
        <button type="button" onClick={() => window.close()} style={{ marginLeft: 8, border: 0, borderRadius: 999, padding: "12px 18px", background: "#e9e5dc", color: "#18221d", fontWeight: 750, cursor: "pointer" }}>关闭窗口</button>
      </article>
    </main>
  );
}
