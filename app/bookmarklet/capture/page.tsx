"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { resolveBookmarkCaptureFields } from "../../lib/bookmark-capture";
import {
  fetchCvTemplateCatalog,
  recommendCvTemplateOption,
  type CvTemplateLanguage,
  type CvTemplateOption,
} from "../../lib/cv-template-catalog";
import { extractCoreJobDescription } from "../../lib/job-description";

type SaveTarget = "pending" | "applied";

type CaptureResult = {
  ok: boolean;
  created: boolean;
  duplicate: boolean;
  jobId: number;
  company: string;
  title: string;
  location: string;
  region: string;
  track: string;
  score: number;
  visa: string;
  evidence: string;
  deadline: string;
  deadlineType: string;
  jobUrl: string;
  applicationId: string;
  description: string;
};

type ApplicationRecord = {
  id: number;
  company: string;
  title: string;
  status: string;
  appliedDate: string;
  archiveId: string;
  resumeVersion: string;
};

type SubmittedTemplateFreezeResult = {
  ok: boolean;
  applicationId: string;
  archivePath: string;
  resumeVersion: string;
  submittedCvFile: string;
  error?: string;
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
  cvLanguage?: CvTemplateLanguage;
  cvTemplateFile?: string;
};

type CaptureMessage = { type?: unknown; payload?: unknown };
type CaptureState =
  | { status: "receiving" }
  | { status: "reviewing"; payload: CapturePayload; title: string; company: string }
  | { status: "saving" }
  | {
    status: "success";
    result: CaptureResult;
    application: ApplicationRecord;
    target: SaveTarget;
    templateFile: string;
  }
  | { status: "error"; message: string };

const LANGUAGE_STORAGE_KEY = "ivy-job-radar:cv-template-language:v1";
const TEMPLATE_STORAGE_KEY = "ivy-job-radar:cv-template-file:v1";
const PENDING_CHANNEL_NAME = "ivy-job-radar-updates";
const PENDING_STORAGE_KEY = "ivy-job-radar:last-pending-created";
const CAPTURE_PAYLOAD_STORAGE_KEY = "ivy-job-radar:bookmark-payload:v1";

function announceApplication(application: ApplicationRecord) {
  const message = {
    type: "ivy-job-radar-pending-created",
    application,
    sentAt: Date.now(),
  };
  try {
    window.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(message));
  } catch {}
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(PENDING_CHANNEL_NAME);
    channel.postMessage(message);
    channel.close();
  } catch {}
}

function readCaptureHashPayload() {
  const encoded = new URLSearchParams(window.location.hash.slice(1)).get("payload");
  if (!encoded) return null;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  const binary = window.atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as CapturePayload;
}

export default function BookmarkCapturePage() {
  const [state, setState] = useState<CaptureState>({ status: "receiving" });
  const [target, setTarget] = useState<SaveTarget>("pending");
  const [language, setLanguage] = useState<CvTemplateLanguage>("zh");
  const [templates, setTemplates] = useState<CvTemplateOption[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState("");
  const [templateFile, setTemplateFile] = useState("");

  const availableTemplateOptions = useMemo(
    () => templates.filter((option) => option.language === language),
    [language, templates],
  );

  const save = async (payload: CapturePayload, title: string, company: string) => {
    if (!templateFile) {
      setState({ status: "error", message: "所选语言没有这个 CV 母版，请重新选择。" });
      return;
    }
    setState({ status: "saving" });
    const confirmedPayload = {
      ...payload,
      title,
      company,
      confirmedFields: true,
      cvLanguage: language,
      cvTemplateFile: templateFile,
    };
    try {
      const response = await fetch("/api/bookmark-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(confirmedPayload),
      });
      const result = await response.json() as CaptureResult & { error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "岗位保存失败。");

      const today = new Date().toISOString().slice(0, 10);
      const desiredStatus = target === "applied" ? "已申请" : "准备材料";
      const applicationResponse = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: result.company,
          title: result.title,
          region: result.region || "中国",
          location: result.location || "",
          track: result.track || "",
          jobUrl: result.jobUrl,
          applicationId: result.applicationId || "",
          source: "Chrome 书签手动加入",
          fit: Math.max(1, Math.min(5, Math.round((result.score || 60) / 20))),
          interest: 3,
          priority: result.score >= 80 ? "P1" : result.score >= 65 ? "P2" : "P3",
          status: desiredStatus,
          deadline: result.deadline || "",
          deadlineType: result.deadlineType || "unknown",
          deadlineSource: result.deadline ? "automatic" : "unknown",
          discoveredDate: today,
          appliedDate: target === "applied" ? today : "",
          nextAction: target === "applied" ? "等待招聘方回复" : "准备申请材料",
          resumeVersion: templateFile,
          workAuthorization: result.region === "美国" ? `Sponsorship：${result.visa || "需人工确认"}` : "中国工作资格",
          notes: result.evidence || "通过 Chrome 书签手动保存。",
          mergeDuplicate: true,
        }),
      });
      let application = await applicationResponse.json() as ApplicationRecord & { error?: string };
      if (!applicationResponse.ok || !application.id) {
        throw new Error(application.error || "申请记录创建失败。");
      }

      if (target === "applied") {
        const freezeResponse = await fetch("/api/cv-tailor/archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicationId: application.id,
            track: result.track,
            language,
            templateFile,
            jdOverride: result.description,
            freezeSubmittedTemplate: true,
          }),
        });
        const frozen = await freezeResponse.json() as SubmittedTemplateFreezeResult;
        if (!freezeResponse.ok || !frozen.ok) {
          throw new Error(`申请记录已保存，但 JD 和 CV 冻结失败：${frozen.error || "请重新保存后重试。"}`);
        }
        application = {
          ...application,
          archiveId: frozen.applicationId,
          resumeVersion: frozen.resumeVersion,
        };
      }

      // Notify open dashboard tabs immediately after the database update.
      announceApplication(application);

      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
        window.localStorage.setItem(TEMPLATE_STORAGE_KEY, templateFile);
      } catch {}
      setState({ status: "success", result, application, target, templateFile });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "岗位保存失败。" });
    }
  };

  useEffect(() => {
    let active = true;
    let received = false;
    let storedPayloadTimer = 0;

    const reviewPayload = (payload: CapturePayload) => {
      if (received) return;
      received = true;
      const review = async () => {
        let reviewedPayload: CapturePayload = { ...payload, description: extractCoreJobDescription(payload.description || "").text };
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

        let nextLanguage: CvTemplateLanguage = "zh";
        let storedTemplate = "";
        try {
          if (window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "en") nextLanguage = "en";
          storedTemplate = window.localStorage.getItem(TEMPLATE_STORAGE_KEY) || "";
        } catch {}
        if (active) {
          setLanguage(nextLanguage);
          setTemplateFile(storedTemplate);
          setState({ status: "reviewing", payload: reviewedPayload, title: fields.title, company: fields.company });
        }
        try {
          const catalog = await fetchCvTemplateCatalog();
          if (!active) return;
          const storedOption = catalog.find((option) => option.filename === storedTemplate && option.language === nextLanguage);
          const recommendation = storedOption || recommendCvTemplateOption(
            catalog,
            nextLanguage,
            `${fields.title} ${reviewedPayload.description || ""}`,
          );
          setTemplates(catalog);
          setTemplateFile(recommendation?.filename || "");
          setTemplatesError("");
        } catch (error) {
          if (active) setTemplatesError(error instanceof Error ? error.message : "CV 母版清单读取失败。");
        } finally {
          if (active) setTemplatesLoading(false);
        }
      };
      void review();
    };

    const receive = (event: MessageEvent<CaptureMessage>) => {
      if (event.source !== window.opener || event.data?.type !== "ivy-job-radar-capture") return;
      const payload = (event.data.payload && typeof event.data.payload === "object" ? event.data.payload : {}) as CapturePayload;
      try {
        window.opener?.postMessage("ivy-job-radar-received", event.origin);
      } catch {}
      reviewPayload(payload);
    };

    window.addEventListener("message", receive);
    try {
      const hashPayload = readCaptureHashPayload();
      const storedPayload = hashPayload ? "" : window.sessionStorage.getItem(CAPTURE_PAYLOAD_STORAGE_KEY);
      if (hashPayload) {
        storedPayloadTimer = window.setTimeout(() => reviewPayload(hashPayload), 0);
      } else if (storedPayload) {
        window.sessionStorage.removeItem(CAPTURE_PAYLOAD_STORAGE_KEY);
        const payload = JSON.parse(storedPayload) as CapturePayload;
        storedPayloadTimer = window.setTimeout(() => reviewPayload(payload), 0);
      }
    } catch {}
    const announce = () => window.opener?.postMessage("ivy-job-radar-ready", "*");
    announce();
    const secondAnnouncement = window.setTimeout(announce, 500);
    const timeout = window.setTimeout(() => {
      const transport = new URLSearchParams(window.location.search).get("transport");
      if (!received && active) setState({
        status: "error",
        message: transport === "auth-retry"
          ? "ChatGPT 登录已经完成，但浏览器没有恢复刚才的岗位信息。请关闭此窗口并在原岗位页再点一次“保存岗位”；后续不会重复登录。"
          : window.opener
          ? "没有收到招聘页面信息。请返回岗位页并重新点击保存书签。"
          : "这个招聘网站阻止了旧版书签传递页面信息。请返回 Job Radar 重新安装最新版“保存岗位”书签。",
      });
    }, 8_000);

    return () => {
      active = false;
      window.removeEventListener("message", receive);
      window.clearTimeout(storedPayloadTimer);
      window.clearTimeout(secondAnnouncement);
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (state.status !== "success") return;
    const timer = window.setTimeout(() => window.close(), 2200);
    return () => window.clearTimeout(timer);
  }, [state]);

  const successful = state.status === "success";
  const failed = state.status === "error";
  const reviewing = state.status === "reviewing";
  const fieldStyle = { width: "100%", boxSizing: "border-box" as const, border: "1px solid #c9c5ba", borderRadius: 12, padding: "12px 13px", color: "#18221d", font: "inherit", background: "#fff" };

  return (
    <main style={{ minHeight: "100vh", background: "#f5f2ea", color: "#18221d", display: "grid", placeItems: "center", padding: 24 }}>
      <article style={{ width: "min(560px,100%)", background: "#fff", border: "1px solid #d9d5ca", borderRadius: 22, padding: 30, boxShadow: "0 18px 55px rgba(28,36,31,.12)" }}>
        <div style={{ display: "grid", width: 54, height: 54, placeItems: "center", borderRadius: "50%", background: successful ? "#16794b" : failed ? "#a1372d" : "#d7a638", color: "#fff", fontSize: 28, fontWeight: 850 }}>
          {successful ? "✓" : failed ? "!" : "…"}
        </div>
        <h1 style={{ margin: "20px 0 10px", fontSize: 28 }}>
          {state.status === "receiving"
            ? "正在读取岗位"
            : reviewing
              ? "确认并保存岗位"
              : state.status === "saving"
                ? "正在保存申请记录"
                : successful
                  ? state.target === "applied" ? "已保存到已申请" : "已保存到待申请"
                  : "保存失败"}
        </h1>
        {reviewing && (
          <form onSubmit={(event) => { event.preventDefault(); void save(state.payload, state.title, state.company); }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 }}>
              {([
                ["pending", "保存到待申请", "尚未提交，之后再处理"],
                ["applied", "保存到已申请", "已提交，记录今天日期"],
              ] as const).map(([value, label, description]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={target === value}
                  onClick={() => setTarget(value)}
                  style={{ border: target === value ? "2px solid #16794b" : "1px solid #c9c5ba", borderRadius: 14, padding: "13px 12px", background: target === value ? "#eef8f2" : "#fff", color: "#18221d", textAlign: "left", cursor: "pointer" }}
                >
                  <strong style={{ display: "block" }}>{label}</strong>
                  <small style={{ display: "block", marginTop: 4, color: "#647169" }}>{description}</small>
                </button>
              ))}
            </div>
            <label style={{ display: "grid", gap: 7, marginTop: 16, fontWeight: 750 }}>
              岗位名称
              <input required value={state.title} onChange={(event) => setState({ ...state, title: event.target.value })} style={fieldStyle} />
            </label>
            <label style={{ display: "grid", gap: 7, marginTop: 14, fontWeight: 750 }}>
              公司
              <input required value={state.company} onChange={(event) => setState({ ...state, company: event.target.value })} style={fieldStyle} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,.75fr) minmax(0,1.5fr)", gap: 12, marginTop: 14 }}>
              <label style={{ display: "grid", gap: 7, fontWeight: 750 }}>
                CV 语言
                <select
                  value={language}
                  onChange={(event) => {
                    const nextLanguage = event.target.value as CvTemplateLanguage;
                    setLanguage(nextLanguage);
                    const recommendation = recommendCvTemplateOption(
                      templates,
                      nextLanguage,
                      `${state.title} ${state.payload.description || ""}`,
                    );
                    setTemplateFile(recommendation?.filename || "");
                  }}
                  style={fieldStyle}
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 7, fontWeight: 750 }}>
                {target === "applied" ? "本次实际使用的 CV 母版" : "计划使用的 CV 母版"}
                <select value={templateFile} onChange={(event) => setTemplateFile(event.target.value)} disabled={templatesLoading || !availableTemplateOptions.length} style={fieldStyle}>
                  {templatesLoading && <option value="">正在读取 GitHub 母版…</option>}
                  {!templatesLoading && !availableTemplateOptions.length && <option value="">当前语言没有可用母版</option>}
                  {availableTemplateOptions.map((option) => <option key={option.filename} value={option.filename}>{option.label} · {option.filename}</option>)}
                </select>
              </label>
            </div>
            <p style={{ margin: "10px 0 0", color: templatesError ? "#a1372d" : "#526058", fontSize: 13 }}>
              {templatesError || (templateFile ? `实时读取到 ${templates.length} 个母版，记录为：${templateFile}` : "正在读取 CV 母版…")}
            </p>
            <label style={{ display: "grid", gap: 7, marginTop: 14, fontWeight: 750 }}>
              核心 JD 预览
              <textarea
                required
                minLength={80}
                value={state.payload.description || ""}
                onChange={(event) => setState({ ...state, payload: { ...state.payload, description: event.target.value } })}
                placeholder="如果页面没有正确暴露 JD，请在这里粘贴岗位职责和任职要求。"
                style={{ ...fieldStyle, minHeight: 180, lineHeight: 1.55, resize: "vertical" }}
              />
            </label>
            <p style={{ lineHeight: 1.6, color: "#526058", fontSize: 14 }}>
              {target === "applied"
                ? "请快速确认公司、岗位和 JD。保存后会创建独立 APP 冻结目录，保存当前 JD、所选母版源文件和实际提交 PDF。"
                : "请快速确认公司、岗位和 JD。所选母版会写入申请记录，不会创建或调用 CV 生成任务。"}
            </p>
            <button type="submit" disabled={templatesLoading || !templateFile} style={{ border: 0, borderRadius: 999, padding: "12px 18px", background: "#16794b", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
              {target === "applied" ? "确认保存到已申请" : "确认保存到待申请"}
            </button>
          </form>
        )}
        {successful && (
          <div style={{ marginTop: 16 }}>
            <strong style={{ display: "block", fontSize: 18 }}>{state.result.company} · {state.result.title}</strong>
            <p style={{ lineHeight: 1.65, color: "#526058" }}>
              {state.target === "applied" ? `申请日期：${state.application.appliedDate || "今天"}。APP 冻结目录：${state.application.archiveId}。` : "该岗位现在位于待申请列表。"}
              <br />CV 母版：{state.templateFile}
            </p>
          </div>
        )}
        {!reviewing && !successful && <p style={{ lineHeight: 1.65, color: "#526058" }}>
          {state.status === "receiving"
            ? "正在从当前招聘页面提取结构化岗位信息。"
            : state.status === "saving"
              ? target === "applied"
                ? "正在保存岗位，并冻结本次 JD 和实际提交的 CV。"
                : "正在保存岗位、申请状态和所选 CV 母版，不会启动 CV 生成。"
              : state.message}
        </p>}
        <Link href="/" style={{ display: "inline-block", marginTop: 18, borderRadius: 999, padding: "12px 18px", background: "#18221d", color: "#fff", textDecoration: "none", fontWeight: 750 }}>返回 Ivy Job Radar</Link>
        <button type="button" onClick={() => window.close()} style={{ marginLeft: 8, border: 0, borderRadius: 999, padding: "12px 18px", background: "#e9e5dc", color: "#18221d", fontWeight: 750, cursor: "pointer" }}>关闭窗口</button>
      </article>
    </main>
  );
}
