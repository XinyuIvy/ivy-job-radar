"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { cvPrebuildStatusView, type CvPrebuildStatus } from "../../lib/cv-prebuild-status";

type WorkspacePayload = {
  job: {
    id: number;
    company: string;
    title: string;
    location: string;
    region: string;
    jobUrl: string;
  };
  prebuild: null | {
    id: string;
    status: CvPrebuildStatus;
    language: string;
    templateFile: string;
    model: string;
    serviceTier: string;
    errorCode: string;
    failureMessage: string;
    updatedAt: string;
    completedAt: string;
    artifacts: { pdf: boolean; tex: boolean; text: boolean; review: boolean };
    usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number };
  };
  messages: Array<{
    id: number;
    role: "user" | "assistant";
    content: string;
    status: "pending" | "completed" | "failed";
    createdAt: string;
  }>;
};

const activeStatuses: CvPrebuildStatus[] = ["preparing_bundle", "agent_queued", "agent_running"];

export default function CvPrebuildWorkspace({ jobId }: { jobId: number }) {
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);

  const loadWorkspace = useCallback(async () => {
    const response = await fetch(`/api/cv-prebuild/status?jobId=${jobId}`, { cache: "no-store" });
    const payload = await response.json() as WorkspacePayload & { error?: string };
    if (!response.ok) throw new Error(payload.error || "CV workspace could not be loaded.");
    setWorkspace(payload);
    setError("");
    setLoading(false);
    return payload;
  }, [jobId]);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const payload = await loadWorkspace();
        if (!disposed && payload.prebuild && activeStatuses.includes(payload.prebuild.status)) {
          timer = setTimeout(refresh, 5_000);
        }
      } catch (caught) {
        if (!disposed) {
          setError(caught instanceof Error ? caught.message : "CV workspace could not be loaded.");
          setLoading(false);
        }
      }
    };
    void refresh();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [loadWorkspace]);

  const startDraft = async () => {
    setStarting(true);
    setError("");
    try {
      const response = await fetch("/api/cv-prebuild/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "CV generation could not be started.");
      await loadWorkspace();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "CV generation could not be started.");
    } finally {
      setStarting(false);
    }
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const content = message.trim();
    if (!content || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/cv-prebuild/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, message: content }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "The revision could not be started.");
      setMessage("");
      await loadWorkspace();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The revision could not be started.");
    } finally {
      setSending(false);
    }
  };

  const statusView = cvPrebuildStatusView(workspace?.prebuild?.status);
  const status = workspace?.prebuild?.status;
  const ready = status === "ready";
  const active = status ? activeStatuses.includes(status) : false;
  const canStart = !status || [
    "queued",
    "blocked_configuration",
    "blocked_missing_jd",
    "stale",
    "failed_retryable",
    "failed_terminal",
    "cancelled",
  ].includes(status);

  return (
    <main className="cv-workspace-shell">
      <header className="cv-workspace-header">
        <Link href="/">← 返回 Job Radar</Link>
        <div>
          <p className="eyebrow">JOB CV WORKSPACE</p>
          <h1>{workspace?.job.title || "岗位 CV"}</h1>
          <p>{workspace ? `${workspace.job.company} · ${workspace.job.location || workspace.job.region}` : "正在读取岗位…"}</p>
        </div>
        {workspace?.job.jobUrl && <a href={workspace.job.jobUrl} target="_blank" rel="noreferrer">打开 JD ↗</a>}
      </header>

      {error && <div className="cv-workspace-error">{error}</div>}
      {loading ? <section className="cv-workspace-loading">正在载入这个岗位的 CV 记录…</section> : (
        <div className="cv-workspace-grid">
          <section className="cv-preview-panel">
            <div className="cv-panel-heading">
              <div><p className="eyebrow">CURRENT DRAFT</p><h2>CV 预览</h2></div>
              {statusView && <span className={`cv-prebuild-badge ${statusView.tone}`}>{statusView.label}</span>}
            </div>

            {ready && workspace?.prebuild?.artifacts.pdf ? (
              <iframe
                className="cv-pdf-frame"
                src={`/api/cv-prebuild/artifact?jobId=${jobId}&kind=pdf`}
                title="当前 CV PDF 预览"
              />
            ) : (
              <div className="cv-preview-empty">
                <strong>{active ? "初稿正在后台生成" : "还没有可预览的初稿"}</strong>
                <p>{active ? "你可以离开这个页面，稍后回来。岗位记录和进度都会保留。" : "生成只会在你点击按钮时调用一次 API。"}</p>
                {!active && workspace?.prebuild?.failureMessage && <p className="cv-prebuild-failure-detail">{workspace.prebuild.failureMessage}</p>}
                {canStart && <button onClick={startDraft} disabled={starting}>{starting ? "正在启动…" : "生成 CV 初稿"}</button>}
              </div>
            )}

            {workspace?.prebuild && (
              <div className="cv-artifact-links">
                {workspace.prebuild.artifacts.pdf && <a href={`/api/cv-prebuild/artifact?jobId=${jobId}&kind=pdf`} target="_blank" rel="noreferrer">打开 PDF</a>}
                {workspace.prebuild.artifacts.tex && <a href={`/api/cv-prebuild/artifact?jobId=${jobId}&kind=tex`}>下载 TeX</a>}
                {workspace.prebuild.artifacts.text && <a href={`/api/cv-prebuild/artifact?jobId=${jobId}&kind=text`}>下载纯文本</a>}
                {workspace.prebuild.artifacts.review && <a href={`/api/cv-prebuild/artifact?jobId=${jobId}&kind=review`}>下载审校记录</a>}
              </div>
            )}
          </section>

          <section className="cv-chat-panel">
            <div className="cv-panel-heading">
              <div><p className="eyebrow">SAVED PER JOB</p><h2>CV Chat</h2></div>
            </div>
            <p className="cv-cost-note">查看、刷新和下载不会生成 API token。只有首次生成，以及你点击发送修改要求时才会调用 API。</p>
            <div className="cv-message-list" aria-live="polite">
              {workspace?.messages.length ? workspace.messages.map((item) => (
                <article className={`cv-message ${item.role}`} key={item.id}>
                  <strong>{item.role === "user" ? "你" : "CV Agent"}</strong>
                  <p>{item.status === "pending" ? "正在生成并审校新版本…" : item.content}</p>
                  {item.status === "failed" && <small>这次生成失败，可以重新发送修改要求。</small>}
                </article>
              )) : <div className="cv-chat-empty">初稿生成后，岗位画像、取舍说明和后续修改都会保存在这里。</div>}
            </div>
            <form className="cv-chat-form" onSubmit={sendMessage}>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="例如：把研究经历压缩一些，突出 Python、临床数据分析和跨团队交付。"
                maxLength={6_000}
                disabled={!ready || sending}
              />
              <button disabled={!ready || sending || !message.trim()}>{sending ? "正在发送…" : "发送修改要求"}</button>
            </form>
            {!ready && <p className="cv-chat-hint">初稿完成后即可继续对话。每个岗位都有自己的独立记录。</p>}
          </section>
        </div>
      )}
    </main>
  );
}
