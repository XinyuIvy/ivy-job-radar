"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Match = {
  keyword: string;
  category: string;
  status: "covered" | "supported_gap" | "unsupported_gap";
  factEvidence?: string;
  jdEvidence?: string;
};

type Project = {
  name: string;
  score: number;
  matchedRequirements: string[];
  alreadyInTemplate: boolean;
  evidence: string;
};

type Analysis = {
  matches: Match[];
  projects?: Project[];
  summary: { required: number; covered: number; supportedGaps: number; unsupportedGaps: number };
};

type ApplicationPrefill = {
  applicationId: number;
  company: string;
  title: string;
  track: string;
  jd: string;
};

const trackLabels: Record<string, string> = {
  pharma: "Pharma / Biostatistics",
  tech: "Tech / Data Science",
  quant: "Quantitative Research",
  consulting: "Healthcare Consulting",
};

function placement(item: Match) {
  if (item.category === "Programming and Data") return "Technical Skills。仅在母版确实未覆盖时补充。";
  if (["Research Design", "Data", "Methods", "Domain"].includes(item.category)) return "相关项目 bullet 或项目排序。";
  return "Summary 或相关项目 bullet，用真实职责和成果证明。";
}

export default function CvTailorClient() {
  const [track, setTrack] = useState("tech");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [jd, setJd] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loadingApplication, setLoadingApplication] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const id = Number(new URLSearchParams(window.location.search).get("applicationId"));
    if (!Number.isInteger(id)) { setLoadingApplication(false); return; }
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
    setMessage("正在分析完整 JD、母版覆盖和事实证据…");
    try {
      const response = await fetch("/api/cv-tailor/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track, jd }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "分析失败。");
      setAnalysis(result as Analysis);
      setMessage("分析完成。右侧总结供你手动修改 CV 使用。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "分析失败。");
    } finally {
      setAnalyzing(false);
    }
  };

  const covered = useMemo(() => analysis?.matches.filter((x) => x.status === "covered") ?? [], [analysis]);
  const supported = useMemo(() => analysis?.matches.filter((x) => x.status === "supported_gap") ?? [], [analysis]);
  const unsupported = useMemo(() => analysis?.matches.filter((x) => x.status === "unsupported_gap") ?? [], [analysis]);

  return (
    <main style={{ minHeight: "100vh", background: "#f5f2e9", color: "#1f2c25", padding: "28px 20px 100px" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
          <div>
            <p style={{ letterSpacing: ".14em", fontSize: 12, fontWeight: 800, color: "#16794b" }}>CV ANALYSIS WORKSPACE</p>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(30px,5vw,54px)", margin: "4px 0" }}>岗位 CV 分析</h1>
            <p style={{ maxWidth: 760, lineHeight: 1.65 }}>只分析完整 JD、行业母版和事实母版，不直接修改或生成 CV。</p>
          </div>
          <Link href="/" style={{ color: "#16794b", fontWeight: 800 }}>返回申请页</Link>
        </header>

        {loadingApplication ? <p>正在读取申请…</p> : <section className="cv-grid" style={{ display: "grid", gridTemplateColumns: "minmax(320px,.9fr) minmax(420px,1.1fr)", gap: 18 }}>
          <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <article style={cardStyle}>
              <h2 style={headingStyle}>1. 岗位与母版</h2>
              <p><strong>{company}</strong> · {title}</p>
              <label style={labelStyle}>行业母版<select value={track} onChange={(e) => setTrack(e.target.value)} style={inputStyle}>{Object.entries(trackLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label style={labelStyle}>完整 JD<textarea value={jd} onChange={(e) => setJd(e.target.value)} style={{ ...inputStyle, minHeight: 330, resize: "vertical" }} /></label>
              <button type="button" onClick={() => void analyze()} disabled={analyzing} style={primaryButton}>{analyzing ? "分析中…" : "开始分析"}</button>
              {message && <p style={{ marginTop: 12, padding: 12, background: "#eef3ed", borderRadius: 12 }}>{message}</p>}
            </article>

            {analysis && <article style={cardStyle}>
              <h2 style={headingStyle}>2. 覆盖概览</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
                <Metric label="JD 要求" value={analysis.summary.required} />
                <Metric label="母版已覆盖" value={analysis.summary.covered} />
                <Metric label="事实支持但未覆盖" value={analysis.summary.supportedGaps} />
                <Metric label="事实不足" value={analysis.summary.unsupportedGaps} />
              </div>
              <h3>母版已覆盖</h3>
              <p style={{ lineHeight: 1.7 }}>{covered.map((x) => x.keyword).join("、") || "无"}</p>
              <h3>母版未覆盖项</h3>
              {[...supported, ...unsupported].map((item) => <div key={item.keyword} style={{ borderTop: "1px solid #ded9ca", padding: "12px 0" }}>
                <strong>{item.keyword}</strong> <span style={{ float: "right" }}>{item.status === "supported_gap" ? "事实支持" : "事实不足"}</span>
                {item.jdEvidence && <details><summary>查看 JD 依据</summary><p>{item.jdEvidence}</p></details>}
              </div>)}
            </article>}
          </div>

          <article style={cardStyle}>
            <h2 style={headingStyle}>CV 修改总结</h2>
            {!analysis ? <p>完成左侧分析后，这里会形成一份供你手动修改 CV 的总结。</p> : <>
              <section>
                <h3>推荐优先使用的项目</h3>
                {(analysis.projects ?? []).length === 0 ? <p>暂未识别到项目推荐。</p> : (analysis.projects ?? []).map((project, index) => <div key={project.name} style={summaryBlock}>
                  <strong>{index + 1}. {project.name}</strong>
                  <p>匹配要求：{project.matchedRequirements.join("、")}</p>
                  <p>{project.alreadyInTemplate ? "当前母版已包含，重点调整排序或 bullet。" : "当前母版未包含，需要判断是否替换较弱项目。"}</p>
                </div>)}
              </section>
              <section>
                <h3>母版未覆盖但事实支持</h3>
                {supported.length === 0 ? <p>无。</p> : supported.map((item) => <div key={item.keyword} style={summaryBlock}>
                  <strong>{item.keyword}</strong>
                  <p>建议位置：{placement(item)}</p>
                  {item.factEvidence && <details><summary>查看事实母版证据</summary><p>{item.factEvidence}</p></details>}
                </div>)}
              </section>
              <section>
                <h3>事实不足，不能写入</h3>
                {unsupported.length === 0 ? <p>无。</p> : <p>{unsupported.map((x) => x.keyword).join("、")}</p>}
              </section>
              <section>
                <h3>手动修改顺序</h3>
                <p style={{ lineHeight: 1.75 }}>先确定项目增删与排序，再修改 Summary 和项目 bullets，最后检查 Technical Skills。Education、联系方式和已经覆盖充分的行业技能无需随单个 JD 大幅变化。</p>
              </section>
            </>}
          </article>
        </section>}
      </div>
      <style>{`@media (max-width:900px){.cv-grid{grid-template-columns:1fr!important}}`}</style>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div style={{ background: "#f2efe5", borderRadius: 12, padding: 10 }}><strong style={{ display: "block", fontSize: 22 }}>{value}</strong><span style={{ fontSize: 12 }}>{label}</span></div>;
}

const cardStyle = { background: "#fffdf8", border: "1px solid #ded9ca", borderRadius: 20, padding: 18, boxShadow: "0 10px 28px rgba(55,63,57,.06)" } as const;
const headingStyle = { fontFamily: "Georgia, serif", fontSize: 24, margin: "0 0 14px" } as const;
const labelStyle = { display: "grid", gap: 6, fontSize: 13, fontWeight: 800, marginBottom: 12 } as const;
const inputStyle = { width: "100%", boxSizing: "border-box", border: "1px solid #cbc6b8", borderRadius: 12, padding: "11px 12px", background: "#fff", color: "#1f2c25" } as const;
const primaryButton = { border: 0, borderRadius: 999, padding: "11px 17px", background: "#16794b", color: "#fff", fontWeight: 800, cursor: "pointer" } as const;
const summaryBlock = { border: "1px solid #ded9ca", borderRadius: 14, padding: 14, marginBottom: 10, background: "#faf7ee", lineHeight: 1.6 } as const;
