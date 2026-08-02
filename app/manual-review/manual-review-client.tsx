"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type RequestItem = {
  id: number;
  company: string;
  title: string;
  jobUrl: string;
  notes: string;
  status: string;
  verificationNote: string;
  updatedAt: string;
};

type ActionName = "approve" | "ignore" | "delete";

export default function ManualReviewClient() {
  const [items, setItems] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    const response = await fetch("/api/job-requests", { cache: "no-store" });
    setItems(response.ok ? await response.json() : []);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    fetch("/api/job-requests", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : [])
      .then((rows: RequestItem[]) => {
        if (!active) return;
        setItems(rows);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const act = async (item: RequestItem, action: ActionName) => {
    if (action === "approve" && !item.jobUrl) {
      setMessage("人工通过前需要先在原核验记录中补充岗位链接。");
      return;
    }
    const confirmText = action === "approve"
      ? `确认人工通过 ${item.company} · ${item.title}，并直接加入今日岗位吗？`
      : action === "ignore"
        ? `确认删除并将 ${item.company} · ${item.title} 加入黑名单吗？以后扫描将跳过它。`
        : `确认只删除这条核验记录吗？该岗位未来仍可能再次出现。`;
    if (!window.confirm(confirmText)) return;

    const key = `${item.id}:${action}`;
    setBusyKey(key);
    setMessage("");
    const response = await fetch("/api/manual-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, action }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    setBusyKey("");
    if (!response.ok) {
      setMessage(result.error || "操作失败，请稍后重试。");
      return;
    }
    setMessage(action === "approve"
      ? "已人工通过并加入今日岗位。"
      : action === "ignore"
        ? "已删除核验记录并加入黑名单。"
        : "核验记录已删除，未加入黑名单。");
    await load();
  };

  const rerun = async (item: RequestItem) => {
    const key = `${item.id}:rerun`;
    setBusyKey(key);
    setMessage("");
    const response = await fetch("/api/job-requests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
    setBusyKey("");
    if (!response.ok) {
      setMessage("重新核验失败，请稍后重试。");
      return;
    }
    setMessage("重新核验已完成。");
    await load();
  };

  return (
    <main style={{ minHeight: "100vh", background: "#f3f0e8", color: "#18221d", padding: "42px 18px 90px" }}>
      <section style={{ maxWidth: 980, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#536159", textDecoration: "none", fontWeight: 800 }}>← 返回 Ivy Job Radar</Link>
        <p style={{ marginTop: 42, letterSpacing: ".14em", fontSize: 12, fontWeight: 850, color: "#718078" }}>MANUAL VERIFICATION CONTROL</p>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(38px,6vw,64px)", margin: "10px 0 16px" }}>核验人工处理</h1>
        <p style={{ maxWidth: 760, lineHeight: 1.75, color: "#59665f", fontSize: 17 }}>
          对自动核验失败或无法判断的岗位，你可以人工通过并直接加入今日岗位，也可以删除并加入黑名单。人工通过会自动去重；加入黑名单后，后续扫描会跳过同公司同职位。
        </p>
        {message && <div style={{ margin: "18px 0", padding: "13px 16px", borderRadius: 14, background: "#fff", border: "1px solid #d8d4c9", fontWeight: 750 }}>{message}</div>}

        {loading ? (
          <div style={{ marginTop: 28, padding: 28, background: "#fff", borderRadius: 20 }}>正在读取核验队列…</div>
        ) : items.length === 0 ? (
          <div style={{ marginTop: 28, padding: 34, background: "#fff", borderRadius: 20, border: "1px solid #d8d4c9" }}>
            <strong>当前没有核验记录</strong>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16, marginTop: 28 }}>
            {items.map((item) => (
              <article key={item.id} style={{ background: "#fff", border: "1px solid #d8d4c9", borderRadius: 20, padding: 24, boxShadow: "0 12px 35px rgba(28,36,31,.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <span style={{ display: "inline-block", padding: "5px 10px", borderRadius: 999, background: item.status === "已确认" ? "#e1f3e8" : item.status === "已关闭" ? "#f4dfdc" : "#f6ecd2", fontSize: 12, fontWeight: 850 }}>{item.status}</span>
                    <h2 style={{ margin: "12px 0 5px", fontSize: 24 }}>{item.title}</h2>
                    <p style={{ margin: 0, color: "#617068" }}>{item.company}</p>
                  </div>
                  <small style={{ color: "#879189" }}>{item.updatedAt ? new Date(item.updatedAt).toLocaleString("zh-CN") : ""}</small>
                </div>
                {item.verificationNote && <p style={{ lineHeight: 1.7, color: "#4f5d55", background: "#f7f5ef", padding: 14, borderRadius: 12 }}>{item.verificationNote}</p>}
                {item.notes && <p style={{ lineHeight: 1.65, color: "#6a756e" }}>{item.notes}</p>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginTop: 16 }}>
                  {item.jobUrl && <a href={item.jobUrl} target="_blank" rel="noreferrer" style={linkButtonStyle}>打开原 JD ↗</a>}
                  <button style={approveStyle} disabled={busyKey !== ""} onClick={() => void act(item, "approve")}>{busyKey === `${item.id}:approve` ? "处理中…" : "人工通过"}</button>
                  <button style={neutralStyle} disabled={busyKey !== ""} onClick={() => void rerun(item)}>{busyKey === `${item.id}:rerun` ? "核验中…" : "重新核验"}</button>
                  <button style={dangerStyle} disabled={busyKey !== ""} onClick={() => void act(item, "ignore")}>{busyKey === `${item.id}:ignore` ? "处理中…" : "不再推荐"}</button>
                  <button style={quietStyle} disabled={busyKey !== ""} onClick={() => void act(item, "delete")}>{busyKey === `${item.id}:delete` ? "删除中…" : "仅删除记录"}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const baseButton = { border: 0, borderRadius: 999, padding: "11px 16px", fontWeight: 800, cursor: "pointer" } as const;
const approveStyle = { ...baseButton, background: "#16794b", color: "#fff" } as const;
const neutralStyle = { ...baseButton, background: "#e8e4d9", color: "#26342d" } as const;
const dangerStyle = { ...baseButton, background: "#a33f35", color: "#fff" } as const;
const quietStyle = { ...baseButton, background: "transparent", color: "#7c4c47", border: "1px solid #d9bbb6" } as const;
const linkButtonStyle = { ...baseButton, display: "inline-block", background: "#18221d", color: "#fff", textDecoration: "none" } as const;
