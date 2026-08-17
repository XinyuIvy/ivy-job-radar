"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type TemplateLanguage = "en" | "zh";

type ApplicationPrefill = {
  applicationId: number;
  company: string;
  title: string;
  track: string;
  language: TemplateLanguage;
  region: string;
  location: string;
  jd: string;
};

type ArchiveResult = {
  ok: true;
  existing: boolean;
  applicationId: string;
  archivePath: string;
  prompt: string;
  repositoryUrl: string;
};

type Stage = "loading" | "analyzing" | "archiving" | "ready" | "error";

const trackLabels: Record<string, string> = {
  pharma: "Pharma / Biostatistics",
  tech: "Tech / Data Science / Applied ML",
  quant: "Quantitative Research",
  consulting: "Healthcare Consulting",
  clinical_neuro: "脑科学 / 临床数据 / 医疗器械",
};

const stageText: Record<Exclude<Stage, "ready" | "error">, string> = {
  loading: "正在读取完整 JD 与申请信息…",
  analyzing: "正在生成 Job Radar 初步匹配…",
  archiving: "正在冻结事实母版、行业 CV 母版和申请输入…",
};

export default function CvTailorClient() {
  const [application, setApplication] = useState<ApplicationPrefill | null>(null);
  const [archive, setArchive] = useState<ArchiveResult | null>(null);
  const [stage, setStage] = useState<Stage>("loading");
  const [message, setMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [manualJd, setManualJd] = useState("");
  const [copied, setCopied] = useState(false);
  const startedFor = useRef<number | null>(null);

  const createArchive = useCallback(async (value: ApplicationPrefill) => {
    const jd = value.jd.trim();
    if (!jd) {
      setArchive(null);
      setCopied(false);
      setErrorCode("JD_REQUIRED");
      setMessage("系统没有读取到完整 JD。请手动粘贴完整 JD 后创建申请档案。");
      setStage("error");
      return;
    }

    setArchive(null);
    setCopied(false);
    setErrorCode("");
    setStage("analyzing");
    setMessage("");
    try {
      const analysisResponse = await fetch("/api/cv-tailor/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track: value.track, language: value.language, jd }),
      });
      const analysis = await analysisResponse.json() as { error?: string; code?: string } & Record<string, unknown>;
      if (!analysisResponse.ok) {
        setErrorCode(String(analysis.code || ""));
        throw new Error(String(analysis.error || "初步匹配失败"));
      }

      setStage("archiving");
      const archiveResponse = await fetch("/api/cv-tailor/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: value.applicationId, track: value.track, language: value.language, jdOverride: jd, analysis }),
      });
      const result = await archiveResponse.json() as ArchiveResult & { error?: string; code?: string };
      if (!archiveResponse.ok) {
        setErrorCode(String(result.code || ""));
        throw new Error(String(result.error || "申请档案创建失败"));
      }
      setArchive(result);
      setStage("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "申请档案创建失败");
      setStage("error");
    }
  }, []);

  useEffect(() => {
    const rawId = new URLSearchParams(window.location.search).get("applicationId");
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) {
      setMessage("缺少有效的待提交申请 ID。请从待提交申请卡片点击“定制 CV”。");
      setStage("error");
      return;
    }
    fetch(`/api/cv-tailor/application?applicationId=${id}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as ApplicationPrefill & { error?: string };
        if (!response.ok) throw new Error(result.error || "无法读取申请");
        return result;
      })
      .then((result) => {
        setApplication(result);
        setManualJd(result.jd || "");
        if (!result.jd.trim()) {
          setErrorCode("JD_REQUIRED");
          setMessage("系统没有读取到完整 JD。请手动粘贴完整 JD 后创建申请档案。");
          setStage("error");
          return;
        }
        if (startedFor.current !== result.applicationId) {
          startedFor.current = result.applicationId;
          void createArchive(result);
        }
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "申请读取失败");
        setStage("error");
      });
  }, [createArchive]);

  const copyPrompt = async () => {
    if (!archive?.prompt) return;
    try {
      await navigator.clipboard.writeText(archive.prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setMessage("浏览器未允许自动复制。请在下方 Prompt 中全选并复制。");
    }
  };

  const createFromManualJd = () => {
    if (!application) return;
    const jd = manualJd.trim();
    if (!jd) {
      setErrorCode("JD_REQUIRED");
      setMessage("请先粘贴完整 JD，再创建申请档案。");
      return;
    }
    const nextApplication = { ...application, jd };
    setApplication(nextApplication);
    void createArchive(nextApplication);
  };

  return <main className="archive-page">
    <div className="archive-shell">
      <header className="archive-header">
        <div>
          <p className="archive-eyebrow">CV TAILOR · HUMAN-REVIEWED WORKFLOW</p>
          <h1>定制 CV 申请档案</h1>
          <p>Job Radar 只准备完整输入和初步匹配。分类复核、内容修改、TeX 与 PDF 都在 Chat 中完成。</p>
        </div>
        <Link href="/">返回申请页</Link>
      </header>

      {application && <section className="application-summary" aria-label="申请信息">
        <div><span>公司</span><strong>{application.company}</strong></div>
        <div><span>岗位</span><strong>{application.title}</strong></div>
        <div><span>母版</span><strong>{trackLabels[application.track] || application.track} · {application.language === "zh" ? "中文" : "English"}</strong></div>
      </section>}

      {stage !== "ready" && stage !== "error" && <section className="progress-card" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <div><h2>正在创建申请档案</h2><p>{stageText[stage]}</p></div>
      </section>}

      {stage === "error" && <section className="error-card" aria-live="assertive">
        <p className="archive-eyebrow">需要处理</p>
        <h2>{errorCode === "ARCHIVE_REPOSITORY_REQUIRED" ? "私有归档连接尚未就绪" : errorCode === "JD_REQUIRED" ? "需要补充完整 JD" : "申请档案暂未创建"}</h2>
        <p>{message}</p>
        {errorCode === "JD_REQUIRED" && application && <div className="manual-jd-card">
          <label htmlFor="manual-jd">完整 JD</label>
          <p>把招聘页面中的职位描述和职位要求完整粘贴到这里。系统会用这份文本做初步匹配，并将同一份 JD 冻结进申请档案。</p>
          <textarea
            id="manual-jd"
            value={manualJd}
            onChange={(event) => setManualJd(event.target.value)}
            placeholder="在这里粘贴完整 Job Description…"
            aria-label="手动输入完整 JD"
          />
          <button type="button" onClick={createFromManualJd} disabled={!manualJd.trim()}>使用此 JD 创建申请档案</button>
        </div>}
        {errorCode === "ARCHIVE_REPOSITORY_REQUIRED" && <p className="boundary-note">为避免泄露 JD 和定制 CV，系统不会把申请包写入公开的 Job Radar 仓库，也不会改写 CV 母版仓库。</p>}
        {application && errorCode !== "JD_REQUIRED" && <button type="button" onClick={() => void createArchive(application)}>重试创建</button>}
      </section>}

      {stage === "ready" && archive && <div className="ready-grid">
        <section className="ready-card">
          <p className="archive-eyebrow">申请档案已创建</p>
          <h2>{archive.applicationId}</h2>
          <p>{archive.existing ? "已找到此前冻结的同一申请档案，没有重复创建。" : "完整 JD、事实母版、canonical indexes、当前行业 CV 母版和初步匹配已冻结。"}</p>
          <dl>
            <div><dt>申请目录</dt><dd>{archive.archivePath}</dd></div>
            <div><dt>下一步</dt><dd>复制 Prompt 到新的 Work / Codex Chat</dd></div>
          </dl>
          <div className="ready-actions">
            <button type="button" onClick={() => void copyPrompt()}>{copied ? "已复制" : "复制 Prompt"}</button>
            <a href={archive.repositoryUrl} target="_blank" rel="noreferrer noopener">查看申请档案 ↗</a>
          </div>
        </section>

        <section className="prompt-card">
          <div className="prompt-heading"><h2>复制到 Chat 的 Prompt</h2><button type="button" onClick={() => void copyPrompt()}>{copied ? "已复制" : "复制"}</button></div>
          <textarea readOnly value={archive.prompt} aria-label="复制到 Chat 的 Prompt" />
        </section>
      </div>}
    </div>
    <style>{`
      .archive-page{min-height:100vh;background:#f5f2e9;color:#1f2c25;padding:28px 18px 90px}
      .archive-shell{max-width:1120px;margin:0 auto}
      .archive-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:22px}
      .archive-header h1{font:700 clamp(34px,6vw,58px)/1.08 Georgia,serif;margin:5px 0 8px}
      .archive-header p{color:#56645c;line-height:1.65;max-width:760px;margin:0}
      .archive-header a{color:#16794b;font-weight:800;white-space:nowrap}
      .archive-eyebrow{letter-spacing:.13em!important;font-size:11px!important;font-weight:850!important;color:#16794b!important;margin:0!important}
      .application-summary{display:grid;grid-template-columns:1fr 1.35fr 1fr;gap:1px;background:#d9d4c7;border:1px solid #d9d4c7;border-radius:16px;overflow:hidden;margin-bottom:18px}
      .application-summary div{display:grid;gap:5px;background:#fffef9;padding:15px 17px}
      .application-summary span{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#6a746d;font-weight:800}
      .application-summary strong{line-height:1.45}
      .progress-card,.error-card,.ready-card,.prompt-card{background:#fffef9;border:1px solid #ddd8ca;border-radius:19px;box-shadow:0 8px 28px rgba(31,44,37,.055)}
      .progress-card{display:flex;align-items:center;gap:17px;padding:24px}
      .progress-card h2,.error-card h2,.ready-card h2,.prompt-card h2{font-family:Georgia,serif;margin:0 0 7px}
      .progress-card p,.error-card p,.ready-card p{color:#58655e;line-height:1.65;margin:0}
      .spinner{width:34px;height:34px;border:4px solid #d9eadf;border-top-color:#16794b;border-radius:50%;animation:archive-spin .8s linear infinite;flex:0 0 auto}
      .error-card{padding:24px;border-color:#e5c8bf}
      .error-card h2{margin-top:6px}
      .error-card button,.ready-actions button,.prompt-heading button{border:0;border-radius:11px;background:#16794b;color:#fff;font-weight:850;padding:11px 16px;cursor:pointer;margin-top:15px}
      .error-card button:disabled{opacity:.45;cursor:not-allowed}
      .manual-jd-card{margin-top:18px;padding:16px;background:#f6f5ef;border:1px solid #ddd8ca;border-radius:14px}
      .manual-jd-card label{display:block;font-weight:850;margin-bottom:5px}
      .manual-jd-card p{font-size:13px;margin-bottom:10px}
      .manual-jd-card textarea{width:100%;min-height:300px;box-sizing:border-box;border:1px solid #cbc6b8;border-radius:11px;background:#fff;color:#25332b;padding:13px;font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}
      .manual-jd-card button{margin-top:11px}
      .boundary-note{background:#fff1e9;border-radius:10px;padding:11px 13px;margin-top:12px!important;color:#744333!important}
      .ready-grid{display:grid;grid-template-columns:minmax(320px,.72fr) minmax(460px,1.28fr);gap:18px}
      .ready-card,.prompt-card{padding:22px}
      .ready-card h2{font-size:31px;margin-top:6px;word-break:break-word}
      .ready-card dl{display:grid;gap:10px;margin:20px 0}
      .ready-card dl div{padding:11px 12px;background:#f3f5f0;border-radius:10px}
      .ready-card dt{font-size:11px;font-weight:850;color:#657067;text-transform:uppercase;letter-spacing:.08em}
      .ready-card dd{margin:4px 0 0;line-height:1.45;word-break:break-word}
      .ready-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
      .ready-actions button{margin:0}
      .ready-actions a{border:1px solid #bfc9c1;border-radius:11px;padding:10px 14px;color:#1f5f42;font-weight:800;text-decoration:none}
      .prompt-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .prompt-heading button{margin:0;padding:8px 13px}
      .prompt-card textarea{width:100%;min-height:560px;box-sizing:border-box;border:1px solid #d5d0c3;border-radius:12px;background:#f8f7f1;color:#25332b;padding:14px;font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical;margin-top:10px}
      @keyframes archive-spin{to{transform:rotate(360deg)}}
      @media(max-width:820px){.archive-header{display:grid}.application-summary,.ready-grid{grid-template-columns:1fr}.prompt-card textarea{min-height:430px}.manual-jd-card textarea{min-height:240px}}
    `}</style>
  </main>;
}
