import snapshot from "./source-snapshot.json";
import { DataViewer } from "./data-viewer";
import "./style.css";

export const metadata = { title: "Job Radar 源码与数据走读 | Project Walkthrough" };
export const dynamic = "force-dynamic";

export default async function Walkthrough({ searchParams }: { searchParams: Promise<{ file?: string; view?: string; jobId?: string }> }) {
  const params = await searchParams;
  const files = snapshot.files as Record<string, { content: string; sha256: string }>;
  const selected = params.file && Object.hasOwn(files, params.file) ? files[params.file] : undefined;
  const views = ["jobs", "saved", "applications", "scores", "cv", "automation", "vectors"];
  const view = params.view && views.includes(params.view) ? params.view : undefined;
  return <main className="pw-shell">
    <header><a href="/">← Job Radar</a><a href="/interview-prep#collection">面试复盘 / Interview guide</a><a href="/project-walkthrough">文件目录 / Source catalog</a></header>
    <p className="pw-eyebrow">PRIVATE PROJECT WALKTHROUGH · 源码与只读数据</p>
    <h1>{selected ? params.file : view ? `实时样本 / Live sample: ${view}` : "跟着代码和数据，走完项目。"}</h1>
    <p className="pw-note">源码快照基线：<code>{snapshot.sourceCommit}</code> · 捕获时间：{snapshot.capturedAt}。这是本次构建工作区的逐字快照，以上提交为工作区基线，每份文件带 SHA-256；不是 GitHub main 的实时镜像。链接只展示允许的代码文件，密钥值和环境文件未收录。</p>
    {params.file && !selected ? <p role="alert">该文件未收录，请从目录选择。 / File not in snapshot.</p> : null}
    {selected ? <><p>文件 SHA-256：<code>{selected.sha256}</code> · 行号可以点击复制链接。对照 XMind 备注中的函数名查找。代码为只读展示，不会执行。</p><ol className="pw-code">{selected.content.split("\n").map((line, index) => <li id={`L${index + 1}`} key={index}><a href={`#L${index + 1}`} aria-label={`Line ${index + 1}`}>{index + 1}</a><code>{line || " "}</code></li>)}</ol></> : view ? <DataViewer view={view} jobId={params.jobId} /> : <>
      <section><h2>先看实际数据 / Inspect data</h2><p>这些入口只 SELECT 已有记录或读取 R2，不启动扫描、RAG 或 CV 生成。API 另外要求登录；预览环境无登录头时会返回 401。</p><nav>{views.map(item => <a key={item} href={`?view=${item}`}>{item}</a>)}</nav></section>
      <section><h2>怎样从 XMind 走读 / How to read</h2><p>按编号打开详细图，在每步点“源码 / Code”“数据 / Data”链接，再读交接备注：输入 → 工具与运行位置 → 输出与保存 → 下一步。内存对象没有永久文件链接，需要用浏览器 Network 检查实际响应；生成任务暂停时应检查已有产物，不需要重启任务。</p></section>
      <section><h2>源码目录 / Source files ({Object.keys(files).length})</h2><p>先从对应步骤给出的入口函数开始，不必从头通读整个大文件。浏览器查找可搜索函数名。</p><ul className="pw-files">{Object.keys(files).sort().map(file => <li key={file}><a href={`?file=${encodeURIComponent(file)}`}>{file}</a></li>)}</ul></section>
    </>}
  </main>;
}
