"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CompanyLink, WatchedCompany } from "../lib/company-watchlist";
import styles from "./watchlist.module.css";

type Draft = { id?: string; company: string; links: CompanyLink[] };
const emptyDraft = (): Draft => ({ company: "", links: [{ label: "招聘官网", url: "" }] });

export default function CompanyWatchlistClient() {
  const [companies, setCompanies] = useState<WatchedCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const request = useCallback(async (method: string, body?: unknown, id?: string, signal?: AbortSignal) => {
    const response = await fetch(`/api/company-watchlist${id ? `?id=${encodeURIComponent(id)}` : ""}`, {
      method, cache: "no-store", signal,
      headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(data?.companies)) throw new Error(data?.error || "读取失败，请重试。");
    return data.companies as WatchedCompany[];
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const rows = await request("POST", { action: "initialize" }, undefined, signal);
      if (!signal?.aborted) setCompanies(rows);
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "读取失败。");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [request]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy(true); setError("");
    try { setCompanies(await request(draft.id ? "PUT" : "POST", draft)); setDraft(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败。"); }
    finally { setBusy(false); }
  }

  async function remove(row: WatchedCompany) {
    if (!window.confirm(`从公司关注池移除“${row.company}”？不会删除岗位或申请记录。`) || busy) return;
    setBusy(true); setError("");
    try { setCompanies(await request("DELETE", undefined, row.id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "删除失败。"); }
    finally { setBusy(false); }
  }

  const needsLink = (row: WatchedCompany) => !row.links.length || row.links.every((link) => link.label.includes("待补"));
  const filtered = companies.filter((row) => (!missingOnly || needsLink(row)) && `${row.company} ${row.links.map((link) => link.url).join(" ")} ${row.positions?.map((position) => position.title).join(" ") || ""} ${row.scanStatus} ${row.scanNote}`.toLowerCase().includes(query.trim().toLowerCase()));
  const counts = companies.reduce<Record<string, number>>((result, row) => {
    const key = row.scanStatus || "尚未扫描";
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
  const updateLink = (index: number, key: keyof CompanyLink, value: string) => setDraft((current) => current && ({ ...current, links: current.links.map((link, i) => i === index ? { ...link, [key]: value } : link) }));

  return <main className={styles.page}>
    <div className={styles.content}>
      <Link href="/">← 返回 Job Radar</Link>
      <header className={styles.header}><div><p className={styles.eyebrow}>COMPANY WATCHLIST</p><h1>公司关注池</h1><p>长期维护公司的招聘入口。申请进度仍在“申请”中管理。</p></div>
        <button disabled={loading || busy || !!draft} onClick={() => setDraft(emptyDraft())}>＋ 添加公司</button>
      </header>
      <p className={styles.notice}>已完成本轮官网与公开招聘平台扫描。没有匹配岗位的公司仍保留在关注池；“岗位线索”是待复核材料，只有进入“今日岗位”的记录才算已通过完整筛选。</p>
      {error && <div className={styles.error} role="alert">{error} {!draft && <button disabled={busy || loading} onClick={() => void load()}>重新读取</button>}</div>}
      {draft && <form className={styles.editor} onSubmit={save}>
        <h2>{draft.id ? "编辑公司" : "添加公司"}</h2>
        <label>公司名称<input autoFocus required maxLength={200} disabled={busy} value={draft.company} onChange={(event) => setDraft({ ...draft, company: event.target.value })} /></label>
        {draft.links.map((link, index) => <div className={styles.linkEditor} key={index}>
          <label>链接名称<input maxLength={80} disabled={busy} value={link.label} onChange={(event) => updateLink(index, "label", event.target.value)} /></label>
          <label>官网链接<input type="url" placeholder="https://…" maxLength={4000} disabled={busy} value={link.url} onChange={(event) => updateLink(index, "url", event.target.value)} /></label>
          <button type="button" disabled={busy} onClick={() => setDraft({ ...draft, links: draft.links.filter((_, i) => i !== index) })} aria-label={`移除第 ${index + 1} 个链接`}>移除链接</button>
        </div>)}
        <div className={styles.actions}><button type="button" disabled={busy || draft.links.length >= 10} onClick={() => setDraft({ ...draft, links: [...draft.links, { label: "招聘官网", url: "" }] })}>＋ 添加链接</button><button disabled={busy}>{busy ? "保存中…" : "保存"}</button><button type="button" disabled={busy} onClick={() => setDraft(null)}>取消</button></div>
      </form>}
      <div className={styles.summary} aria-label="公司扫描概览">
        <article><span>可申请</span><strong>{counts["可申请"] || 0}</strong></article>
        <article><span>待官网核验</span><strong>{counts["待官网核验"] || 0}</strong></article>
        <article><span>其他已扫描</span><strong>{companies.filter((row) => row.scanStatus && !["可申请", "待官网核验"].includes(row.scanStatus)).length}</strong></article>
        <article><span>公司总数</span><strong>{companies.length}</strong></article>
      </div>
      <div className={styles.toolbar}><input aria-label="搜索公司、网址或扫描结论" placeholder="搜索公司、网址或扫描结论" value={query} onChange={(event) => setQuery(event.target.value)} /><label><input type="checkbox" checked={missingOnly} onChange={(event) => setMissingOnly(event.target.checked)} /> 仅看待补招聘链接</label><span>{filtered.length} / {companies.length} 家公司</span></div>
      {loading ? <p role="status">正在读取公司名单…</p> : <div className={styles.tableWrap}><table>
        <thead><tr><th>公司名称</th><th>扫描结论</th><th>官网招聘链接与线索</th><th>最近检查</th><th>操作</th></tr></thead>
        <tbody>{filtered.map((row) => <tr key={row.id}><td>{row.company}</td><td><span className={`${styles.status} ${styles[`status_${row.scanStatus}`] || ""}`}>{row.scanStatus || "尚未扫描"}</span>{row.scanNote && <p className={styles.scanNote}>{row.scanNote}</p>}</td><td>{row.links.length ? row.links.map((link) => <a className={styles.website} key={`${link.label}-${link.url}`} href={link.url} target="_blank" rel="noopener noreferrer"><strong>{link.label} ↗</strong><span>{link.url}</span></a>) : <span className={styles.muted}>待补充招聘链接</span>}
          {!!row.positions?.length && <details className={styles.positions}><summary>2027 届岗位线索 · {row.positions.length} 个</summary>
            {row.positions.map((position) => <div className={styles.position} key={position.title}>
              <strong>{position.priority} · {position.title}</strong><span>{position.location} · {position.evidenceStatus} · 核查于 {position.checkedAt}</span>
              {position.deadline && <span>参考截止：{position.deadline}</span>}
              <span>{position.notes}</span>
              <div>{position.officialUrl && <a href={position.officialUrl} target="_blank" rel="noopener noreferrer">官网/投递入口 ↗</a>}{position.evidenceUrl && position.evidenceUrl !== position.officialUrl && <a href={position.evidenceUrl} target="_blank" rel="noopener noreferrer">岗位/公告证据 ↗</a>}</div>
            </div>)}
          </details>}</td><td className={styles.muted}>{row.lastCheckedAt ? new Date(row.lastCheckedAt).toLocaleString("zh-CN") : "尚未检查"}</td><td><div className={styles.actions}><button disabled={busy || !!draft} onClick={() => setDraft({ id: row.id, company: row.company, links: row.links.map((link) => ({ ...link })) })}>编辑</button><button disabled={busy || !!draft} onClick={() => void remove(row)}>移除</button></div></td></tr>)}</tbody>
      </table>{!filtered.length && <p className={styles.empty}>{companies.length ? "没有匹配的公司。" : "关注池为空，点击“添加公司”开始维护。"}</p>}</div>}
    </div>
  </main>;
}
