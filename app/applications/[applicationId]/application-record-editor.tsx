"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const applicationStatuses = ["准备材料", "已申请", "一面", "二面/技术面", "终面", "Offer", "撤回", "拒绝"];
const NAVIGATION_STORAGE_KEY = "ivy-job-radar:navigation-state:v2";

export default function ApplicationRecordEditor({
  applicationId,
  initialCompany,
  initialTitle,
  initialStatus,
}: {
  applicationId: number;
  initialCompany: string;
  initialTitle: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [company, setCompany] = useState(initialCompany);
  const [title, setTitle] = useState(initialTitle);
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextCompany = company.trim();
    const nextTitle = title.trim();
    if (!nextCompany || !nextTitle || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/applications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: applicationId, company: nextCompany, title: nextTitle, status }),
      });
      const payload = await response.json() as { error?: string; status?: string };
      if (!response.ok) throw new Error(payload.error || "申请记录保存失败。");
      try {
        const stored = JSON.parse(window.sessionStorage.getItem(NAVIGATION_STORAGE_KEY) || "{}") as Record<string, unknown>;
        window.sessionStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify({
          ...stored,
          view: "saved",
          candidateBucket: "pending",
        }));
      } catch {
        // Navigation still completes if storage is unavailable.
      }
      router.replace("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "申请记录保存失败。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="detail-section application-record-editor" aria-labelledby="application-record-editor-title">
      <div className="application-record-editor-heading">
        <div><p className="eyebrow">APPLICATION STATUS</p><h2 id="application-record-editor-title">编辑申请记录</h2></div>
        <span>保存申请状态后会直接返回“候选岗位”的待申请列表。</span>
      </div>
      <form onSubmit={save}>
        <label>
          <span>公司名称</span>
          <input value={company} onChange={(event) => setCompany(event.target.value)} required />
        </label>
        <label>
          <span>职位名称</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label>
          <span>申请状态</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {!applicationStatuses.includes(status) && <option value={status}>{status}</option>}
            {applicationStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <button className="primary" type="submit" disabled={saving || !company.trim() || !title.trim()}>
          {saving ? "保存中…" : status === "拒绝" ? "保存并移出我的申请" : "保存修改"}
        </button>
      </form>
      {message && <p className="application-record-editor-message" role="status">{message}</p>}
    </section>
  );
}
