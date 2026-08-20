"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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

type Stage = "loading" | "review" | "analyzing" | "archiving" | "ready" | "error";

type TemplateChoice = {
  key: string;
  label: string;
  filename: string;
  track: string;
  language: TemplateLanguage;
};

const trackLabels: Record<string, string> = {
  pharma: "Pharma / Biostatistics",
  tech: "Tech / Data Science / Applied ML",
  quant: "Quantitative Research",
  consulting: "Healthcare Consulting",
  clinical_neuro: "脑科学 / 临床数据 / 医疗器械",
};

const templateChoices: TemplateChoice[] = [
  { key: "zh:tech", label: "中文 · Tech / Data Science / Applied ML", filename: "cv_tech_cn.tex", track: "tech", language: "zh" },
  { key: "zh:quant", label: "中文 · Quantitative Research", filename: "cv_quant_cn.tex", track: "quant", language: "zh" },
  { key: "zh:pharma", label: "中文 · Pharma / Biostatistics", filename: "cv_pharma_cn.tex", track: "pharma", language: "zh" },
  { key: "zh:consulting", label: "中文 · Healthcare / Life Sciences Consulting", filename: "cv_healthcare_consulting_cn.tex", track: "consulting", language: "zh" },
  { key: "zh:clinical_neuro", label: "中文 · 脑科学 / 临床数据 / 医疗器械", filename: "cv_clinical_data_neuro_cn.tex", track: "clinical_neuro", language: "zh" },
  { key: "en:tech", label: "English · Tech / Data Science / Applied ML", filename: "cv_tech.tex", track: "tech", language: "en" },
  { key: "en:quant", label: "English · Quantitative Research", filename: "cv_quant.tex", track: "quant", language: "en" },
  { key: "en:pharma", label: "English · Pharma / Biostatistics", filename: "cv_pharma.tex", track: "pharma", language: "en" },
  { key: "en:consulting", label: "English · Healthcare Consulting", filename: "cv_healthcare_consulting.tex", track: "consulting", language: "en" },
];

const stageText: Record<"loading" | "analyzing" | "archiving", string> = {
  loading: "正在读取完整 JD 与申请信息…",
  analyzing: "正在生成 Job Radar 初步匹配…",
  archiving: "正在冻结事实母版、你选择的 CV 母版和申请输入…",
};

function choiceLabel(key: string) {
  return templateChoices.find((choice) => choice.key === key)?.label || "";
}

export default function CvTailorClient() {
  const [application, setApplication] = useState<ApplicationPrefill | null>(null);
  const [archive, setArchive] = useState<ArchiveResult | null>(null);
  const [stage, setStage] = useState<Stage>("loading");
  const [message, setMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [jdDraft, setJdDraft] = useState("");
  const [confirmedJd, setConfirmedJd] = useState("");
  const [jdWasAutoRead, setJdWasAutoRead] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [recommendedTemplateKey, setRecommendedTemplateKey] = useState("");

  const createArchive = useCallback(async (value: ApplicationPrefill, jdInput?: string) => {
    const jd = String(jdInput ?? value.jd).trim();
    if (!jd) {
      setArchive(null);
      setCopied(false);
      setErrorCode("JD_REQUIRED");
      setMessage("请先粘贴完整 JD，再继续。");
      setStage("review");
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
      setConfirmedJd(jd);
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
        const jd = result.jd || "";
        const recommendation = `${result.language}:${result.track}`;
        setApplication(result);
        setRecommendedTemplateKey(templateChoices.some((choice) => choice.key === recommendation) ? recommendation : "");
        setSelectedTemplateKey("");
        setJdDraft(jd);
        setJdWasAutoRead(Boolean(jd.trim()));
        setErrorCode("");
        setMessage(jd.trim()
          ? "系统已读取到 JD。请先明确选择 CV 母版，再核对 JD；只有你确认后才会生成匹配和 Prompt。"
          : "请先明确选择 CV 母版，并在下方手动粘贴完整职位描述和职位要求。");
        setStage("review");
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "申请读取失败");
        setStage("error");
      });
  }, []);

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

  const selectTemplate = (key: string) => {
    setSelectedTemplateKey(key);
    const choice = templateChoices.find((item) => item.key === key);
    if (!choice || !application) return;
    setApplication({ ...application, track: choice.track, language: choice.language });
    setErrorCode("");
  };

  const confirmJdAndCreate = () => {
    if (!application) return;
    if (!selectedTemplateKey) {
      setErrorCode("CV_TEMPLATE_REQUIRED");
      setMessage("请先选择本次定制要使用的 CV 母版。");
      return;
    }
    const jd = jdDraft.trim();
    if (!jd) {
      setErrorCode("JD_REQUIRED");
      setMessage("请先输入完整 JD，再继续。");
      return;
    }

    const nextApplication = { ...application, jd };
    setApplication(nextApplication);
    setConfirmedJd(jd);
    void createArchive(nextApplication, jd);
  };

  const retryArchive = () => {
    if (!application) return;
    if (!selectedTemplateKey) {
      setStage("review");
      setErrorCode("CV_TEMPLATE_REQUIRED");
      setMessage("请先选择本次定制要使用的 CV 母版。");
      return;
    }
    const jd = (confirmedJd || jdDraft || application.jd).trim();
    if (!jd) {
      setStage("review");
      setMessage("请先输入完整 JD，再继续。");
      return;
    }
    void createArchive({ ...application, jd }, jd);
  };

  return <main className="archive-page">
    <div className="archive-shell">
      <header className="archive-header">
        <div>
          <p className="archive-eyebrow">CV TAILOR · HUMAN-REVIEWED WORKFLOW</p>
          <h1>定制 CV 申请档案</h1>
          <p>先选择 CV 母版并确认完整 JD，再生成初步匹配和申请档案。分类复核、内容修改、TeX 与 PDF 都在 Chat 中完成。</p>
        </div>
        <Link href="/">返回申请页</Link>
      </header>

      {application && <section className="application-summary" aria-label="申请信息">
        <div><span>公司</span><strong>{application.company}</strong></div>
        <div><span>岗位</span><strong>{application.title}</strong></div>
        <div><span>系统建议</span><strong>{recommendedTemplateKey ? choiceLabel(recommendedTemplateKey) : `${trackLabels[application.track] || application.track} · ${application.language === "zh" ? "中文" : "English"}`}</strong></div>
      </section>}

      {stage === "review" && application && <section className="jd-review-card" aria-live="polite">
        <div className="jd-review-heading">
          <div>
            <p className="archive-eyebrow">TEMPLATE + JD REVIEW · REQUIRED BEFORE ARCHIVE</p>
            <h2>选择母版并确认完整 JD</h2>
          </div>
          <span className={jdWasAutoRead ? "jd-source auto" : "jd-source manual"}>
            {jdWasAutoRead ? "JD 已读取" : "JD 需补充"}
          </span>
        </div>
        <p className="jd-review-copy">{message}</p>

        <div className="template-picker">
          <label htmlFor="cv-template-choice">CV 母版 <strong>必选</strong></label>
          <select id="cv-template-choice" value={selectedTemplateKey} onChange={(event) => selectTemplate(event.target.value)}>
            <option value="">请选择 CV 母版…</option>
            {templateChoices.map((choice) => <option key={choice.key} value={choice.key}>{choice.label} · {choice.filename}</option>)}
          </select>
          <p>
            Job Radar 只给建议，不会自动替你确认。
            {recommendedTemplateKey ? <> 当前建议：<strong>{choiceLabel(recommendedTemplateKey)}</strong>。</> : null}
            你最终选择的母版才会冻结成 <code>cv_base.tex</code>。
          </p>
        </div>

        <textarea
          id="jd-review"
          value={jdDraft}
          onChange={(event) => setJdDraft(event.target.value)}
          placeholder="在这里粘贴或编辑完整 Job Description，包括职位描述和职位要求…"
          aria-label="确认并编辑完整 JD"
        />
        <div className="jd-review-footer">
          <div>
            <strong>{jdDraft.trim().length.toLocaleString()} 字符</strong>
            <span>{selectedTemplateKey ? `已选择：${choiceLabel(selectedTemplateKey)}` : "尚未选择 CV 母版"}</span>
          </div>
          <button type="button" onClick={confirmJdAndCreate} disabled={!jdDraft.trim() || !selectedTemplateKey}>
            确认母版与 JD 并生成申请档案
          </button>
        </div>
      </section>}

      {(stage === "loading" || stage === "analyzing" || stage === "archiving") && <section className="progress-card" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <div><h2>正在创建申请档案</h2><p>{stageText[stage]}</p></div>
      </section>}

      {stage === "error" && <section className="error-card" aria-live="assertive">
        <p className="archive-eyebrow">需要处理</p>
        <h2>{errorCode === "ARCHIVE_REPOSITORY_REQUIRED" ? "私有归档连接尚未就绪" : "申请档案暂未创建"}</h2>
        <p>{message}</p>
        {errorCode === "ARCHIVE_REPOSITORY_REQUIRED" && <p className="boundary-note">为避免泄露 JD 和定制 CV，系统不会把申请包写入公开的 Job Radar 仓库，也不会改写 CV 母版仓库。</p>}
        {application && <div className="error-actions">
          <button type="button" onClick={() => setStage("review")}>返回检查母版与 JD</button>
          <button type="button" className="secondary-action" onClick={retryArchive}>重试创建</button>
        </div>}
      </section>}

      {stage === "ready" && archive && <>
        <section className="confirmed-jd-card">
          <div className="jd-review-heading">
            <div>
              <p className="archive-eyebrow">CONFIRMED TEMPLATE + JD</p>
              <h2>{archive.existing ? "本次确认的输入" : "已确认并冻结的输入"}</h2>
            </div>
            <span className="jd-source frozen">{archive.existing ? "已存在申请档案" : "已冻结"}</span>
          </div>
          <p className="jd-review-copy">
            {archive.existing
              ? "系统复用了此前已经冻结的申请档案，没有覆盖旧文件。下面保留你本次进入页面时确认的 JD，便于核对。"
              : `本次使用 ${choiceLabel(selectedTemplateKey)}。下面就是本次匹配使用的 JD；申请档案中的 cv_base.tex 与 jd_snapshot.md 均已冻结。`}
          </p>
          <textarea readOnly value={confirmedJd} aria-label="本次确认的完整 JD" />
        </section>

        <div className="ready-grid">
          <section className="ready-card">
            <p className="archive-eyebrow">申请档案已创建</p>
            <h2>{archive.applicationId}</h2>
            <p>{archive.existing ? "已找到此前冻结的同一申请档案，没有重复创建。" : "完整 JD、事实母版、canonical indexes、你明确选择的 CV 母版和初步匹配已冻结。"}</p>
            <dl>
              <div><dt>CV 母版</dt><dd>{choiceLabel(selectedTemplateKey) || "沿用已冻结申请档案中的母版"}</dd></div>
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
        </div>
      </>}
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
      .progress-card,.error-card,.ready-card,.prompt-card,.jd-review-card,.confirmed-jd-card{background:#fffef9;border:1px solid #ddd8ca;border-radius:19px;box-shadow:0 8px 28px rgba(31,44,37,.055)}
      .progress-card{display:flex;align-items:center;gap:17px;padding:24px}
      .progress-card h2,.error-card h2,.ready-card h2,.prompt-card h2,.jd-review-card h2,.confirmed-jd-card h2{font-family:Georgia,serif;margin:0 0 7px}
      .progress-card p,.error-card p,.ready-card p{color:#58655e;line-height:1.65;margin:0}
      .spinner{width:34px;height:34px;border:4px solid #d9eadf;border-top-color:#16794b;border-radius:50%;animation:archive-spin .8s linear infinite;flex:0 0 auto}
      .jd-review-card,.confirmed-jd-card{padding:22px;margin-bottom:18px}
      .jd-review-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
      .jd-review-heading h2{font-size:28px;margin-top:5px}
      .jd-review-copy{color:#58655e;line-height:1.65;margin:5px 0 12px}
      .jd-source{display:inline-flex;align-items:center;border-radius:999px;padding:7px 10px;font-size:11px;font-weight:850;white-space:nowrap}
      .jd-source.auto{background:#e5f2e9;color:#176341}.jd-source.manual{background:#fff1df;color:#8a5a1f}.jd-source.frozen{background:#ebe9e2;color:#536159}
      .template-picker{display:grid;gap:7px;background:#f3f5f0;border:1px solid #d7ddd7;border-radius:13px;padding:14px 15px;margin:12px 0 14px}
      .template-picker label{font-size:13px;font-weight:850}.template-picker label strong{color:#9a3f2d;margin-left:5px}
      .template-picker select{width:100%;box-sizing:border-box;border:1px solid #bfc7bf;border-radius:10px;background:#fff;padding:11px 12px;color:#25332b;font:inherit}
      .template-picker p{margin:0;color:#657067;font-size:12px;line-height:1.55}.template-picker code{font-size:11px}
      .jd-review-card textarea,.confirmed-jd-card textarea{width:100%;min-height:390px;box-sizing:border-box;border:1px solid #cbc6b8;border-radius:11px;background:#fff;color:#25332b;padding:13px;font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}
      .confirmed-jd-card textarea{min-height:260px;background:#f8f7f1}
      .jd-review-footer{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:12px}
      .jd-review-footer div{display:grid;gap:2px}.jd-review-footer strong{font-size:13px}.jd-review-footer span{font-size:12px;color:#68736c}
      .jd-review-footer button,.error-card button,.ready-actions button,.prompt-heading button{border:0;border-radius:11px;background:#16794b;color:#fff;font-weight:850;padding:11px 16px;cursor:pointer}
      .jd-review-footer button:disabled,.error-card button:disabled{opacity:.45;cursor:not-allowed}
      .error-card{padding:24px;border-color:#e5c8bf}
      .error-card h2{margin-top:6px}
      .error-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:15px}.error-actions button{margin:0}
      .secondary-action{background:#fffef9!important;color:#1f5f42!important;border:1px solid #bfc9c1!important}
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
      @media(max-width:820px){.archive-header{display:grid}.application-summary,.ready-grid{grid-template-columns:1fr}.prompt-card textarea{min-height:430px}.jd-review-card textarea{min-height:300px}.jd-review-footer{align-items:stretch;flex-direction:column}.jd-review-footer button{width:100%}}
    `}</style>
  </main>;
}
