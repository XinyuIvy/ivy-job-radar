"use client";

import { useState } from "react";
import type { RagResult } from "../lib/evidence-rag";
import "./style.css";

const examples = [
  "我有没有真实做过负二项模型？具体证据是什么？",
  "我的项目里有哪些可以支持 AI 应用工程岗位的经历？",
  "我是否真的做过生产环境部署？",
];

export default function EvidenceRagClient() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<RagResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [useModel, setUseModel] = useState(false);

  async function ask(value = question) {
    if (!value.trim() || loading) return;
    setQuestion(value);
    setLoading(true);
    setResult(null);
    setError("");
    try {
      const response = await fetch("/api/evidence-rag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: value, useModel }) });
      const body = await response.json() as RagResult & { error?: string };
      if (!response.ok) throw new Error(body.error || "检索失败");
      setResult(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "检索失败");
    } finally {
      setLoading(false);
    }
  }

  return <main className="rag-page">
    <div className="rag-shell">
      <nav className="rag-nav"><a href="/">← Job Radar</a><a href="/interview-prep">项目面试复盘</a></nav>
      <header className="rag-hero"><span>JOB RADAR / EVIDENCE RAG</span><h1>向项目事实提问</h1><p>标准链路：BM25 与学习型 embedding 混合召回，专用 reranker 重排，再根据原始事实生成带引用的回答。当前可切换到本地原文检索。</p></header>
      <section className="rag-compose" aria-label="证据问答">
        <label htmlFor="rag-question">你的问题，或一段想核对的 JD 要求</label>
        <textarea id="rag-question" value={question} maxLength={1200} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：我是否有负二项模型的实际项目经验？" />
        <label className="rag-model-choice"><input type="checkbox" checked={useModel} onChange={(event) => setUseModel(event.target.checked)} /><span><strong>使用标准 RAG 模型链路</strong><small>开启后，事实索引与问题发送至 Cloudflare Workers AI（Qwen3 Embedding），最多 20 条候选再发送给 BGE Reranker，最多 5 条事实发送给 DeepSeek 生成回答。模型凭据尚未配置时会提示错误；默认关闭。</small></span></label>
        <div className="rag-compose-bottom"><span>{question.length} / 1200</span><button type="button" disabled={!question.trim() || loading} onClick={() => void ask()}>{loading ? "正在检索与核验…" : "检索证据"}</button></div>
      </section>
      <div className="rag-examples">{examples.map((example) => <button type="button" key={example} disabled={loading} onClick={() => void ask(example)}>{example}</button>)}</div>
      {error && <div className="rag-error" role="alert">{error}</div>}
      {result && <section className="rag-results" aria-live="polite">
        <div className="rag-result-heading"><div><span>GROUNDED ANSWER</span><h2>证据回答</h2></div><span>{result.citations.length} 条引用</span></div>
        <p className="rag-answer">{result.answer}</p>
        <h3>引用的原始事实</h3>
        {result.citations.length ? <div className="rag-citations">{result.citations.map((item) => <article key={item.factId}>
          <div className="rag-citation-title"><strong>{item.project}</strong><code>{item.factId}</code></div>
          <blockquote>{item.excerpt}</blockquote>
          <dl><div><dt>状态</dt><dd>{item.factStatus}</dd></div><div><dt>来源</dt><dd>{item.source}{item.evidenceLocation ? ` · ${item.evidenceLocation}` : ""}</dd></div><div><dt>主张边界</dt><dd>{item.claimBoundary || "以原始事实为准"}</dd></div></dl>
        </article>)}</div> : <p className="rag-empty">没有足够的可引用证据。不要把相近项目写成已完成的同名经历。</p>}
        <p className="rag-diagnostics">召回：{result.diagnostics.retrieval} · 重排：{result.diagnostics.reranker} · 生成：{result.diagnostics.generator} · 候选 {result.diagnostics.retrieved} 条，呈现 {result.diagnostics.reranked} 条。模型排序不替代事实核验。</p>
        {result.diagnostics.retrievedFactIds?.length ? <details className="rag-diagnostics"><summary>查看召回与重排 fact_id</summary><p>召回前 20：{result.diagnostics.retrievedFactIds.join(" → ")}</p><p>重排前 5：{result.diagnostics.rerankedFactIds?.join(" → ") || "无"}</p></details> : null}
      </section>}
    </div>
  </main>;
}
