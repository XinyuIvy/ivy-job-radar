"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type TemplateLanguage = "en" | "zh";
type EvidenceClassification = "Direct" | "Credential Direct" | "Coursework Match" | "Strong Transferable" | "Credential Status Gap" | "Adjacent";
type MatchStatus = "covered" | "supported_gap" | "adjacent_gap" | "unsupported_gap";

type SupportEvidence = {
  projectId: string; project: string; factId: string; fact: string; factStatus: string; evidenceStrength: string;
  classification: EvidenceClassification; relevance: string; source: string; evidenceLocation: string; claimBoundary: string;
  capabilityContext?: string; industryTranslation?: string; industryGuardrail?: string; score?: number; retrievalChannels?: string[];
};

type TemplateMatch = {
  snippetId: string; section: string; entityId: string; rawLatex: string; visibleText: string; conceptIds: string[]; factIds: string[];
  sourceFile: string; location: string; relationType: string; relationPath: string[]; relationExplanation: string; confidence: number;
};

type Match = {
  requirementId: string; keyword: string; category: string; canonicalConcepts: string[]; status: MatchStatus;
  evidenceClassification: EvidenceClassification | "No Evidence"; supportEvidence: SupportEvidence[]; templateCovered: boolean;
  templateEvidence: string; templateMatches: TemplateMatch[]; jdEvidence: string; jdMatchedTerms: string[]; confidence: number; action: string; reason: string;
};

type Project = { projectId: string; name: string; score: number; matchedRequirements: string[]; classifications: EvidenceClassification[]; alreadyInTemplate: boolean; evidence: SupportEvidence | null };
type ModificationDraft = { id: string; action: string; status: "supported_gap" | "adjacent_gap"; targetSection: string; canGenerateEdit: boolean; projectId: string; project: string; requirement: string; classification: EvidenceClassification; factId: string; verifiedFact: string; proposedBullet: string; source: string; evidenceLocation: string; claimBoundary: string; rationale: string; latexDiff: null | { before: string; after: string } };
type Analysis = { language: TemplateLanguage; matches: Match[]; projects: Project[]; modificationDrafts: ModificationDraft[]; summary: { required: number; covered: number; supportedGaps: number; adjacentGaps: number; unsupportedGaps: number }; sourceDiagnostics?: { templateFile: string; templateSnippetCount?: number; atomicFactCount: number; structuredFactCount?: number; conceptEdgeCount?: number; templateMatching?: string; factMatching?: string; ontology?: string } };
type ApplicationPrefill = { applicationId: number; company: string; title: string; track: string; jd: string };
type ResultPanel = "projects" | "requirements" | "covered" | "supported" | "adjacent" | "unsupported" | "drafts";

const trackLabels: Record<string, string> = { pharma: "Pharma / Biostatistics", tech: "Tech / Data Science / Applied ML", quant: "Quantitative Research", consulting: "Healthcare Consulting", clinical_neuro: "脑科学 / 临床数据 / 医疗器械" };
const statusLabels: Record<MatchStatus, string> = { covered: "母版已覆盖", supported_gap: "事实支持缺口", adjacent_gap: "仅相邻经验", unsupported_gap: "无事实支持" };
const statusColors: Record<MatchStatus, { color: string; background: string }> = { covered: { color: "#10633d", background: "#e3f3e8" }, supported_gap: { color: "#6b5100", background: "#fff2c8" }, adjacent_gap: { color: "#7a4b2a", background: "#f7e8dc" }, unsupported_gap: { color: "#8b312b", background: "#f9e4e1" } };
const classLabels: Record<EvidenceClassification, string> = { Direct: "Direct", "Credential Direct": "Credential Direct", "Coursework Match": "Coursework", "Strong Transferable": "Strong Transferable", "Credential Status Gap": "Credential Status Gap", Adjacent: "Adjacent" };

export default function CvTailorClient() {
  const [track, setTrack] = useState("tech");
  const [language, setLanguage] = useState<TemplateLanguage>("en");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [jd, setJd] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [panel, setPanel] = useState<ResultPanel>("requirements");
  const [loading, setLoading] = useState(false);
  const [loadingApplication, setLoadingApplication] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const rawId = new URLSearchParams(window.location.search).get("applicationId");
    if (!rawId) { setLoadingApplication(false); return; }
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) { setLoadingApplication(false); return; }
    fetch(`/api/cv-tailor/application?applicationId=${id}`, { cache: "no-store" })
      .then(async (response) => { const value = await response.json(); if (!response.ok) throw new Error(value.error || "无法读取申请"); return value as ApplicationPrefill; })
      .then((value) => { setCompany(value.company); setTitle(value.title); setTrack(value.track); setJd(value.jd); setLoadingApplication(false); })
      .catch((error) => { setMessage(error instanceof Error ? error.message : "申请读取失败"); setLoadingApplication(false); });
  }, []);

  const analyze = async () => {
    if (!jd.trim()) { setMessage("该申请没有完整 JD，无法分析。"); return; }
    setLoading(true); setMessage("正在分别检索事实库与当前 CV 片段…");
    try {
      const response = await fetch("/api/cv-tailor/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ track, language, jd }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "分析失败");
      setAnalysis(value as Analysis); setPanel("requirements"); setMessage("分析完成：事实证据与母版片段已独立检索，并显示关系路径。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "分析失败"); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    if (!analysis) return [];
    if (panel === "requirements") return analysis.matches;
    const map: Partial<Record<ResultPanel, MatchStatus>> = { covered: "covered", supported: "supported_gap", adjacent: "adjacent_gap", unsupported: "unsupported_gap" };
    return map[panel] ? analysis.matches.filter((item) => item.status === map[panel]) : [];
  }, [analysis, panel]);

  const nav = analysis ? [
    ["requirements", "全部 JD 原子要求", analysis.summary.required], ["covered", "母版已覆盖", analysis.summary.covered], ["supported", "事实支持缺口", analysis.summary.supportedGaps],
    ["adjacent", "仅相邻经验", analysis.summary.adjacentGaps], ["unsupported", "无事实支持", analysis.summary.unsupportedGaps], ["drafts", "逐条处理", analysis.modificationDrafts.length], ["projects", "推荐项目", analysis.projects.length],
  ] as const : [];

  return <main style={{ minHeight: "100vh", background: "#f5f2e9", color: "#1f2c25", padding: "26px 18px 90px" }}>
    <div style={{ maxWidth: 1380, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 18, marginBottom: 22 }}>
        <div><p style={eyebrow}>CV TAILOR · DUAL-CORPUS RAG</p><h1 style={titleStyle}>岗位 CV 分析</h1><p style={subtle}>事实库回答“你是否真的具备”，当前 CV 片段回答“母版是否已经写出来”。两条检索链共用同一 capability ontology，但证据 corpus 完全独立。</p></div>
        <Link href="/" style={{ color: "#16794b", fontWeight: 800 }}>返回申请页</Link>
      </header>

      {loadingApplication ? <p>正在读取申请…</p> : <div className="cv-grid" style={{ display: "grid", gridTemplateColumns: "minmax(330px,.78fr) minmax(560px,1.22fr)", gap: 18 }}>
        <aside style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <section style={card}><h2 style={h2}>岗位与母版</h2><p><strong>{company || "未关联公司"}</strong>{title ? ` · ${title}` : ""}</p>
            <label style={label}>行业母版<select value={track} onChange={(e) => { setTrack(e.target.value); if (e.target.value === "clinical_neuro") setLanguage("zh"); setAnalysis(null); }} style={input}>{Object.entries(trackLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}><button style={langButton(language === "en")} disabled={track === "clinical_neuro"} onClick={() => { setLanguage("en"); setAnalysis(null); }}>English</button><button style={langButton(language === "zh")} onClick={() => { setLanguage("zh"); setAnalysis(null); }}>中文</button></div>
            <label style={label}>完整 JD<textarea value={jd} onChange={(e) => setJd(e.target.value)} style={{ ...input, minHeight: 360, resize: "vertical" }} /></label>
            <button disabled={loading} onClick={() => void analyze()} style={primary}>{loading ? "分析中…" : "开始分析"}</button>{message && <p style={notice}>{message}</p>}
          </section>
          {analysis && <section style={card}><h2 style={h2}>结果导航</h2><p style={small}>模板：{analysis.sourceDiagnostics?.templateFile}<br />模板片段：{analysis.sourceDiagnostics?.templateSnippetCount ?? 0} · 项目事实：{analysis.sourceDiagnostics?.atomicFactCount ?? 0} · 结构化事实：{analysis.sourceDiagnostics?.structuredFactCount ?? 0}</p><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{nav.map(([id, text, value]) => <button key={id} onClick={() => setPanel(id)} style={navButton(panel === id)}><strong style={{ fontSize: 23 }}>{value}</strong><span>{text}</span></button>)}</div></section>}
        </aside>

        <section style={{ ...card, minHeight: 520 }}>
          {!analysis ? <p>运行分析后，这里会展示每一个 JD 原子要求的事实证据、当前 CV 原文、概念关系路径与建议动作。</p> : panel === "projects" ? <Projects projects={analysis.projects} /> : panel === "drafts" ? <Drafts drafts={analysis.modificationDrafts} /> : <><h2 style={h2}>{nav.find(([id]) => id === panel)?.[1]}</h2><p style={subtle}>优先显示 JD 原始中文；英文 canonical concept 仅用于解释和跨语言检索。</p>{filtered.length ? filtered.map((item) => <RequirementCard key={item.requirementId} item={item} />) : <p style={empty}>这一类当前没有内容。</p>}</>}
        </section>
      </div>}
    </div><style>{`@media(max-width:980px){.cv-grid{grid-template-columns:1fr!important}}`}</style>
  </main>;
}

function RequirementCard({ item }: { item: Match }) {
  return <article style={resultCard}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}><div><p style={eyebrow}>{item.requirementId} · {item.category}</p><h3 style={{ margin: "3px 0" }}>{item.keyword}</h3></div><span style={{ ...statusColors[item.status], borderRadius: 999, padding: "4px 9px", fontSize: 11, fontWeight: 800 }}>{statusLabels[item.status]}</span></div>
    <blockquote style={quote}><strong>JD 原文：</strong>{item.jdEvidence}</blockquote>
    <p><strong>Canonical concept：</strong>{item.canonicalConcepts.length ? item.canonicalConcepts.join(" · ") : item.keyword}</p>
    <p><strong>事实分类：</strong>{item.evidenceClassification === "No Evidence" ? "No Evidence" : classLabels[item.evidenceClassification]} · <strong>置信度：</strong>{item.confidence}%</p>
    <p><strong>判定理由：</strong>{item.reason}</p>
    {item.supportEvidence.length > 0 && <details open><summary style={summaryStyle}>事实证据 ({item.supportEvidence.length})</summary><div style={{ display: "grid", gap: 8, marginTop: 8 }}>{item.supportEvidence.map((evidence) => <div key={evidence.factId} style={evidenceBox}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{evidence.factId}</strong><span>{classLabels[evidence.classification]}</span></div><p>{evidence.fact}</p><small>{evidence.project} · {evidence.source} · {evidence.evidenceLocation}</small>{evidence.claimBoundary && <p style={boundary}><strong>边界：</strong>{evidence.claimBoundary}</p>}{evidence.industryGuardrail && <p style={boundary}><strong>Guardrail：</strong>{evidence.industryGuardrail}</p>}</div>)}</div></details>}
    {item.templateMatches.length > 0 && <details open><summary style={summaryStyle}>当前 CV 命中片段 ({item.templateMatches.length})</summary><div style={{ display: "grid", gap: 9, marginTop: 8 }}>{item.templateMatches.map((match) => <div key={`${match.snippetId}-${match.relationType}`} style={templateBox}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{match.section}</strong><span>{match.relationType} · {Math.round(match.confidence * 100)}%</span></div><p style={{ fontSize: 16 }}>{match.visibleText}</p><p><strong>关系路径：</strong>{match.relationPath.join(" → ")}</p><small>{match.sourceFile} · {match.location}{match.factIds.length ? ` · fact IDs: ${match.factIds.slice(0, 6).join(", ")}` : ""}</small></div>)}</div></details>}
    <p style={actionBox}><strong>建议动作：</strong>{item.action}</p>
  </article>;
}

function Projects({ projects }: { projects: Project[] }) { return <><h2 style={h2}>推荐优先使用的项目</h2>{projects.length ? projects.map((project, index) => <div key={project.projectId} style={resultCard}><strong>{index + 1}. {project.name}</strong><p>匹配要求：{project.matchedRequirements.join("、")}</p><p>{project.alreadyInTemplate ? "当前母版已包含该项目。" : "当前母版未包含该项目，仅在明显更匹配时考虑替换加入。"}</p>{project.evidence && <p><strong>代表性事实：</strong>{project.evidence.fact} ({project.evidence.factId})</p>}</div>) : <p style={empty}>没有可推荐项目。</p>}</>; }
function Drafts({ drafts }: { drafts: ModificationDraft[] }) { return <><h2 style={h2}>逐条处理</h2><p style={subtle}>No Evidence 不生成修改；Adjacent 只显示安全边界，不生成虚假经历。</p>{drafts.length ? drafts.map((draft) => <div key={draft.id} style={resultCard}><div style={{ display: "flex", justifyContent: "space-between" }}><strong>{draft.requirement}</strong><span>{classLabels[draft.classification]}</span></div><p><strong>目标位置：</strong>{draft.targetSection}</p>{draft.canGenerateEdit ? <><p><strong>真实依据：</strong>{draft.verifiedFact}</p><p><strong>处理建议：</strong>{draft.rationale}</p></> : <p style={boundary}><strong>不可直接写入：</strong>{draft.rationale}<br />只能保留事实：{draft.verifiedFact}</p>}{draft.claimBoundary && <p style={boundary}><strong>Claim boundary：</strong>{draft.claimBoundary}</p>}</div>) : <p style={empty}>没有需要处理的 gap。</p>}</>; }

const card: React.CSSProperties = { background: "#fffef9", border: "1px solid #ddd8ca", borderRadius: 18, padding: 20, boxShadow: "0 7px 25px rgba(31,44,37,.05)" };
const resultCard: React.CSSProperties = { border: "1px solid #ddd8ca", borderRadius: 14, padding: 15, marginTop: 12, background: "#fff" };
const evidenceBox: React.CSSProperties = { background: "#f4f6f2", borderRadius: 10, padding: 11 };
const templateBox: React.CSSProperties = { background: "#eef5ff", border: "1px solid #cdddec", borderRadius: 10, padding: 11 };
const quote: React.CSSProperties = { margin: "10px 0", padding: "10px 12px", borderLeft: "4px solid #d5a83a", background: "#fff8df", lineHeight: 1.6 };
const boundary: React.CSSProperties = { background: "#fff2ed", padding: 9, borderRadius: 8, color: "#733f31" };
const actionBox: React.CSSProperties = { background: "#edf5ee", padding: 10, borderRadius: 9 };
const empty: React.CSSProperties = { padding: 14, borderRadius: 12, background: "#f5f2e9", color: "#5c665f" };
const eyebrow: React.CSSProperties = { letterSpacing: ".12em", fontSize: 11, fontWeight: 800, color: "#16794b", margin: 0 };
const titleStyle: React.CSSProperties = { fontFamily: "Georgia,serif", fontSize: "clamp(30px,5vw,52px)", margin: "4px 0" };
const h2: React.CSSProperties = { fontFamily: "Georgia,serif", margin: "0 0 12px" };
const subtle: React.CSSProperties = { color: "#56645c", lineHeight: 1.6 };
const small: React.CSSProperties = { color: "#657067", fontSize: 12, lineHeight: 1.5 };
const label: React.CSSProperties = { display: "grid", gap: 6, fontWeight: 800, fontSize: 13, marginBottom: 12 };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #cfcabd", borderRadius: 10, padding: "10px 11px", background: "#fff", color: "#1f2c25" };
const primary: React.CSSProperties = { border: 0, borderRadius: 11, padding: "11px 15px", background: "#16794b", color: "white", fontWeight: 800, cursor: "pointer" };
const notice: React.CSSProperties = { marginTop: 12, padding: 11, background: "#eef3ed", borderRadius: 10, lineHeight: 1.5 };
const langButton = (active: boolean): React.CSSProperties => ({ border: `1px solid ${active ? "#16794b" : "#cfcabd"}`, background: active ? "#e6f2ea" : "#fff", color: "#1f2c25", borderRadius: 9, padding: "8px 12px", fontWeight: 800, cursor: "pointer" });
const navButton = (active: boolean): React.CSSProperties => ({ display: "grid", gap: 2, border: `1px solid ${active ? "#16794b" : "#d7d1c3"}`, background: active ? "#e6f2ea" : "#fff", borderRadius: 11, padding: 10, textAlign: "left", cursor: "pointer", color: "#1f2c25" });
const summaryStyle: React.CSSProperties = { cursor: "pointer", fontWeight: 800, marginTop: 10 };
