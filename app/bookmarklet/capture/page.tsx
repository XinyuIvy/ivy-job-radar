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
type CaptureState = {
  status: "saving" | "success" | "error";
  savedCount: number;
  pendingCount: number;
  result?: CaptureResult;
  message?: string;
};

const CHANNEL_NAME = "ivy-job-radar-updates";
const STORAGE_KEY = "ivy-job-radar:last-pending-created";

function inferRegion(payload: CapturePayload) {
  const source = `${payload.addressCountry || ""} ${payload.location || ""}`.toLowerCase();
  return /china|cn|中国|北京|上海|深圳|广州|杭州|南京|成都|武汉|西安|苏州/.test(source) ? "中国" : "美国";
}

function captureMessageKey(payload: CapturePayload) {
  return payload.captureId || [
    payload.jobUrl,
    payload.applicationId,
    payload.company,
    payload.title,
    payload.location,
    String(payload.description || "").slice(0, 12_000),
  ].join("::");
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
  const [state, setState] = useState<CaptureState>({
    status: "saving",
    savedCount: 0,
    pendingCount: 0,
  });

  useEffect(() => {
    let active = true;
    let receivedAny = false;
    let pendingCount = 0;
    let savedCount = 0;
    let lastResult: CaptureResult | undefined;
    let lastError = "";
    let queue = Promise.resolve();
    const seenMessages = new Set<string>();

    const publishState = () => {
      if (!active) return;
      if (pendingCount > 0) {
        setState({ status: "saving", savedCount, pendingCount, result: lastResult });
      } else if (savedCount > 0) {
        setState({ status: "success", savedCount, pendingCount: 0, result: lastResult });
      } else if (lastError) {
        setState({ status: "error", savedCount: 0, pendingCount: 0, message: lastError });
      }
    };

    const save = async (payload: CapturePayload) => {
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
        savedCount += 1;
        lastResult = result;
        lastError = "";
      } catch (error) {
        lastError = error instanceof Error ? error.message : "岗位保存失败。";
      } finally {
        pendingCount = Math.max(0, pendingCount - 1);
        publishState();
      }
    };

    const receive = (event: MessageEvent<CaptureMessage>) => {
      if (event.data?.type !== "ivy-job-radar-capture") return;
      const payload = (event.data.payload && typeof event.data.payload === "object"
        ? event.data.payload
        : {}) as CapturePayload;
      const key = captureMessageKey(payload);
      if (!key || seenMessages.has(key)) return;

      receivedAny = true;
      seenMessages.add(key);
      pendingCount += 1;
      publishState();
      queue = queue.then(() => save(payload));
    };

    window.addEventListener("message", receive);
    const announce = () => window.opener?.postMessage("ivy-job-radar-ready", "*");
    announce();
    const secondAnnouncement = window.setTimeout(announce, 500);
    const timeout = window.setTimeout(() => {
      if (!receivedAny && active) {
        setState({
          status: "error",
          savedCount: 0,
          pendingCount: 0,
          message: "没有收到招聘页面信息。请返回岗位页并重新点击保存书签。",
        });
      }
    }, 8_000);

    return () => {
      active = false;
      window.removeEventListener("message", receive);
      window.clearTimeout(secondAnnouncement);
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (state.status !== "success" || state.pendingCount > 0) return;
    const timer = window.setTimeout(() => window.close(), 2800);
    return () => window.clearTimeout(timer);
  }, [state.status, state.pendingCount, state.savedCount]);

  const successful = state.status === "success";
  const failed = state.status === "error";
  const heading = state.status === "saving"
    ? state.pendingCount > 1 ? `正在保存 ${state.pendingCount} 个岗位` : "正在加入待提交申请"
    : successful
      ? state.savedCount > 1 ? `已加入 ${state.savedCount} 个待提交申请` : "已加入待提交申请"
      : "保存失败";

  return (
    <main style={{ minHeight: "100vh", background: "#f5f2ea", color: "#18221d", display: "grid", placeItems: "center", padding: 24 }}>
      <article style={{ width: "min(520px,100%)", background: "#fff", border: "1px solid #d9d5ca", borderRadius: 22, padding: 30, boxShadow: "0 18px 55px rgba(28,36,31,.12)" }}>
        <div style={{ display: "grid", width: 54, height: 54, placeItems: "center", borderRadius: "50%", background: successful ? "#16794b" : failed ? "#a1372d" : "#d7a638", color: "#fff", fontSize: 28, fontWeight: 850 }}>
          {successful ? "✓" : failed ? "!" : "…"}
        </div>
        <h1 style={{ margin: "20px 0 10px", fontSize: 28 }}>{heading}</h1>
        {state.result && <strong style={{ display: "block", marginTop: 16, fontSize: 18 }}>{state.result.company} · {state.result.title}</strong>}
        <p style={{ lineHeight: 1.65, color: "#526058" }}>
          {state.status === "saving"
            ? "正在依次保存收到的岗位。连续点击不需要等待，也不会覆盖前一个岗位。"
            : successful
              ? `${state.savedCount} 个岗位已处理并进入待提交申请。打开的 Job Radar 会自动同步。`
              : state.message}
        </p>
        <Link href="/" style={{ display: "inline-block", marginTop: 18, borderRadius: 999, padding: "12px 18px", background: "#18221d", color: "#fff", textDecoration: "none", fontWeight: 750 }}>返回 Ivy Job Radar</Link>
        <button type="button" onClick={() => window.close()} style={{ marginLeft: 8, border: 0, borderRadius: 999, padding: "12px 18px", background: "#e9e5dc", color: "#18221d", fontWeight: 750, cursor: "pointer" }}>关闭窗口</button>
      </article>
    </main>
  );
}
