"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type TemplateLanguage = "en" | "zh";
type EvidenceClassification = "Direct" | "Credential Direct" | "Coursework Match" | "Strong Transferable" | "Credential Status Gap" | "Adjacent";

type SupportEvidence = {
  projectId: string;
  project: string;
  factId: string;
  fact: string;
  factStatus: string;
  evidenceStrength: string;
  classification: EvidenceClassification;
  relevance: string;
  source: string;
  evidenceLocation: string;
  claimBoundary: string;
  capabilityContext?: string;
  industryTranslation?: string;
  industryGuardrail?: string;
  score?: number;
  retrievalChannels?: string[];
};

type Match = {
  keyword: string;
  category: string;
  status: "covered" | "supported_gap" | "adjacent_gap" | "unsupported_gap";
  supportEvidence?: SupportEvidence[];
  jdEvidence?: string;
  jdMatchedTerms?: string[];
  templateEvidence?: string;
};

type Project = {
  projectId: string;
  name: string;
  score: number;
  matchedRequirements: string[];
  classifications: EvidenceClassification[];
  alreadyInTemplate: boolean;
  evidence: SupportEvidence | null;
};

type ModificationDraft = {
  id: string;
  action: "revise_existing" | "consider_addition" | "add_to_section" | "no_direct_edit";
  status: "supported_gap" | "adjacent_gap";
  targetSection: string;
  canGenerateEdit: boolean;
  projectId: string;
  project: string;
  requirement: string;
  classification: EvidenceClassification;
  factId: string;
  verifiedFact: string;
  proposedBullet: string;
  source: string;
  evidenceLocation: string;
  claimBoundary: string;
  rationale: string;
  latexDiff: { before: string; after: string } | null;
};

type Analysis = {
  language: TemplateLanguage;
  matches: Match[];
  projects?: Project[];
  modificationDrafts?: ModificationDraft[];
  sourceDiagnostics?: {
    templateFile: string;
    factIndexFile?: string;
    conceptEdgesFile?: string;
    atomicFactCount: number;
    structuredFactCount?: number;
    unifiedFactCount?: number;
    conceptEdgeCount?: number;
    embeddingBackend?: string;
    embeddingDimensions?: number;
    bm25Parameters?: { k1: number; b: number };
    matchingSpecLoaded?: boolean;
    ragPreparationStages?: string;
  };
  summary: { required: number; covered: number; supportedGaps: number; adjacentGaps: number; unsupportedGaps: number };
};

type ApplicationPrefill = {
  applicationId: number;
  company: string;
  title: string;
  track: string;
  jd: string;
};

type DraftDecision = "pending" | "accepted" | "rejected";
type ResultPanel = "projects" | "requirements" | "covered" | "supported" | "adjacent" | "unsupported" | "drafts";

const trackLabels: Record<string, string> = {
  pharma: "Pharma / Biostatistics",
  tech: "Tech / Data Science / Applied ML",
  quant: "Quantitative Research",
  consulting: "Healthcare Consulting",
  clinical_neuro: "脑科学 / 临床数据 / 医疗器械",
};

const classificationLabels: Record<EvidenceClassification, string> = {
  Direct: "Direct｜直接证据",
  "Credential Direct": "Credential｜学历直接匹配",
  "Coursework Match": "Coursework｜课程匹配",
  "Strong Transferable": "Transferable｜强可迁移能力",
  "Credential Status Gap": "Status gap｜学位状态缺口",
  Adjacent: "Adjacent｜相邻经验",
};

const classificationColors: Record<EvidenceClassification, { color: string; background: string }> = {
  Direct: { color: "#10633d", background: "#e3f3e8" },
  "Credential Direct": { color: "#10633d", background: "#dcefe7" },
  "Coursework Match": { color: "#235c78", background: "#e3f1f7" },
  "Strong Transferable": { color: "#7a5500", background: "#fff2c8" },
  "Credential Status Gap": { color: "#7a4b2a", background: "#f7e8dc" },
  Adjacent: { color: "#7a4b2a", background: "#f7e8dc" },
};

function placement(item: Match) {
  if (item.category === "Education") return "Education／教育背景。保留真实学位状态和预计毕业时间。";
  if (item.category === "Programming and Data") return "Technical Skills。仅在母版确实未覆盖时补充。";
  if (item.category === "Communication") return "Publications、Research 或对应论文项目。";
  if (["Professional Service", "Teaching", "Awards"].includes(item.category)) return "对应的学术服务、教学或荣誉栏目。";
  if (["Research Design", "Data", "Methods", "Domain"].includes(item.category)) return "相关项目 bullet 或项目排序。";
  return "Summary 或相关项目 bullet，用真实职责和成果证明。";
}

function ClassificationBadge({ value }: { value: EvidenceClassification }) {
  return <span style={{ ...classificationColors[value], display: "inline-block", borderRadius: 999, padding: "3px 8px", fontSize: 11, fontWeight: 800 }}>{classificationLabels[value]}</span>;
}

export default function CvTailorClient() {
  const [track, setTrack] = useState("tech");
  const [language, setLanguage] = useState<TemplateLanguage>("en");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [jd, setJd] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [decisions, setDecisions] = useState<Record<string, DraftDecision>>({});
  const [loadingApplication, setLoadingApplication] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState("");
  const [resultPanel, setResultPanel] = useState<ResultPanel>("projects");

  useEffect(() => {
    let active = true;
    const rawId = new URLSearchParams(window.location.search).get("applicationId");
    if (!rawId) { setLoadingApplication(false); return; }
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) { setLoadingApplication(false); return; }
    fetch(`/api/cv-tailor/application?applicationId=${id}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "无法读取申请。");
        return result as ApplicationPrefill;
      })
      .then((result) => {
        if (!active) return;
        setCompany(result.company);
        setTitle(result.title);
        setTrack(result.track);
        setJd(result.jd);
        setLoadingApplication(false);
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "申请读取失败。");
        setLoadingApplication(false);
      });
    return () => { active = false; };
  }, []);

  const analyze = async () => {
    if (!jd.trim()) { setMessage("该申请没有完整 JD，无法分析。"); return; }
    setAnalyzing(true);
    setMessage("正在核对完整 JD、所选语言母版和原子事实证据…");
    try {
      const response = await fetch("/api/cv-tailor/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track, language, jd }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "分析失败。");
      setAnalysis(result as Analysis);
      setDecisions({});
      setResultPanel("projects");
      setMessage("分析完成。每条事实支持缺口和相邻经验都有明确处理结论；只有可安全写入的建议才能保留或拒绝。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "分析失败。");
    } finally {
      setAnalyzing(false);
    }
  };

  const covered = useMemo(() => analysis?.matches.filter((x) => x.status === "covered") ?? [], [analysis]);
  const supported = useMemo(() => analysis?.matches.filter((x) => x.status === "supported_gap") ?? [], [analysis]);
  const adjacent = useMemo(() => analysis?.matches.filter((x) => x.status === "adjacent_gap") ?? [], [analysis]);
  const unsupported = useMemo(() => analysis?.matches.filter((x) => x.status === "unsupported_gap") ?? [], [analysis]);
  const drafts = analysis?.modificationDrafts ?? [];
  const editableDrafts = drafts.filter((draft) => draft.canGenerateEdit);
  const blockedDrafts = drafts.filter((draft) => !draft.canGenerateEdit);
  const resultPanels = analysis ? [
    { id: "projects" as const, label: "推荐项目", value: analysis.projects?.length ?? 0 },
    { id: "requirements" as const, label: "全部 JD 要求", value: analysis.summary.required },
    { id: "covered" as const, label: "母版已覆盖", value: analysis.summary.covered },
    { id: "supported" as const, label: "事实支持缺口", value: analysis.summary.supportedGaps },
    { id: "adjacent" as const, label: "仅相邻经验", value: analysis.summary.adjacentGaps },
    { id: "unsupported" as const, label: "无证据要求", value: analysis.summary.unsupportedGaps },
    { id: "drafts" as const, label: "逐条处理", value: drafts.length },
  ] : [];

  const changeTrack = (nextTrack: string) => {
    setTrack(nextTrack);
    setAnalysis(null);
    if (nextTrack === "clinical_neuro") setLanguage("zh");
  };

  const changeLanguage = (nextLanguage: TemplateLanguage) => {
    if (track === "clinical_neuro" && nextLanguage === "en") return;
    setLanguage(nextLanguage);
    setAnalysis(null);
  };

  const renderResultPanel = () => {
    if (!analysis) return <p>完成左侧分析后，这里会显示项目身份对齐结果、事实级证据和修改草案。</p>;

    if (resultPanel === "projects") {
      return <>
        <PanelIntro title="推荐优先使用的项目" text="按与当前 JD 的证据匹配强度排序。项目已在母版时只建议调整顺序或 bullet；未在母版时才考虑替换加入。" />
        {(analysis.projects ?? []).length === 0 ? <EmptyState /> : (analysis.projects ?? []).map((project, index) => <div key={project.projectId} style={summaryBlock}>
          <strong>{index + 1}. {project.name}</strong>
          <p>匹配要求：{project.matchedRequirements.join("、")}</p>
          <p style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{project.classifications.map((value) => <ClassificationBadge key={value} value={value} />)}</p>
          <p>{project.alreadyInTemplate ? "项目已在当前母版中；优先考虑排序或 bullet 调整。" : "当前母版中没有该项目；仅在它明显强于现有项目时考虑替换加入。"}</p>
          {project.evidence && <p><strong>代表性事实：</strong>{project.evidence.fact} <small>({project.evidence.factId})</small></p>}
        </div>)}
      </>;
    }

    if (resultPanel === "requirements") {
      return <>
        <PanelIntro title="全部 JD 要求" text="每项只显示触发识别的最短 JD 原句，并按最终证据状态标记。" />
        <RequirementCards items={analysis.matches} />
      </>;
    }

    if (resultPanel === "covered") {
      return <>
        <PanelIntro title="母版已覆盖" text="这些要求已经能从当前 LaTeX 母版中直接读到，通常不需要新增内容。" />
        <RequirementCards items={covered} showTemplate />
      </>;
    }

    if (resultPanel === "supported") {
      return <>
        <PanelIntro title="事实支持但母版未明确覆盖" text="这些要求可由事实库支持，适合考虑补进已有项目 bullet 或调整项目重点。" />
        {supported.length === 0 ? <EmptyState /> : supported.map((item) => <div key={item.keyword} style={summaryBlock}>
          <RequirementHeader item={item} />
          <JdEvidence item={item} />
          <p><strong>建议位置：</strong>{placement(item)}</p>
          {(item.supportEvidence ?? []).map((evidence) => <EvidenceCard key={`${item.keyword}-${evidence.factId}`} evidence={evidence} />)}
        </div>)}
      </>;
    }

    if (resultPanel === "adjacent") {
      return <>
        <PanelIntro title="仅相邻经验" text="底层概念相关，但不能写成你已经完成了该岗位要求的同名方法或行业任务。" />
        <RequirementCards items={adjacent} />
      </>;
    }

    if (resultPanel === "unsupported") {
      return <>
        <PanelIntro title="无证据要求" text="当前事实库没有足够证据支持，不能为了覆盖关键词写进 CV。" />
        <RequirementCards items={unsupported} />
      </>;
    }

    return <>
      <PanelIntro
        title={`逐条处理 ${drafts.length} 项：可生成修改 ${editableDrafts.length} 项，仅相邻不可直写 ${blockedDrafts.length} 项`}
        text="每一条事实支持缺口和相邻经验都会在这里得到处理结论。相邻经验只展示真实相关事实与禁止边界，不生成 CV 修改。"
      />
      {drafts.length === 0 ? <p>当前没有需要逐条处理的事实支持缺口或相邻经验。</p> : drafts.map((draft) => {
        const decision = decisions[draft.id] ?? "pending";
        return <div key={draft.id} style={{ ...draftCard, opacity: decision === "rejected" ? 0.58 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
            <div><strong>{draft.requirement}</strong><p style={{ margin: "4px 0 0" }}>{draft.project}</p></div>
            <ClassificationBadge value={draft.classification} />
          </div>
          <p><strong>处理位置：</strong>{draft.targetSection}</p>
          <p><strong>处理结论：</strong>{draft.action === "revise_existing"
            ? "改写母版中已有项目的 bullet"
            : draft.action === "consider_addition"
              ? "考虑用该项目替换较弱项目"
              : draft.action === "add_to_section"
                ? "加入或合并到对应的非项目栏目"
                : "不生成直接 CV 表述"}</p>
          {draft.canGenerateEdit
            ? <p><strong>建议句：</strong>{draft.proposedBullet}</p>
            : <p style={blockedEditStyle}><strong>不可直接写入：</strong>{draft.rationale}<br /><strong>只能安全保留的事实：</strong>{draft.verifiedFact}</p>}
          <p><strong>依据：</strong>{draft.factId} · {draft.source} · {draft.evidenceLocation}</p>
          {draft.canGenerateEdit && <p>{draft.rationale}</p>}
          {draft.claimBoundary && <p style={boundaryStyle}><strong>Claim boundary：</strong>{draft.claimBoundary}</p>}
          {draft.canGenerateEdit && draft.latexDiff && <details>
            <summary style={{ cursor: "pointer", fontWeight: 800 }}>查看 LaTeX diff</summary>
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <pre style={removedDiff}>{draft.latexDiff.before}</pre>
              <pre style={addedDiff}>{draft.latexDiff.after}</pre>
            </div>
          </details>}
          {draft.canGenerateEdit && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => setDecisions((current) => ({ ...current, [draft.id]: "accepted" }))} style={decisionButton(decision === "accepted", "accept")}>保留建议</button>
            <button type="button" onClick={() => setDecisions((current) => ({ ...current, [draft.id]: "rejected" }))} style={decisionButton(decision === "rejected", "reject")}>拒绝</button>
            {decision !== "pending" && <button type="button" onClick={() => setDecisions((current) => ({ ...current, [draft.id]: "pending" }))} style={neutralButton}>撤销选择</button>}
          </div>}
        </div>;
      })}
    </>;
  };

  return (
    <main style={{ minHeight: "100vh", background: "#f5f2e9", color: "#1f2c25", padding: "28px 20px 100px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
          <div>
            <p style={{ letterSpacing: ".14em", fontSize: 12, fontWeight: 800, color: "#16794b" }}>CV ANALYSIS WORKSPACE</p>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(30px,5vw,54px)", margin: "4px 0" }}>岗位 CV 分析</h1>
            <p style={{ maxWidth: 820, lineHeight: 1.65 }}>读取所选中英文 LaTeX 母版与已完成的 Stage 1–7 RAG 知识产物，区分直接证据、可迁移能力、相邻经验和无证据要求，并生成可审核的逐条修改草案。</p>
          </div>
          <Link href="/" style={{ color: "#16794b", fontWeight: 800 }}>返回申请页</Link>
        </header>

        {loadingApplication ? <p>正在读取申请…</p> : <section className="cv-grid" style={{ display: "grid", gridTemplateColumns: "minmax(320px,.82fr) minmax(500px,1.18fr)", gap: 18 }}>
          <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <article style={cardStyle}>
              <h2 style={headingStyle}>1. 岗位与母版</h2>
              <p><strong>{company || "未关联公司"}</strong>{title ? ` · ${title}` : ""}</p>
              <label style={labelStyle}>行业母版
                <select value={track} onChange={(event) => changeTrack(event.target.value)} style={inputStyle}>
                  {Object.entries(trackLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <div style={{ marginBottom: 12 }}>
                <span style={{ ...labelStyle, marginBottom: 7 }}>母版语言</span>
                <div role="group" aria-label="选择 CV 母版语言" style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => changeLanguage("en")} disabled={track === "clinical_neuro"} style={languageButton(language === "en", track === "clinical_neuro")}>English</button>
                  <button type="button" onClick={() => changeLanguage("zh")} style={languageButton(language === "zh", false)}>中文</button>
                </div>
                {track === "clinical_neuro" && <p style={{ margin: "7px 0 0", color: "#79592f", fontSize: 12 }}>该方向目前在 CV 仓库中只有中文 LaTeX 母版。</p>}
              </div>
              <label style={labelStyle}>完整 JD<textarea value={jd} onChange={(event) => setJd(event.target.value)} style={{ ...inputStyle, minHeight: 330, resize: "vertical" }} /></label>
              <button type="button" onClick={() => void analyze()} disabled={analyzing} style={primaryButton}>{analyzing ? "分析中…" : "开始分析"}</button>
              {message && <p style={{ marginTop: 12, padding: 12, background: "#eef3ed", borderRadius: 12, lineHeight: 1.55 }}>{message}</p>}
            </article>

            {analysis && <article style={cardStyle}>
              <h2 style={headingStyle}>2. 分析导航</h2>
              <p style={{ marginTop: -5, color: "#5c665f", fontSize: 12, lineHeight: 1.5 }}>
                {analysis.sourceDiagnostics?.templateFile} · {analysis.sourceDiagnostics?.atomicFactCount ?? 0} 条项目事实 · {analysis.sourceDiagnostics?.structuredFactCount ?? 0} 条学历/课程/技能与履历事实 · {analysis.sourceDiagnostics?.conceptEdgeCount ?? 0} 条概念边 · Hybrid RAG
              </p>
              <p style={{ lineHeight: 1.55, margin: "10px 0 12px" }}>点击一个分类，右侧只显示对应结果。</p>
              <div role="tablist" aria-label="CV 分析结果分类" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
                {resultPanels.map((panel) => <button
                  key={panel.id}
                  type="button"
                  role="tab"
                  aria-selected={resultPanel === panel.id}
                  onClick={() => setResultPanel(panel.id)}
                  style={resultNavButton(resultPanel === panel.id)}
                >
                  <strong style={{ display: "block", fontSize: 23 }}>{panel.value}</strong>
                  <span style={{ fontSize: 12 }}>{panel.label}</span>
                </button>)}
              </div>
            </article>}
          </div>

          <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <article role="tabpanel" style={{ ...cardStyle, minHeight: analysis ? 420 : undefined }}>
              <h2 style={headingStyle}>CV 修改总结</h2>
              {renderResultPanel()}
              {analysis && <p style={{ marginTop: 16, padding: 12, borderRadius: 12, background: "#eef3ed", lineHeight: 1.6 }}>
                RAG 内容准备 Stage 1–7 已完成；本页已读取原子事实、能力层、行业翻译、概念图和匹配规范。任何建议仍需通过事实编号与表述边界审核后才能写入 CV。
              </p>}
            </article>
          </div>
        </section>}
      </div>
      <style>{`@media (max-width:980px){.cv-grid{grid-template-columns:1fr!important}}`}</style>
    </main>
  );
}

function PanelIntro({ title, text }: { title: string; text: string }) {
  return <div style={{ marginBottom: 16 }}><h3 style={{ marginBottom: 6 }}>{title}</h3><p style={{ margin: 0, color: "#536158", lineHeight: 1.6 }}>{text}</p></div>;
}

function EmptyState() {
  return <p style={{ padding: 14, borderRadius: 12, background: "#f5f2e9", color: "#5c665f" }}>这一类当前没有内容。</p>;
}

const statusLabels: Record<Match["status"], string> = {
  covered: "母版已覆盖",
  supported_gap: "事实可支持",
  adjacent_gap: "仅相邻经验",
  unsupported_gap: "无证据",
};

const statusColors: Record<Match["status"], { color: string; background: string }> = {
  covered: { color: "#10633d", background: "#e3f3e8" },
  supported_gap: { color: "#6b5100", background: "#fff2c8" },
  adjacent_gap: { color: "#7a4b2a", background: "#f7e8dc" },
  unsupported_gap: { color: "#8b312b", background: "#f9e4e1" },
};

function RequirementHeader({ item }: { item: Match }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
    <div><strong style={{ fontSize: 18 }}>{item.keyword}</strong><p style={{ margin: "3px 0 0", color: "#657067", fontSize: 12 }}>{item.category}</p></div>
    <span style={{ ...statusColors[item.status], flexShrink: 0, borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 800 }}>{statusLabels[item.status]}</span>
  </div>;
}

function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  const uniqueTerms = [...new Set(terms.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!uniqueTerms.length) return <>{text}</>;
  const pattern = new RegExp(`(${uniqueTerms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return <>{text.split(pattern).map((part, index) => uniqueTerms.some((term) => part.toLocaleLowerCase() === term.toLocaleLowerCase())
    ? <mark key={`${part}-${index}`} style={{ background: "#ffe69a", color: "inherit", padding: "0 2px", borderRadius: 3 }}>{part}</mark>
    : <span key={`${part}-${index}`}>{part}</span>)}</>;
}

function JdEvidence({ item }: { item: Match }) {
  if (!item.jdEvidence) return null;
  return <blockquote style={jdEvidenceStyle}>
    <span style={{ display: "block", marginBottom: 4, color: "#657067", fontSize: 11, fontWeight: 800, letterSpacing: ".05em" }}>JD 原句</span>
    “<HighlightedText text={item.jdEvidence} terms={item.jdMatchedTerms ?? []} />”
  </blockquote>;
}

const retrievalChannelLabels: Record<string, string> = {
  exact: "精确术语",
  bm25: "BM25",
  embedding: "Embedding",
  concept_graph: "概念图谱",
  industry_translation: "行业翻译",
  credential_index: "学历索引",
  coursework_index: "课程索引",
  profile_index: "技能/履历索引",
};

function EvidenceCard({ evidence, compact = false }: { evidence: SupportEvidence; compact?: boolean }) {
  return <div style={evidenceBlock}>
    <p style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}><strong>{evidence.project}</strong><ClassificationBadge value={evidence.classification} /></p>
    <p><strong>支持事实：</strong>{evidence.fact}</p>
    {evidence.factStatus && <p style={{ color: "#5c665f", fontSize: 12 }}><strong>事实状态：</strong>{evidence.factStatus}</p>}
    <p style={{ color: "#5c665f", fontSize: 12 }}>
      {typeof evidence.score === "number" ? `重排分 ${evidence.score}/100` : "已核验"}
      {(evidence.retrievalChannels ?? []).length > 0 ? ` · ${(evidence.retrievalChannels ?? []).map((channel) => retrievalChannelLabels[channel] ?? channel).join(" / ")}` : ""}
    </p>
    {!compact && <details>
      <summary style={{ cursor: "pointer", fontWeight: 800 }}>查看事实依据与表述边界</summary>
      <p><strong>事实编号：</strong>{evidence.factId} · {evidence.source} · {evidence.evidenceLocation}</p>
      {evidence.capabilityContext && <p><strong>能力层解释：</strong>{evidence.capabilityContext}</p>}
      {evidence.industryTranslation && <p><strong>行业翻译：</strong>{evidence.industryTranslation}</p>}
      <p><strong>为什么相关：</strong>{evidence.relevance}</p>
      {evidence.claimBoundary && <p style={boundaryStyle}><strong>Claim boundary：</strong>{evidence.claimBoundary}</p>}
      {evidence.industryGuardrail && <p style={boundaryStyle}><strong>事实核验限制：</strong>{evidence.industryGuardrail}</p>}
    </details>}
  </div>;
}

function RequirementCards({ items, showTemplate = false }: { items: Match[]; showTemplate?: boolean }) {
  if (!items.length) return <EmptyState />;
  return <div style={{ display: "grid", gap: 10 }}>{items.map((item) => <div key={item.keyword} style={requirementCard}>
    <RequirementHeader item={item} />
    <JdEvidence item={item} />
    {showTemplate && item.templateEvidence && <details style={{ marginTop: 9 }}>
      <summary style={{ cursor: "pointer", fontWeight: 800 }}>查看母版中的对应文字</summary>
      <p style={{ marginBottom: 0, lineHeight: 1.55 }}>{item.templateEvidence}</p>
    </details>}
    {item.status === "adjacent_gap" && item.supportEvidence?.[0] && <EvidenceCard evidence={item.supportEvidence[0]} compact />}
    {item.status === "adjacent_gap" && <p style={{ marginBottom: 0, color: "#76512e" }}>只能描述相关的底层方法或研究经验，不能改写成已完成该岗位要求。</p>}
    {item.status === "unsupported_gap" && <p style={{ marginBottom: 0, color: "#8b312b" }}>不能为了关键词覆盖写入 CV。</p>}
  </div>)}</div>;
}

function languageButton(active: boolean, disabled: boolean) {
  return { border: `1px solid ${active ? "#16794b" : "#cbc6b8"}`, borderRadius: 999, padding: "8px 16px", background: active ? "#16794b" : "#fff", color: active ? "#fff" : "#1f2c25", fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1 } as const;
}

function resultNavButton(active: boolean) {
  return {
    border: `1px solid ${active ? "#16794b" : "#ded9ca"}`,
    borderRadius: 13,
    padding: "11px 10px",
    background: active ? "#16794b" : "#f2efe5",
    color: active ? "#fff" : "#1f2c25",
    textAlign: "left",
    cursor: "pointer",
    boxShadow: active ? "0 6px 15px rgba(22,121,75,.18)" : "none",
  } as const;
}

function decisionButton(active: boolean, kind: "accept" | "reject") {
  const color = kind === "accept" ? "#16794b" : "#9a473b";
  return { border: `1px solid ${color}`, borderRadius: 999, padding: "7px 12px", background: active ? color : "#fff", color: active ? "#fff" : color, fontWeight: 800, cursor: "pointer" } as const;
}

const cardStyle = { background: "#fffdf8", border: "1px solid #ded9ca", borderRadius: 20, padding: 18, boxShadow: "0 10px 28px rgba(55,63,57,.06)" } as const;
const headingStyle = { fontFamily: "Georgia, serif", fontSize: 24, margin: "0 0 14px" } as const;
const labelStyle = { display: "grid", gap: 6, fontSize: 13, fontWeight: 800, marginBottom: 12 } as const;
const inputStyle = { width: "100%", boxSizing: "border-box", border: "1px solid #cbc6b8", borderRadius: 12, padding: "11px 12px", background: "#fff", color: "#1f2c25" } as const;
const primaryButton = { border: 0, borderRadius: 999, padding: "11px 17px", background: "#16794b", color: "#fff", fontWeight: 800, cursor: "pointer" } as const;
const summaryBlock = { border: "1px solid #ded9ca", borderRadius: 14, padding: 14, marginBottom: 10, background: "#faf7ee", lineHeight: 1.6 } as const;
const evidenceBlock = { marginTop: 10, padding: 12, borderRadius: 12, background: "#fff", border: "1px solid #e5dfd0", lineHeight: 1.55 } as const;
const requirementCard = { border: "1px solid #ded9ca", borderRadius: 14, padding: 14, background: "#faf7ee", lineHeight: 1.55 } as const;
const jdEvidenceStyle = { margin: "10px 0 0", borderLeft: "3px solid #16794b", padding: "8px 10px", background: "#f0f5ef", borderRadius: "0 10px 10px 0", lineHeight: 1.55 } as const;
const boundaryStyle = { borderLeft: "3px solid #a96e31", paddingLeft: 10, color: "#76512e" } as const;
const blockedEditStyle = { borderLeft: "3px solid #9a473b", padding: "9px 11px", background: "#f9e4e1", color: "#7c342d", borderRadius: "0 10px 10px 0", lineHeight: 1.65 } as const;
const draftCard = { border: "1px solid #d8d2c3", borderRadius: 16, padding: 15, marginBottom: 12, background: "#fbf8f0", lineHeight: 1.55, transition: "opacity .2s ease" } as const;
const removedDiff = { whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0, padding: 12, borderRadius: 10, background: "#fde8e5", color: "#7c2d25", fontSize: 12 } as const;
const addedDiff = { whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0, padding: 12, borderRadius: 10, background: "#e4f4e8", color: "#155b38", fontSize: 12 } as const;
const neutralButton = { border: "1px solid #aaa596", borderRadius: 999, padding: "7px 12px", background: "#fff", color: "#4d544f", fontWeight: 800, cursor: "pointer" } as const;
