"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Match = {
  keyword: string;
  category: string;
  status: "covered" | "supported_gap" | "unsupported_gap";
  factEvidence: string;
  jdEvidence?: string;
  templateEvidence?: string;
};

type Analysis = {
  matches: Match[];
  summary: { required: number; covered: number; supportedGaps: number; unsupportedGaps: number };
};

type ApplicationPrefill = {
  applicationId: number;
  company: string;
  title: string;
  track: string;
  jd: string;
  applicationStatus: string;
};

type PublishResult = {
  tex?: string;
  pullRequestUrl?: string;
  message?: string;
  error?: string;
};

const trackLabels: Record<string, string> = {
  pharma: "Pharma / Biostatistics",
  tech: "Tech / Data Science",
  quant: "Quantitative Research",
  consulting: "Healthcare Consulting",
};

const explanations: Record<string, string> = {
  "Wearable and physiological data": "岗位希望候选人能够处理可穿戴设备、数字测量、日记或生理信号等高频健康数据。这里不是要求把这句话原样放进 Skills，而是要用最合适的项目证明你处理过相近的数据结构和科学问题。",
  "Clinical and multimodal data": "岗位希望候选人能够联合解释临床、影像或其他多来源数据，并将复杂分析转化为健康研究结论。",
  "Scientific study design": "岗位要求从研究问题出发设计观察性、前瞻性、回顾性或干预性研究，包括研究方案、终点和分析设计。",
  "Human-subjects research": "岗位强调人体研究流程，包括 protocol、endpoint、ethics 或 IRB，以及从研究设计到科学传播的完整过程。",
  "Time-series analysis": "岗位需要分析按时间连续或重复采集的数据，而不是只分析单次横断面观测。",
  "Regression and mixed models": "岗位希望使用回归、混合模型或相关重复测量方法处理个体内相关性和多层数据。",
  "Bayesian methods": "岗位把 Bayesian methods 列为可采用的方法之一。只有事实母版中有真实应用证据时才应写入项目或方法描述。",
  "Machine learning": "岗位允许在适当场景采用机器学习，重点是能否将模型用于严谨、可解释的科学分析，而不是只罗列算法。",
  "Reproducible computational workflows": "岗位要求分析过程可复现，例如使用 notebook、Git、RStudio、Jupyter、Docker 或 Conda 组织代码、结果和版本。",
  "Manuscripts and scientific dissemination": "岗位重视论文、摘要、报告、图表和演示等科学传播成果。",
  "Research leadership from hypothesis to publication": "岗位要求能够从假设、研究设计和分析一路推进到论文发表，并最好有第一作者或主导项目证据。",
  "Cross-functional collaboration": "岗位要求与 Science、Product、Clinical、Regulatory、Research Operations 和数据团队协作。",
  "Evidence-based decision support": "岗位希望把复杂分析转化为可用于研究、产品或合作决策的清晰结论。",
};

function suggestionLocation(item: Match) {
  if (item.category === "Programming and Data") return "Technical Skills，前提是该技能尚未覆盖；若已覆盖则不应重复添加。";
  if (["Research Design", "Data", "Methods", "Domain"].includes(item.category)) return "优先放入最相关项目的 bullet，并视需要调整项目选择和排序。";
  if (["Communication", "Leadership", "Collaboration", "Decision Support", "Experience"].includes(item.category)) return "优先改写 Summary 或相关项目 bullet，用成果和职责证明，而不是作为孤立关键词。";
  return "根据事实证据决定放入 Summary、项目 bullet 或 Skills，不直接机械加词。";
}

function cleanEvidence(value: string) {
  return value.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

function safeSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "") || "tailored-cv";
}

function downloadText(filename: string, content: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.focus();
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("浏览器拒绝访问剪贴板。");
}

export default function CvTailorClient() {
  const [applicationId, setApplicationId] = useState<number | null>(null);
  const [track, setTrack] = useState("pharma");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [jd, setJd] = useState("");
  const [template, setTemplate] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingApplication, setLoadingApplication] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");
  const [tex, setTex] = useState("");
  const [pullRequestUrl, setPullRequestUrl] = useState("");

  useEffect(() => {
    let active = true;
    const id = Number(new URLSearchParams(window.location.search).get("applicationId"));
    if (!Number.isInteger(id)) {
      setLoadingApplication(false);
      return () => { active = false; };
    }
    fetch(`/api/cv-tailor/application?applicationId=${id}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "无法读取这条待提交申请。");
        return result as ApplicationPrefill;
      })
      .then((result) => {
        if (!active) return;
        setApplicationId(result.applicationId);
        setCompany(result.company);
        setTitle(result.title);
        setTrack(result.track);
        setJd(result.jd);
        if (!result.jd) setMessage("该申请暂未保存完整 JD，请先在岗位记录中补齐后再分析。");
        setLoadingApplication(false);
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "申请读取失败。");
        setLoadingApplication(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const resetTimer = window.setTimeout(() => {
      if (!active) return;
      setLoading(true);
      setAnalysis(null);
      setAcceptedSuggestions([]);
      setTex("");
      setPullRequestUrl("");
    }, 0);
    fetch(`/api/cv-tailor/source?track=${encodeURIComponent(track)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "CV 母版读取失败");
        return result;
      })
      .then((result) => {
        if (!active) return;
        setTemplate(result.template || "");
        setLoading(false);
      })
      .catch((error) => {
        if (!active) return;
        setTemplate("");
        setMessage(error instanceof Error ? error.message : "CV 母版读取失败");
        setLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(resetTimer);
    };
  }, [track]);

  const analyze = async () => {
    if (!jd.trim()) { setMessage("该申请没有完整 JD，暂时无法分析。"); return; }
    setAnalyzing(true);
    setMessage("正在分析完整 JD、母版覆盖和事实证据…");
    try {
      const response = await fetch("/api/cv-tailor/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track, jd }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "关键词分析失败。");
      setAnalysis(result as Analysis);
      setAcceptedSuggestions([]);
      setMessage("分析完成。可补充项需要先加入修改清单，再确认如何写入 CV。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "关键词分析失败。");
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleSuggestion = (keyword: string) => {
    setAcceptedSuggestions((current) => {
      const exists = current.includes(keyword);
      const next = exists ? current.filter((item) => item !== keyword) : [...current, keyword];
      setMessage(exists ? `已从修改清单移除：${keyword}` : `已加入修改清单：${keyword}。下一步需要确认项目和具体措辞。`);
      return next;
    });
  };

  const publish = async () => {
    if (!template.trim()) { setMessage("CV 内容为空，无法生成文件。"); return; }
    setPublishing(true);
    setPullRequestUrl("");
    setMessage("正在生成 LaTeX，并尝试创建 GitHub 分支和 PR…");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch("/api/cv-tailor/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, company, title, track, markdown: template, jd }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({})) as PublishResult;
      if (!response.ok) throw new Error(result.error || `生成失败，服务器返回 ${response.status}。`);
      setTex(result.tex || "");
      setPullRequestUrl(result.pullRequestUrl || "");
      setMessage(result.pullRequestUrl
        ? "LaTeX 已生成，GitHub PR 已创建。请打开 PR 检查后再合并。"
        : `LaTeX 已生成，但未创建 PR：${result.message || "Site 尚未配置 CV_GITHUB_TOKEN。"}`);
    } catch (error) {
      const detail = error instanceof DOMException && error.name === "AbortError"
        ? "生成请求超过 45 秒，已停止。请检查 Site 的 GitHub token 配置或稍后重试。"
        : error instanceof Error ? error.message : "生成失败。";
      setMessage(detail);
    } finally {
      window.clearTimeout(timeoutId);
      setPublishing(false);
    }
  };

  const handleCopy = async (label: string, content: string) => {
    if (!content.trim()) { setMessage(`${label} 内容为空，无法复制。`); return; }
    try {
      await copyText(content);
      setMessage(`${label} 已复制到剪贴板。`);
    } catch (error) {
      setMessage(`${label} 复制失败：${error instanceof Error ? error.message : "未知错误"} 请使用下载按钮。`);
    }
  };

  const supported = useMemo(() => analysis?.matches.filter((item) => item.status === "supported_gap") ?? [], [analysis]);
  const selectedMatches = useMemo(() => supported.filter((item) => acceptedSuggestions.includes(item.keyword)), [supported, acceptedSuggestions]);
  const filenameBase = `${safeSlug(company)}-${safeSlug(title)}`;

  return (
    <main style={{ minHeight: "100vh", background: "#f5f2e9", color: "#1f2c25", padding: "28px 20px 100px" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <p style={{ letterSpacing: ".14em", fontSize: 12, fontWeight: 800, color: "#16794b" }}>PENDING APPLICATION CV WORKSPACE</p>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(30px,5vw,54px)", margin: "4px 0" }}>岗位定制 CV</h1>
            <p style={{ maxWidth: 760, lineHeight: 1.65 }}>从待提交申请进入，自动读取岗位、完整 JD 和行业母版。Education 与行业技能基线保持稳定，重点调整项目选择、顺序、Summary 和项目 bullets。</p>
          </div>
          <Link href="/" style={{ color: "#16794b", fontWeight: 800 }}>返回申请页</Link>
        </header>

        {loadingApplication ? <p>正在读取申请与完整 JD…</p> : <section style={{ display: "grid", gridTemplateColumns: "minmax(300px,.8fr) minmax(420px,1.2fr)", gap: 18 }} className="cv-tailor-grid">
          <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <article style={cardStyle}>
              <h2 style={headingStyle}>1. 岗位与母版</h2>
              <p><strong>{company || "未识别公司"}</strong> · {title || "未识别岗位"}</p>
              <label style={labelStyle}>行业母版<select value={track} onChange={(event) => setTrack(event.target.value)} style={inputStyle}>{Object.entries(trackLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label style={labelStyle}>完整 JD<textarea value={jd} onChange={(event) => setJd(event.target.value)} style={{ ...inputStyle, minHeight: 300, resize: "vertical" }} placeholder="岗位记录中尚无完整 JD，可在此补充" /></label>
              <button type="button" onClick={() => void analyze()} disabled={analyzing || loading} style={primaryButton}>{analyzing ? "分析中…" : "开始项目与关键词分析"}</button>
            </article>

            {analysis && <article style={cardStyle}>
              <h2 style={headingStyle}>2. 当前关键词差距</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 12 }}>
                <Metric label="JD 命中" value={analysis.summary.required} />
                <Metric label="母版已覆盖" value={analysis.summary.covered} />
                <Metric label="事实支持但未覆盖" value={analysis.summary.supportedGaps} />
                <Metric label="事实不足" value={analysis.summary.unsupportedGaps} />
              </div>
              <div style={{ display: "grid", gap: 9 }}>
                {analysis.matches.map((item) => {
                  const selected = acceptedSuggestions.includes(item.keyword);
                  return <div key={item.keyword} style={{ border: "1px solid #ded9ca", borderRadius: 14, padding: 14, background: item.status === "covered" ? "#eef7f1" : item.status === "supported_gap" ? "#fff8df" : "#fff0ed" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}><strong>{item.keyword}</strong><span style={{ fontSize: 12, whiteSpace: "nowrap" }}>{item.status === "covered" ? "母版已覆盖" : item.status === "supported_gap" ? "事实支持，可考虑补充" : "事实不足，不能添加"}</span></div>
                    <p style={{ lineHeight: 1.6, margin: "10px 0" }}>{explanations[item.keyword] || `这是 JD 中的 ${item.category} 要求。系统需要先找到事实证据和最合适的 CV 位置，再决定是否修改。`}</p>
                    <p style={{ fontSize: 13, lineHeight: 1.55, margin: "8px 0" }}><strong>建议位置：</strong>{suggestionLocation(item)}</p>
                    {item.jdEvidence && <details style={{ marginTop: 8 }}><summary style={{ cursor: "pointer", fontWeight: 700 }}>查看 JD 原文依据</summary><p style={{ fontSize: 12, lineHeight: 1.55 }}>{cleanEvidence(item.jdEvidence)}</p></details>}
                    {item.factEvidence && <details style={{ marginTop: 8 }}><summary style={{ cursor: "pointer", fontWeight: 700 }}>查看事实母版依据</summary><p style={{ fontSize: 12, lineHeight: 1.55 }}>{cleanEvidence(item.factEvidence)}</p></details>}
                    {item.status === "supported_gap" && <button type="button" onClick={() => toggleSuggestion(item.keyword)} style={{ ...quietButton, marginTop: 12, background: selected ? "#1f2c25" : "#fff", color: selected ? "#fff" : "#26342d" }}>{selected ? "✓ 已加入修改清单" : "加入修改清单"}</button>}
                  </div>;
                })}
              </div>
            </article>}
          </div>

          <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
            {analysis && <article style={cardStyle}>
              <h2 style={headingStyle}>3. 待确认修改清单</h2>
              {selectedMatches.length === 0 ? <p style={{ opacity: .72 }}>尚未选择需要补充的要求。加入修改清单不会立即改写 CV，避免把抽象关键词错误塞进 Skills。</p> : <div style={{ display: "grid", gap: 10 }}>{selectedMatches.map((item) => <div key={item.keyword} style={{ border: "1px solid #ded9ca", borderRadius: 12, padding: 12 }}><strong>{item.keyword}</strong><p style={{ margin: "6px 0 0", fontSize: 13 }}>{suggestionLocation(item)}</p></div>)}</div>}
            </article>}

            <article style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}><h2 style={headingStyle}>4. 确认与进一步修改</h2><span style={{ fontSize: 12, opacity: .65 }}>{selectedMatches.length} 项待确认修改</span></div>
              {loading ? <p>正在从 XinyuIvy/CV 读取母版…</p> : template ? <textarea value={template} onChange={(event) => setTemplate(event.target.value)} style={{ ...inputStyle, minHeight: 760, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, lineHeight: 1.55, resize: "vertical" }} /> : <p style={{ padding: 12, background: "#fff0ed", borderRadius: 12 }}>行业母版未成功加载。请检查 CV_GITHUB_TOKEN 配置后重新进入页面。</p>}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                <button type="button" onClick={() => void publish()} disabled={publishing || !template.trim()} style={primaryButton}>{publishing ? "正在生成并创建 PR…" : "生成 LaTeX 并创建 GitHub PR"}</button>
                <button type="button" onClick={() => void handleCopy("Markdown", template)} disabled={!template.trim()} style={quietButton}>复制 Markdown</button>
                <button type="button" onClick={() => template.trim() ? downloadText(`${filenameBase}.md`, template, "text/markdown;charset=utf-8") : setMessage("Markdown 内容为空，无法下载。") } disabled={!template.trim()} style={quietButton}>下载 Markdown</button>
                {tex && <button type="button" onClick={() => void handleCopy("LaTeX", tex)} style={quietButton}>复制 LaTeX</button>}
                {tex && <button type="button" onClick={() => downloadText(`${filenameBase}.tex`, tex, "application/x-tex;charset=utf-8")} style={quietButton}>下载 LaTeX</button>}
              </div>
              {message && <div aria-live="polite" style={{ marginTop: 12, padding: 12, background: "#eef3ed", borderRadius: 12, lineHeight: 1.5 }}>
                <p style={{ margin: 0 }}>{message}</p>
                {pullRequestUrl && <p style={{ margin: "8px 0 0" }}><a href={pullRequestUrl} target="_blank" rel="noreferrer" style={{ color: "#16794b", fontWeight: 800 }}>打开 GitHub PR ↗</a></p>}
              </div>}
            </article>
          </div>
        </section>}
      </div>
      <style>{`@media (max-width: 900px){.cv-tailor-grid{grid-template-columns:1fr!important}}`}</style>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div style={{ background: "#f2efe5", borderRadius: 12, padding: 10 }}><strong style={{ display: "block", fontSize: 22 }}>{value}</strong><span style={{ fontSize: 12 }}>{label}</span></div>;
}

const cardStyle = { background: "#fffdf8", border: "1px solid #ded9ca", borderRadius: 20, padding: 18, boxShadow: "0 10px 28px rgba(55,63,57,.06)" } as const;
const headingStyle = { fontFamily: "Georgia, serif", fontSize: 22, margin: "0 0 14px" } as const;
const labelStyle = { display: "grid", gap: 6, fontSize: 13, fontWeight: 800, marginBottom: 12 } as const;
const inputStyle = { width: "100%", boxSizing: "border-box", border: "1px solid #cbc6b8", borderRadius: 12, padding: "11px 12px", background: "#fff", color: "#1f2c25" } as const;
const primaryButton = { border: 0, borderRadius: 999, padding: "11px 17px", background: "#16794b", color: "#fff", fontWeight: 800, cursor: "pointer" } as const;
const quietButton = { border: "1px solid #c9c4b5", borderRadius: 999, padding: "8px 12px", background: "#fff", color: "#26342d", fontWeight: 800, cursor: "pointer" } as const;