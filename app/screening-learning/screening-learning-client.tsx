"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Rule = {
  kind: "include" | "exclude";
  term: string;
  label: string;
  positiveCount: number;
  negativeCount: number;
  status: "suggested" | "approved" | "rejected";
  reason: string;
};

type Snapshot = {
  counts: { positive: number; negative: number; strongPositive: number; approved: number };
  rules: Rule[];
};

export default function ScreeningLearningClient() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/screening-learning", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (active) setSnapshot(result); });
    return () => { active = false; };
  }, []);

  const decide = async (rule: Rule, status: "approved" | "rejected") => {
    const key = `${rule.kind}:${rule.term}:${status}`;
    setBusy(key);
    setMessage("");
    const response = await fetch("/api/screening-learning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: rule.kind, term: rule.term, status }),
    });
    const result = await response.json().catch(() => null) as Snapshot | { error?: string } | null;
    setBusy("");
    if (!response.ok || !result || "error" in result) {
      setMessage(result && "error" in result ? result.error || "保存失败。" : "保存失败。");
      return;
    }
    setSnapshot(result);
    setMessage(status === "approved" ? "规则已批准，将用于后续岗位导入评分。" : "规则已拒绝，不会影响筛选。");
  };

  return (
    <main style={{ minHeight: "100vh", background: "#f3f0e8", color: "#18221d", padding: "42px 18px 100px" }}>
      <section style={{ maxWidth: 1050, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#536159", textDecoration: "none", fontWeight: 800 }}>← 返回 Ivy Job Radar</Link>
        <p style={{ marginTop: 42, letterSpacing: ".14em", fontSize: 12, fontWeight: 850, color: "#718078" }}>HUMAN-SUPERVISED SCREENING</p>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(38px,6vw,64px)", margin: "10px 0 16px" }}>筛选学习</h1>
        <p style={{ maxWidth: 820, lineHeight: 1.75, color: "#59665f", fontSize: 17 }}>
          系统从书签手动加入、人工通过、收藏、申请和不再推荐中提取反馈。它只提出候选规则，必须由你批准后才会生效。批准规则只能补充相关性评分，不能绕过 Senior、经验年限、Sponsorship 或公民身份等硬条件。
        </p>

        {snapshot && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, margin: "28px 0" }}>
            <Metric label="正向样本" value={snapshot.counts.positive} note="手动加入、收藏或申请" />
            <Metric label="强正向样本" value={snapshot.counts.strongPositive} note="已投递或进入流程" />
            <Metric label="负向样本" value={snapshot.counts.negative} note="不再推荐" />
            <Metric label="已批准规则" value={snapshot.counts.approved} note="后续导入生效" />
          </div>
        )}

        {message && <div style={{ margin: "18px 0", padding: "13px 16px", borderRadius: 14, background: "#fff", border: "1px solid #d8d4c9", fontWeight: 750 }}>{message}</div>}

        {!snapshot ? (
          <div style={{ marginTop: 28, padding: 30, borderRadius: 20, background: "#fff" }}>正在分析反馈样本…</div>
        ) : snapshot.rules.length === 0 ? (
          <div style={{ marginTop: 28, padding: 34, borderRadius: 20, background: "#fff", border: "1px solid #d8d4c9" }}>
            <strong>当前样本还不足以形成规则建议</strong>
            <p style={{ color: "#66736c" }}>继续使用书签、收藏、申请和不再推荐，系统会逐步积累反馈。</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 15 }}>
            {snapshot.rules.map((rule) => (
              <article key={`${rule.kind}:${rule.term}`} style={{ background: "#fff", border: "1px solid #d8d4c9", borderRadius: 20, padding: 22, boxShadow: "0 12px 35px rgba(28,36,31,.05)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <span style={{ display: "inline-block", padding: "5px 10px", borderRadius: 999, background: rule.kind === "include" ? "#e1f3e8" : "#f4dfdc", fontSize: 12, fontWeight: 850 }}>
                      {rule.kind === "include" ? "建议保留" : "建议排除"}
                    </span>
                    <h2 style={{ margin: "12px 0 6px", fontSize: 23 }}>{rule.label}</h2>
                    <code style={{ color: "#66736c" }}>{rule.term}</code>
                  </div>
                  <strong style={{ color: rule.status === "approved" ? "#16794b" : rule.status === "rejected" ? "#9a4037" : "#7b6d48" }}>
                    {rule.status === "approved" ? "已批准" : rule.status === "rejected" ? "已拒绝" : "待决定"}
                  </strong>
                </div>
                <p style={{ lineHeight: 1.7, color: "#526158" }}>{rule.reason}</p>
                <div style={{ display: "flex", gap: 18, color: "#66736c", fontSize: 14, marginBottom: 15 }}>
                  <span>正向命中 <b>{rule.positiveCount}</b></span>
                  <span>负向命中 <b>{rule.negativeCount}</b></span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
                  <button style={approveStyle} disabled={busy !== ""} onClick={() => void decide(rule, "approved")}>{busy === `${rule.kind}:${rule.term}:approved` ? "保存中…" : "批准规则"}</button>
                  <button style={rejectStyle} disabled={busy !== ""} onClick={() => void decide(rule, "rejected")}>{busy === `${rule.kind}:${rule.term}:rejected` ? "保存中…" : "拒绝规则"}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return <article style={{ background: "#fff", border: "1px solid #d8d4c9", borderRadius: 18, padding: 18 }}><span style={{ color: "#66736c", fontSize: 13 }}>{label}</span><strong style={{ display: "block", fontSize: 32, margin: "7px 0" }}>{value}</strong><small style={{ color: "#879189" }}>{note}</small></article>;
}

const baseButton = { border: 0, borderRadius: 999, padding: "10px 15px", fontWeight: 800, cursor: "pointer" } as const;
const approveStyle = { ...baseButton, background: "#16794b", color: "#fff" } as const;
const rejectStyle = { ...baseButton, background: "#ece7dc", color: "#5d4d45" } as const;
