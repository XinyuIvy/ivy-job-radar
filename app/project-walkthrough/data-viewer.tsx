"use client";
import { useEffect, useState } from "react";

export function DataViewer({ view, jobId }: { view: string; jobId?: string }) {
  const [value, setValue] = useState("正在读取 / Loading...");
  const [links, setLinks] = useState<{ name: string; href: string }[]>([]);
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ view });
    if (jobId) query.set("jobId", jobId);
    fetch(`/api/project-walkthrough?${query}`, { cache: "no-store" })
      .then(async response => ({ status: response.status, data: await response.json() }))
      .then(result => {
        if (!active) return;
        setValue(JSON.stringify(result, null, 2));
        const found: { name: string; href: string }[] = [];
        if (view === "vectors" && Array.isArray(result.data.objects)) {
          for (const object of result.data.objects) found.push({ name: object.key, href: object.readUrl });
        }
        if (view === "cv" && Array.isArray(result.data.rows)) {
          for (const row of result.data.rows) {
            for (const [kind, key] of Object.entries({pdf:"draft_pdf_key",tex:"draft_tex_key",text:"draft_text_key",review:"review_key",decision:"decision_key"})) {
              if (row[key]) found.push({ name: `jobId ${row.job_id} · ${kind}`, href: `/api/cv-prebuild/artifact?jobId=${row.job_id}&kind=${kind}` });
            }
          }
        }
        setLinks(found);
      })
      .catch(() => { if (active) setValue("读取失败。请登录本站后重试；此视图不会启动采集、生成或写入。 / Read failed; sign in and retry."); });
    return () => { active = false; };
  }, [view, jobId]);
  return <>
    <p>有限条数的实时样本（Live sample）。空结果表示当前没有样本，不会自动创建任务。可先记下岗位 id，再用相同 jobId 查看 cv、scores、saved 和 automation；申请记录需要另按其 application id 对应，不能混用。</p>
    {view !== "vectors" && view !== "applications" ? <form method="get"><input type="hidden" name="view" value={view} /><label>按岗位编号过滤 / jobId <input name="jobId" type="number" min="1" defaultValue={jobId} /></label><button type="submit">只读查询 / Inspect</button></form> : null}
    {links.length ? <section><h2>打开实际文件 / Open artifacts</h2><p>CV 文件接口要求岗位仍已收藏且对应文件存在；缺文件或无权限会明确返回错误，不会重新生成。</p><ul>{links.map(item=><li key={item.href}><a href={item.href}>{item.name}</a></li>)}</ul></section> : null}
    <pre className="pw-data">{value}</pre>
  </>;
}
