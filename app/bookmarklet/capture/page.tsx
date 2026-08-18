"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type CaptureResult = {
  ok: boolean;
  created: boolean;
  duplicate: boolean;
  company: string;
  title: string;
  jobUrl: string;
  applicationId: string;
};

type PendingApplication = {
  id?: number;
  company?: string;
  title?: string;
  location?: string;
  region?: string;
  jobUrl?: string;
  applicationId?: string;
  priority?: string;
  status?: string;
  source?: string;
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
};

type CaptureMessage = { type?: unknown; payload?: unknown };
type CaptureState =
  | { status: "saving" }
  | { status: "success"; result: CaptureResult }
  | { status: "error"; message: string };

const CHANNEL_NAME = "ivy-job-radar-updates";
const STORAGE_KEY = "ivy-job-radar:last-pending-created";

function inferRegion(payload: CapturePayload) {
  const source = `${payload.addressCountry || ""} ${payload.location || ""}`.toLowerCase();
  return /china|cn|中国|北京|上海|深圳|广州|杭州|南京|成都|武汉|西安|苏州/.test(source) ? "中国" : "美国";
}

function announcePending(application: PendingApplication) {
  const message = { type: "ivy-job-radar-pending-created", application, sentAt: Date.now() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
  } catch {}
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(message);
    window.setTimeout(() => channel.close(), 300);
  }
}

export default function BookmarkCapturePage() {
  const [state, setState] = useState<CaptureState>({ status: "saving" });

  useEffect(() => {
    let active = true;
    let received = false;

    const save = async (payloadValue: unknown) => {
      const payload = (payloadValue && typeof payloadValue === "object" ? payloadValue : {}) as CapturePayload;
      try {
        const response = await fetch("/api/bookmark-capture", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await response.json() as CaptureResult & { error?: string };
        if (!response.ok || !result.ok) throw new Error(result.error || "岗位保存失败。");

        const applicationResponse = await fetch("/api/applications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company: result.company,
            title: result.title,
            region: inferRegion(payload),
            location: payload.location || "",
            track: "",
            jobUrl: result.jobUrl,
            applicationId: result.applicationId || payload.applicationId || "",
            source: "Chrome 手动保存",
            fit: 5,
            interest: 5,
            priority: "P1",
            status: "准备材料",
            discoveredDate: new Date().toISOString().slice(0, 10),
            nextAction: "准备申请材料",
            notes: payload.description || "通过 Chrome 书签从原招聘页面手动保存。",
          }),
        });
        const applicationResult = await applicationResponse.json().catch(() => ({})) as PendingApplication & { error?: string };
        if (!applicationResponse.ok) throw new Error(applicationResult.error || "岗位已保存，但加入待提交申请失败。");

        announcePending(applicationResult);
        if (active) setState({ status: "success", result });
      } catch (error) {
        if (active) setState({ status: "error", message: error instanceof Error ? error.message : "岗位保存失败。" });
      }
    };

    const receive = (event: MessageEvent<CaptureMessage>) => {
      if (received || event.source !== window.opener || event.data?.type !== "ivy-job-radar-capture") return;
      received = true;
      void save(event.data.payload);
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

  return (
    <main style={{ minHeight: "100vh", background: "#f5f2ea", color: "#18221d", display: "grid", placeItems: "center", padding: 24 }}>
      <article style={{ width: "min(520px,100%)", background: "#fff", border: "1px solid #d9d5ca", borderRadius: 22, padding: 30, boxShadow: "0 18px 55px rgba(28,36,31,.12)" }}>
        <div style={{ display: "grid", width: 54, height: 54, placeItems: "center", borderRadius: "50%", background: successful ? "#16794b" : failed ? "#a1372d" : "#d7a638", color: "#fff", fontSize: 28, fontWeight: 850 }}>
          {successful ? "✓" : failed ? "!" : "…"}
        </div>
        <h1 style={{ margin: "20px 0 10px", fontSize: 28 }}>
          {state.status === "saving" ? "正在加入待提交申请" : successful ? "已加入待提交申请" : "保存失败"}
        </h1>
        {successful && <strong style={{ display: "block", marginTop: 16, fontSize: 18 }}>{state.result.company} · {state.result.title}</strong>}
        <p style={{ lineHeight: 1.65, color: "#526058" }}>
          {state.status === "saving"
            ? "正在保存完整岗位信息并建立待提交申请记录。连续保存其他岗位不需要等待。"
            : successful
              ? "该岗位已直接进入待提交申请。打开的 Job Radar 会自动同步，不需要刷新。"
              : state.message}
        </p>
        <Link href="/" style={{ display: "inline-block", marginTop: 18, borderRadius: 999, padding: "12px 18px", background: "#18221d", color: "#fff", textDecoration: "none", fontWeight: 750 }}>返回 Ivy Job Radar</Link>
        <button type="button" onClick={() => window.close()} style={{ marginLeft: 8, border: 0, borderRadius: 999, padding: "12px 18px", background: "#e9e5dc", color: "#18221d", fontWeight: 750, cursor: "pointer" }}>关闭窗口</button>
      </article>
    </main>
  );
}
