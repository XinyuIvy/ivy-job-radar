"use client";

import { FormEvent, useEffect, useState } from "react";

type Status = {
  ready: boolean;
  mode: string;
  files: Record<string, { path: string; present: boolean; size: number }>;
  counts: { facts: number; projects: number; concepts: number; capabilities: number; translations: Record<string, number> };
  note: string;
  error?: string;
};

type Match = {
  factId: string;
  project: string;
  verifiedFact: string;
  score: number;
  matched: string[];
  evidenceStrength: string;
  prohibitedOverclaims: string[];
  translation: string[];
};

export default function CvKnowledgeClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [jd, setJd] = useState("");
  const [track, setTrack] = useState("tech");
  const [matches, setMatches] = useState<Match[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = async () => {
    setLoading(true);
    const response = await fetch("/api/cv-knowledge", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    setStatus(payload as Status);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!jd.trim()) return;
    setSearching(true);
    setMessage("");
    const response = await fetch("/api/cv-knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jd, track }),
    });
    const payload = await response.json().catch(() => ({})) as { matches?: Match[]; message?: string; error?: string };
    setMatches(payload.matches ?? []);
    setMessage(payload.error || payload.message || "");
    setSearching(false);
  };

  const counts = status?.counts;
  return (
    <main style={{ minHeight: "100vh", background: "#f5f2ea", color: "#18221d", padding: "32px 18px 80px" }}>
      <div style={{ width: "min(1080px,100%)", margin: "0 auto" }}>
        <a href="/" style={{ color: "#526058", textDecoration: "none", fontWeight: 700 }}>← 返回 Job Radar</a>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-end", marginTop: 28, flexWrap: "wrap" }}>
          <div><p style={{ margin: 0, letterSpacing: ".12em", fontSize: 12, fontWeight: 800, color: "#7b807b" }}>CV KNOWLEDGE BASE</p><h1 style={{ margin: "8px 0 8px", fontSize: 38 }}>个人能力知识库</h1><p style={{ margin: 0, color: "#66736c", maxWidth: 720 }}>一级证据负责证明“做过什么”，结构化知识库负责把 verified facts、统计概念、问题与行业翻译连接起来。JD 检索只召回候选事实，不允许绕过事实校验。</p></div>
          <button onClick={() => void refresh()} disabled={loading} style={{ border: 0, borderRadius: 999, padding: "11px 16px", background: "#18221d", color: "white", fontWeight: 800, cursor: "pointer" }}>{loading ? "同步中…" : "↻ 重新同步"}</button>
        </div>

        <section style={{ marginTop: 24, background: "white", border: "1px solid #ded9cf", borderRadius: 22, padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><strong>{status?.ready ? "✓ 结构化知识库已启用" : "○ 等待一级证据与结构化索引"}</strong><span style={{ color: "#66736c" }}>{status?.mode || "读取中"}</span></div>
          <p style={{ color: "#66736c" }}>{status?.error || status?.note || "正在读取私有 CV 仓库…"}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginTop: 18 }}>
            {[['Atomic facts', counts?.facts ?? 0], ['Projects', counts?.projects ?? 0], ['Concepts', counts?.concepts ?? 0], ['Capabilities', counts?.capabilities ?? 0]].map(([label, value]) => <article key={String(label)} style={{ background: "#f7f4ed", borderRadius: 16, padding: 16 }}><span style={{ color: "#6d756f", fontSize: 13 }}>{label}</span><strong style={{ display: "block", fontSize: 28, marginTop: 6 }}>{value}</strong></article>)}
          </div>
          <div style={{ display: "grid", gap: 8, marginTop: 18 }}>
            {Object.values(status?.files ?? {}).map((file) => <div key={file.path} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 12, background: file.present ? "#edf7f0" : "#f6f1e7" }}><code>{file.path}</code><span>{file.present ? `已连接 · ${Math.max(1, Math.round(file.size / 1024))} KB` : "待创建"}</span></div>)}
          </div>
        </section>

        <section style={{ marginTop: 24, background: "white", border: "1px solid #ded9cf", borderRadius: 22, padding: 22 }}>
          <div><p style={{ margin: 0, letterSpacing: ".1em", fontSize: 12, fontWeight: 800, color: "#7b807b" }}>EVIDENCE RETRIEVAL TEST</p><h2 style={{ margin: "7px 0 6px" }}>用一份 JD 测试知识库召回</h2><p style={{ margin: 0, color: "#66736c" }}>现在先提供结构化 exact/concept/problem/industry retrieval。等一级证据完成后，再在这一层加入 embedding/vector semantic retrieval 和 reranker。</p></div>
          <form onSubmit={search} style={{ marginTop: 18 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}><select value={track} onChange={(event) => setTrack(event.target.value)} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #d8d3c8" }}><option value="tech">Tech</option><option value="quant">Quant</option><option value="pharma">Pharma</option><option value="consulting">Consulting</option></select><button disabled={searching || !jd.trim()} style={{ border: 0, borderRadius: 999, padding: "10px 16px", background: "#16794b", color: "white", fontWeight: 800 }}>{searching ? "检索中…" : "检索相关事实"}</button></div>
            <textarea value={jd} onChange={(event) => setJd(event.target.value)} placeholder="粘贴完整 JD。FACT_INDEX 尚未建立时这里不会报错，只会提示继续使用现有 FACT_MASTER 流程。" style={{ width: "100%", minHeight: 180, resize: "vertical", boxSizing: "border-box", border: "1px solid #d8d3c8", borderRadius: 16, padding: 14, font: "inherit" }} />
          </form>
          {message && <p style={{ color: "#8a5b3f" }}>{message}</p>}
          {matches.length > 0 && <div style={{ display: "grid", gap: 12, marginTop: 18 }}>{matches.map((item, index) => <article key={`${item.factId}-${index}`} style={{ border: "1px solid #e0ddd5", borderRadius: 16, padding: 16 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><strong>{item.project}</strong><span>score {item.score}</span></div><p style={{ marginBottom: 8 }}>{item.verifiedFact}</p><small style={{ color: "#66736c" }}>Evidence: {item.evidenceStrength}</small>{item.matched.length > 0 && <p style={{ color: "#526058", fontSize: 13 }}>匹配层：{item.matched.join(" · ")}</p>}{item.translation.length > 0 && <p style={{ fontSize: 13 }}><b>行业翻译：</b>{item.translation.join(" · ")}</p>}{item.prohibitedOverclaims.length > 0 && <p style={{ color: "#9a453c", fontSize: 13 }}><b>禁止过度表述：</b>{item.prohibitedOverclaims.join(" · ")}</p>}</article>)}</div>}
        </section>
      </div>
    </main>
  );
}
