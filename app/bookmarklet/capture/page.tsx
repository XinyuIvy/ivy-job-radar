"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type CaptureResult = {
  ok: boolean;
  created: boolean;
  duplicate: boolean;
  company: string;
  title: string;
};

type CaptureState =
  | { status: "saving" }
  | { status: "success"; result: CaptureResult }
  | { status: "error"; message: string };

export default function BookmarkCapturePage() {
  const [state, setState] = useState<CaptureState>({ status: "saving" });

  useEffect(() => {
    let active = true;
    const save = async () => {
      try {
        const encoded = window.location.hash.slice(1);
        if (!encoded) throw new Error("书签没有传入岗位信息。请重新点击招聘页面上的保存书签。");
        const payload = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;
        window.history.replaceState(null, "", window.location.pathname);
        const response = await fetch("/api/bookmark-capture", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });
        const result = await response.json() as CaptureResult & { error?: string };
        if (!response.ok || !result.ok) throw new Error(result.error || "岗位保存失败。");
        if (active) setState({ status: "success", result });
      } catch (error) {
        if (active) setState({
          status: "error",
          message: error instanceof Error ? error.message : "岗位保存失败。",
        });
      }
    };
    void save();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (state.status !== "success") return;
    const timer = window.setTimeout(() => {
      if (window.opener) window.close();
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [state.status]);

  const successful = state.status === "success";
  const failed = state.status === "error";

  return (
    <main style={{ minHeight: "100vh", background: "#f5f2ea", color: "#18221d", display: "grid", placeItems: "center", padding: 24 }}>
      <article style={{ width: "min(520px,100%)", background: "#fff", border: "1px solid #d9d5ca", borderRadius: 22, padding: 30, boxShadow: "0 18px 55px rgba(28,36,31,.12)" }}>
        <div style={{ display: "grid", width: 54, height: 54, placeItems: "center", borderRadius: "50%", background: successful ? "#16794b" : failed ? "#a1372d" : "#d7a638", color: "#fff", fontSize: 28, fontWeight: 850 }}>
          {successful ? "✓" : failed ? "!" : "…"}
        </div>
        <h1 style={{ margin: "20px 0 10px", fontSize: 28 }}>
          {state.status === "saving"
            ? "正在加入岗位池"
            : state.status === "success"
              ? state.result.created ? "已加入岗位池" : "岗位已存在，信息已更新"
              : "保存失败"}
        </h1>
        {state.status === "success" && (
          <strong style={{ display: "block", marginTop: 16, fontSize: 18 }}>{state.result.company} · {state.result.title}</strong>
        )}
        <p style={{ lineHeight: 1.65, color: "#526058" }}>
          {state.status === "saving"
            ? "正在解析当前招聘页面并执行去重。"
            : state.status === "success"
              ? "岗位已直接以“开放”状态写入，不会进入核验队列。此窗口会自动关闭。"
              : state.message}
        </p>
        <Link href="/" style={{ display: "inline-block", marginTop: 18, borderRadius: 999, padding: "12px 18px", background: "#18221d", color: "#fff", textDecoration: "none", fontWeight: 750 }}>
          返回 Ivy Job Radar
        </Link>
        <button type="button" onClick={() => window.close()} style={{ marginLeft: 8, border: 0, borderRadius: 999, padding: "12px 18px", background: "#e9e5dc", color: "#18221d", fontWeight: 750, cursor: "pointer" }}>
          关闭窗口
        </button>
      </article>
    </main>
  );
}
