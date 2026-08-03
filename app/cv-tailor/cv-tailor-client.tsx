"use client";

import { useEffect, useMemo, useState } from "react";

type Match = {
  keyword: string;
  category: string;
  status: "covered" | "supported_gap" | "unsupported_gap";
  factEvidence: string;
};

type Analysis = {
  matches: Match[];
  summary: { required: number; covered: number; supportedGaps: number; unsupportedGaps: number };
};

const trackLabels: Record<string, string> = {
  pharma: "Pharma / Biostatistics",
  tech: "Tech / Data Science",
  quant: "Quantitative Research",
  consulting: "Healthcare Consulting",
};

function addKeyword(markdown: string, keyword: string, category: string) {
  if (markdown.toLowerCase().includes(keyword.toLowerCase())) return markdown;
  const lines = markdown.split(/\r?\n/);
  const categoryIndex = lines.findIndex((line) => line.toLowerCase().includes(`**${category.toLowerCase()}`));
  if (categoryIndex >= 0) {
    lines[categoryIndex] = `${lines[categoryIndex].trimEnd().replace(/\s{2}$/, "")}; ${keyword}  `;
    return lines.join("\n");
  }
  const skillHeader = lines.findIndex((line) => /^## .*skills/i.test(line));
  const insertAt = skillHeader >= 0 ? skillHeader + 1 : lines.length;
  lines.splice(insertAt, 0, `\n**${category}:** ${keyword}  `);
  return lines.join("\n");
}

export default function CvTailorClient() {
  const [track, setTrack] = useState("pharma");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [jd, setJd] = useState("");
  const [template, setTemplate] = useState("");
  const [facts, setFacts] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");
  const [tex, setTex] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setAnalysis(null);
    fetch(`/api/cv-tailor/source?track=${encodeURIComponent(track)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("CV 母版读取失败");
        return response.json();
      })
      .then((result) => {
        if (!active) return;
        setTemplate(result.template || "");
        setFacts(result.facts || "");
        setLoading(false);
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "CV 母版读取失败");
        setLoading(false);
      });
    return () => { active = false; };
  }, [track]);

  const analyze = async () => {
    if (!jd.trim()) { setMessage("请先粘贴完整 JD。"); return; }
    setAnalyzing(true);
    setMessage("");
    const response = await fetch("/api/cv-tailor/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ track, jd, template, facts }),
    });
    setAnalyzing(false);
    if (!response.ok) { setMessage("关键词分析失败。"); return; }
    setAnalysis(await response.json());
  };

  const publish = async () => {
    setPublishing(true);
    setMessage("");
    const response = await fetch("/api/cv-tailor/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, title, track, markdown: template }),
    });
    const result = await response.json().catch(() => ({}));
    setPublishing(false);
    if (!response.ok) { setMessage(result.error || "生成失败。"); return; }
    setTex(result.tex || "");
    setMessage(result.published
      ? `已写入 GitHub：${result.folder}。Overleaf 可以从 GitHub 拉取。`
      : `已生成 Markdown 和 LaTeX，但尚未写入 GitHub：${result.message}`);
  };

  const supported = useMemo(() => analysis?.matches.filter((item) => item.status === "supported_gap") ?? [], [analysis]);

  return (
    <main style={{ minHeight: "100vh", background: "#f5f2e9", color: "#1f2c25", padding: "28px 20px 100px" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <p style={{ letterSpacing: ".14em", fontSize: 12, fontWeight: 800, color: "#16794b" }}>CV TAILORING WORKSPACE</p>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(30px,5vw,54px)", margin: "4px 0" }}>岗位定制 CV</h1>
            <p style={{ maxWidth: 760, lineHeight: 1.65 }}>以 CV 仓库中的行业母版、FACT_MASTER 和历史 JD 关键词为唯一依据。未被事实母版支持的关键词不会自动加入。</p>
          </div>
          <a href="/" style={{ color: "#16794b", fontWeight: 800 }}>返回 Job Radar</a>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(300px,.8fr) minmax(420px,1.2fr)", gap: 18 }} className="cv-tailor-grid">
          <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <article style={cardStyle}>
              <h2 style={headingStyle}>1. 岗位与母版</h2>
              <label style={labelStyle}>行业母版<select value={track} onChange={(event) => setTrack(event.target.value)} style={inputStyle}>{Object.entries(trackLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label style={labelStyle}>公司<input value={company} onChange={(event) => setCompany(event.target.value)} style={inputStyle} placeholder="例如 Oura" /></label>
              <label style={labelStyle}>岗位<input value={title} onChange={(event) => setTitle(event.target.value)} style={inputStyle} placeholder="例如 Research Scientist" /></label>
              <label style={labelStyle}>完整 JD<textarea value={jd} onChange={(event) => setJd(event.target.value)} style={{ ...inputStyle, minHeight: 260, resize: "vertical" }} placeholder="粘贴完整岗位描述" /></label>
              <button onClick={() => void analyze()} disabled={analyzing || loading} style={primaryButton}>{analyzing ? "分析中…" : "分析未命中关键词"}</button>
            </article>

            {analysis && <article style={cardStyle}>
              <h2 style={headingStyle}>2. 关键词差距</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 12 }}>
                <Metric label="JD 命中" value={analysis.summary.required} />
                <Metric label="母版已覆盖" value={analysis.summary.covered} />
                <Metric label="可诚实补充" value={analysis.summary.supportedGaps} />
                <Metric label="事实不足" value={analysis.summary.unsupportedGaps} />
              </div>
              <div style={{ display: "grid", gap: 9 }}>
                {analysis.matches.map((item) => <div key={item.keyword} style={{ border: "1px solid #ded9ca", borderRadius: 14, padding: 12, background: item.status === "covered" ? "#eef7f1" : item.status === "supported_gap" ? "#fff8df" : "#fff0ed" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><strong>{item.keyword}</strong><span style={{ fontSize: 12 }}>{item.status === "covered" ? "已覆盖" : item.status === "supported_gap" ? "可补充" : "不能自动添加"}</span></div>
                  {item.factEvidence && <p style={{ fontSize: 12, lineHeight: 1.5, opacity: .78 }}>{item.factEvidence}</p>}
                  {item.status === "supported_gap" && <button onClick={() => setTemplate((current) => addKeyword(current, item.keyword, item.category))} style={quietButton}>加入母版草稿</button>}
                </div>)}
              </div>
            </article>}
          </div>

          <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <article style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}><h2 style={headingStyle}>3. 编辑岗位专属 CV</h2><span style={{ fontSize: 12, opacity: .65 }}>{supported.length} 个可补充关键词</span></div>
              {loading ? <p>正在从 XinyuIvy/CV 读取母版…</p> : <textarea value={template} onChange={(event) => setTemplate(event.target.value)} style={{ ...inputStyle, minHeight: 760, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, lineHeight: 1.55, resize: "vertical" }} />}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}><button onClick={() => void publish()} disabled={publishing || !template.trim()} style={primaryButton}>{publishing ? "生成中…" : "生成 LaTeX 并写回 GitHub"}</button><button onClick={() => navigator.clipboard.writeText(template)} style={quietButton}>复制 Markdown</button>{tex && <button onClick={() => navigator.clipboard.writeText(tex)} style={quietButton}>复制 LaTeX</button>}</div>
              {message && <p style={{ marginTop: 12, padding: 12, background: "#eef3ed", borderRadius: 12, lineHeight: 1.5 }}>{message}</p>}
            </article>
          </div>
        </section>
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
