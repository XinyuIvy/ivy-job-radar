import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  browserSteps, collectionSteps, cvSteps, decisions, evaluationResults,
  evidenceLevels, fileFormats, glossary, incidents, interviewQuestions,
  ragSteps, sourceMap, type PipelineStep,
} from "./content";
import "./style.css";

export const metadata: Metadata = {
  title: "Job Radar 项目面试复盘 | 每一步讲清楚",
  description: "用口语讲清每一步的输入、工具、输出、文件格式、保存位置和读取方式，详解 Agent、RAG、评估与真实问题。",
};

function Section({ id, number, title, intro, children }: { id: string; number: string; title: string; intro?: string; children: ReactNode }) {
  return <section id={id} className="ip-section"><p className="ip-eyebrow">{number} / 项目面试复盘</p><h2>{title}</h2>{intro && <p className="ip-intro">{intro}</p>}{children}</section>;
}

function Table({ headers, rows, caption }: { headers: readonly string[]; rows: readonly (readonly ReactNode[])[]; caption: string }) {
  return <div className="ip-table-wrap" role="region" aria-label={caption} tabIndex={0}><table><caption>{caption}</caption><thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

function Steps({ steps }: { steps: PipelineStep[] }) {
  return <div className="ip-steps">{steps.map((step) => <article className="ip-step" id={`step-${step.id.toLowerCase()}`} key={step.id}>
    <div className="ip-step-head"><span className="ip-step-number">{step.id}</span><h3>{step.title}</h3></div>
    <p className="ip-step-plain">{step.plain}</p>
    <dl className="ip-contract">
      <div><dt>① 输入</dt><dd>{step.input}</dd></div><div><dt>② 工具和动作</dt><dd>{step.tools}</dd></div>
      <div><dt>③ 输出</dt><dd>{step.output}</dd></div><div className="ip-storage-row"><dt>④ 格式与保存</dt><dd>{step.storage}</dd></div>
      <div><dt>⑤ 下一步怎么读</dt><dd>{step.next}</dd></div>
    </dl>
    <p className="ip-step-why"><strong>为什么这样做 / 还有什么限制</strong>{step.why}</p>
    <details className="ip-code-location"><summary>源码位置</summary><code>{step.source}</code></details>
  </article>)}</div>;
}

function Spoken({ title, children }: { title: string; children: ReactNode }) {
  return <div className="ip-spoken"><p className="ip-spoken-label">面试可以这样讲 · {title}</p><div>{children}</div></div>;
}

const navigation = [
  ["pitch", "开场怎么说"], ["architecture", "三条主线"], ["files", "文件先认全"], ["collection", "岗位怎么来"],
  ["agent", "Agent 在哪"], ["rag", "RAG 每一步"], ["algorithms", "算法讲人话"], ["cv", "JD 到 PDF"],
  ["browser", "填表怎么接"], ["metrics", "测评怎么算"], ["concepts", "术语速查"], ["decisions", "为什么这样选"],
  ["incidents", "问题与修复"], ["questions", "面试追问"], ["boundaries", "现状与源码"],
] as const;

export default function InterviewPrep() {
  return <main className="ip-shell">
    <header className="ip-top"><a href="/">← 返回 Job Radar</a><a href="/evidence-rag">打开证据问答 ↗</a><span>源码核对 · 2026-11-08</span></header>
    <section className="ip-hero">
      <p className="ip-kicker">AI 应用 / Agent / RAG · 面试口述手册</p><h1>把 Job Radar<br />一步一步讲明白。</h1>
      <p className="ip-hero-lead">先说这一步到底在干什么，再补上它的技术名字。沿着一份数据往下走，看清楚它从哪里来、经过谁处理、变成什么、存在哪里、下一步怎么接。</p>
      <div className="ip-hero-tags"><span>每步 5 项交接</span><span>用项目里的真实例子</span><span>可直接练习的口述回答</span></div>
      <div className="ip-current-grid">
        <div><b className="ip-badge ip-badge-live">已线上跑通</b><strong>证据问答 RAG</strong><p>BM25 + Qwen3 召回，BGE 重排，DeepSeek 生成。已完成 50 题固定版本评测。</p></div>
        <div><b className="ip-badge">当前暂停</b><strong>CV 自动生成</strong><p>冻结输入、工具生成和产物存储已有代码；当前自动生成开关为暂停。</p></div>
        <div><b className="ip-badge">保留人工检查</b><strong>浏览器申请流程</strong><p>扩展链路停在 needs_review，不点击最终提交；逐题回答接口仍有缺口。</p></div>
      </div>
      <p className="ip-reading-tip"><strong>第一次读：</strong>先看“三条主线”，然后挑一条流程从头读到尾。<strong>马上面试：</strong>先练开场、RAG 每一步、问题与修复、面试追问。</p>
    </section>
    <nav className="ip-nav" aria-label="本页目录">{navigation.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>

    <Section id="pitch" number="01" title="先用人话介绍这个项目">
      <Spoken title="30 秒版本"><p>“这个项目是我的求职工作台。它先把不同网站的岗位收集到一起，去掉重复的、标出不符合条件的，再帮我核对自己的真实经历。证据问答会先找资料，再给带引用的回答；简历生成有一个能调用工具做出 PDF 的 Agent 流程；浏览器扩展负责填写和上传，最后保留人工检查。核心是把信息、AI 和执行步骤接起来，而且出错后能查清楚。”</p></Spoken>
      <details className="ip-deep"><summary>展开：90 秒版本，把技术亮点也带上</summary><p>“我把项目拆成三条主线。第一条是岗位数据：从招聘接口、网页和人工入口拿岗位，统一字段、判断身份、检查是否还开放，然后存进数据库，按硬条件和匹配分展示。第二条是证据问答：我把带来源、状态和主张边界的经历事实做成结构化索引，用关键词和学习型向量两路找候选，再用专用重排模型细排，最后让生成模型根据原文回答，服务端再查引用。第三条是申请材料：把某个岗位对应的 JD、事实和模板固定成一版输入，让 Agent 用命令行写 TeX、编译 PDF，服务端把产物收回 R2，并在 D1 记录任务状态。扩展再读取资料和 PDF 填表，停在人工检查。这里主要的工程挑战是数据来源不一致、模型容易把相近经历说过头，以及长任务和文件存储可能在不同阶段失败。当前问答已实测，CV 自动生成暂停，自动队列也还有接口与并发处理的改进空间。”</p></details>
      <p className="ip-note">这是系统介绍。讲个人贡献时，用你自己实际参与、能解释代码和验证过程的部分，不把所有 AI 辅助实现都说成独立手写。</p>
    </Section>

    <Section id="architecture" number="02" title="先看三条主线，别把它们混成一个黑盒" intro="它们共用部分岗位和事实资料，但目前不是每一步都走同一个模型服务。">
      <div className="ip-lanes">
        <a href="#collection"><span>A / 岗位数据</span><h3>我去找哪些岗位？</h3><p>招聘接口或网页 → 清洗与去重 → 入 D1 → 判断条件 → 看板选择</p><small>主要靠采集代码、规则和数据库。</small></a>
        <a href="#rag"><span>R / 证据问答</span><h3>我到底做过什么？</h3><p>事实 JSONL → 向量缓存 → 两路召回 → 重排 → 检查证据 → 带引用回答</p><small>这是本轮接通 Qwen/BGE 的入口。</small></a>
        <a href="#cv"><span>C + B / 材料与执行</span><h3>怎么变成简历和表单？</h3><p>选定岗位 → 冻结材料 → Agent 生成文件 → R2 → 扩展读取、填表和上传</p><small>CV 生成暂停；扩展保留人工检查。</small></a>
      </div>
      <div className="ip-callout"><strong>最容易讲错的一点</strong><p>“项目有标准 RAG”是对的。把它说成“所有 JD 分析、简历生成、表单回答都已经统一走 Qwen + BGE”就不符合当前源码。CV Tailor 还使用本地检索与规则，CV Agent 还有自己的上下文切片流程。</p></div>
      <Table caption="谁在干什么：程序、模型、存储各有职责" headers={["部件", "用人话说", "本项目负责什么"]} rows={[
        ["普通程序与规则", "明确规定的事，照规则做", "采集、拆词、URL/ID 去重、BM25、余弦、RRF、校验、状态更新。"],
        ["Embedding 模型", "把文字变成数字表示", "Qwen3 编码问题与事实；这里不负责写回答。"],
        ["Reranker 模型", "把候选资料再排细一点", "BGE 对问题和每条候选一起评分；这里不负责新增事实。"],
        ["生成模型 / Agent", "组织回答，或围绕目标用工具干活", "DeepSeek 做证据检查与问答；CV Agent 通过另一套 API 使用 shell 产出文件。"],
        ["D1、R2、Git", "分别保存记录、文件、文件版本", "存储本身不会理解问题；R2 也不会自动帮我计算向量相似度。"],
      ]} />
    </Section>

    <Section id="files" number="03" title="先认识文件，不然流程很容易看懵" intro="文件格式说明内容怎么组织；保存位置说明东西在哪里。这两个问题要分开回答。">
      <Table caption="文件和数据类型速查" headers={["类型", "是什么", "项目里的例子", "下一步怎么读"]} rows={fileFormats} />
      <div className="ip-two-column">
        <div className="ip-paper"><h3>JSONL 为什么一行一条？</h3><p>每项经历单独做成记录，方便按编号查来源、合并修订。下面只示意字段，不是完整原文件。</p><pre><code>{`{"fact_id":"READM-011","verified_fact":"...","fact_status":"reported_result"}
{"fact_id":"PFZ-012","verified_fact":"...","fact_status":"implemented"}`}</code></pre><p>读成字符串，按换行拆开，逐行 JSON.parse，得到对象数组，再按 fact_id 建 Map。</p></div>
        <div className="ip-paper"><h3>“返回 JSON”不等于“存了 JSON 文件”</h3><p>API 可能只是通过网络返回 JSON。页面读完放进当前页面状态，并没有写磁盘。</p><p><strong>真保存：</strong>R2 的向量 .json、Git 的 jd_snapshot.md、D1 任务行。</p><p><strong>暂时使用：</strong>问题向量、前 20 候选、重排分数和当前问答结果。</p></div>
      </div>
    </Section>

    <Section id="collection" number="04" title="岗位从哪里来，怎么进入看板？" intro="按全栈开发的顺序读：谁启动任务 → 从哪里取数据 → 怎么清洗去重 → 如何入库 → 如何筛选评分 → 浏览器怎样显示。此节按统一后端 ETL 更新；说明代码行为，不代表已经执行新的生产全量扫描。">
      <div className="ip-callout ip-callout-green"><strong>先把 ETL 记成一句话：取回来，整理好，存进去。</strong><p>E（Extract）提取是发请求拿岗位；T（Transform）转换是统一字段、清洗和去重；L（Load）加载是写入数据库。两路共用同一后端服务；Python 负责获取、解析和传输，清洗、校验、评分、去重和入库由后端统一执行。页面读取时仍有业务展示逻辑。</p></div>
      <Table caption="先认工具：每个工具到底负责什么" headers={["工具", "人话解释", "运行位置与作用"]} rows={[
        ["Python + JobSpy + pandas", "采集脚本、招聘搜索库和表格处理库", "GitHub Actions 的云端 runner；收集候选、整理成记录，再做官网核验。"],
        ["TypeScript + fetch", "网站服务端语言和发 HTTP 请求的方法", "Cloudflare Workers；请求官方 ATS、解析响应、执行导入与查询。"],
        ["GitHub Actions + YAML", "按时间或点击按钮启动任务的工作流", "安装依赖、依次运行脚本、上传数据并留下日志；不是数据库。"],
        ["JSON + HTTP + curl", "数据格式、网络协议和命令行请求工具", "把 runner 的岗位文件通过 POST 交给网站 API。"],
        ["D1 + SQLite + Drizzle", "托管数据库、数据库引擎和代码访问层", "D1 保存表记录，Drizzle 将 TypeScript 查询表达为数据库操作；ORM 不是另一个数据库。"],
        ["React + useEffect + state", "浏览器界面、加载后的动作和页面内存", "请求 GET /api/jobs，把响应放进状态，重新绘制卡片。"],
      ]} />
      <div className="ip-two-column">
        <div className="ip-paper"><h3>入口一：网站自己采集</h3><p>站内请求触发 API → Worker 的 TypeScript 用 fetch 请求招聘接口 → 转换岗位对象 → 清洗与数据库写入。</p><p>中间对象可以直接传给函数，不需要先落一个 Python JSON 文件。具体来源仍由各自适配逻辑处理。</p></div>
        <div className="ip-paper"><h3>入口二：Python 定时扫描</h3><p>GitHub Actions → collect_raw_jobs.py → raw_jobs_latest.json → sync_raw_jobs.py 拆批上传 → ingestJobs 统一清洗、校验和去重 → D1。</p><p>这是跨运行环境的交接，所以需要文件和 HTTP。两条入口最后都可以被 GET /api/jobs 读取。</p></div>
      </div>
      <h3>逐步拆解：沿着一条岗位记录走到底</h3>
      <Steps steps={collectionSteps} />
      <h3>跟着一个例子，把“文件”和“数据库记录”分清楚</h3>
      <p>下面的公司和编号都是教学示例，字段只保留一小部分。实际来源的原始字段并不一致。</p>
      <Table caption="同一条岗位在各阶段的样子" headers={["阶段", "数据是什么样", "谁读它"]} rows={[
        ["接口原始响应", '例如 {"id":"123","title":"AI Engineer","location":{"name":"Chicago"}}；还没有通用字段规范。', "来源适配代码解析 JSON，提取所需字段。"],
        ["转换后的通用记录", '{"company":"Example","title":"AI Engineer","location":"Chicago","job_url":"https://example.com/jobs/123?utm_source=a","application_id":"123"}', "清洗与身份判断代码；此例只示意数据流，是否通过现有筛选需另判。"],
        ["清洗去重之后", "规范链接去掉 utm_source；若另一入口也拿到同一岗位，则合并来源，保留较完整的 JD。", "统一后端内存对象，再交给 D1 存储适配器。"],
        ["脚本文件 / 上传正文", "all_jobs_latest.json 是数组；batch-0001.json 是拆出的一小批；curl 上传的是文件内容。", "POST /api/jobs/import 的 request.json() 解码。"],
        ["D1 数据行", "jobs 表中公司、标题、链接、JD 等成为列，id 是站内记录主键；重扫同岗位通常更新原记录。", "GET /api/jobs 和后续按 jobId 查资料的接口。"],
        ["看板响应 / 页面状态", "服务端返回 JSON 数组；浏览器 response.json() 后调用 setDailyJobs(rows)，React 根据状态渲染。", "岗位卡片和筛选交互。JSON 响应不是又存了一份永久文件。"],
      ]} />
      <details className="ip-deep"><summary>展开：面试官让你说“具体怎么写”，怎么回答？</summary>
        <p><strong>1. 请求与解析：</strong>服务端 await fetch(url)，先检查 HTTP 是否成功，再 await response.json() 或 response.text()。JSON 直接按字段读；HTML 要按来源提取内容。不能把 200 状态码自动等同于内容完整。</p>
        <p><strong>2. 建统一结构：</strong>给岗位定义公司、标题、地点、链接、JD、来源和检查时间；各来源适配器负责映射。Python 字典和 TypeScript 对象都是内存中的键值结构，JSON 是把它们编码后保存或传输的格式。</p>
        <p><strong>3. 判断身份：</strong>先规范链接、保留岗位编号，再与已有记录比对。本批去重和数据库查重都由后端使用 sameLogicalJob 完成。不能只按标题去重。</p>
        <p><strong>4. 写数据库：</strong>本项目是先 SELECT 找已有记录，再分别 UPDATE 或 INSERT；已有非空内容不能被新来的空内容轻易覆盖。并发下两次查询可能都认为不存在，这是需要事务、唯一约束或原子写入继续完善的地方，不能说当前已经解决。</p>
        <p><strong>5. 返回与展示：</strong>API 从数据库读取并组织结果，返回 JSON；前端 fetch 后更新 React state。写入成功与页面刷新是两个动作，不能只因为脚本生成了文件就认定看板已更新。</p>
        <p><strong>SQL 概念示意：</strong>SELECT 是查，INSERT 是新增，UPDATE 是改。源码通过 Drizzle 表达这些操作，下面不是可直接照抄的完整生产 SQL。</p>
        <pre><code>{`SELECT * FROM jobs WHERE canonical_url = ?;
INSERT INTO jobs (...) VALUES (...);
UPDATE jobs SET description = ?, checked_at = ? WHERE id = ?;`}</code></pre>
      </details>
      <details className="ip-deep"><summary>展开：出了问题，按哪一层排查？</summary>
        <Table caption="排障顺序与面试追问" headers={["现象 / 追问", "先看什么", "当前边界 / 改进方向"]} rows={[
          ["为什么今天没新增？", "Actions 是否启动、哪一步失败、来源是否返回空、JSON 条数、接口 created / updated / skipped。", "可能全是已有岗位、被过滤或来源失败；零新增不等于没有招聘。"],
          ["JSON 有岗位，网页却没有？", "是否真的上传、HTTP 状态码、是否通过过滤、D1 是否写入、GET 是否过滤、浏览器是否重新读取。", "逐段检查交接，不能只看扫描脚本最后显示完成。"],
          ["网络重试会不会重复？", "规范链接、官方编号、sameLogicalJob、已有记录查找。", "更新已有记录有助于重复执行；跨批事务、并发原子性仍是改进项。"],
          ["为什么不同岗位被合并？", "URL 是否删掉了身份参数、编号是否跨公司撞号、标题和地点是否过于相似。", "Python 与 TS 入口规则仍有差异；需要统一身份规则与冲突用例。"],
          ["为什么适合我的 AI 岗位不见了？", "Python、导入接口、hard exclusions 和展示阶段是否仍有旧排除规则。", "规则分散是已看到的维护问题；此轮只更新学习文档，没有改生产求职规则。"],
          ["数据量变大怎么办？", "请求大小、批次数、数据库查询范围、慢查询与页面响应时间。", "现有整表读后处理需要分页、索引与按条件查询；本项目没有实测大规模性能结论。"],
          ["怎么评价这套 ETL？", "来源成功率、必填字段缺失率、核验状态、重复记录、入库统计、checked_at 新鲜度。", "已有日志与部分统计不等于已有完整监控平台；需要定义口径后再报告数值。"],
        ]} />
      </details>
      <Spoken title="全栈岗位数据链路，约 90 秒"><p>“岗位数据有两个入口。一条是 Cloudflare Worker 上的 TypeScript 通过 fetch 请求官方招聘系统；另一条是 GitHub Actions 跑 Python，使用 JobSpy 和其他扫描器获取候选，再核验官网。提取后把不同来源映射为统一岗位结构，规范 URL、处理缺失信息，并按链接、岗位编号等判断重复。Python 结果先汇总成 JSON，拆批后通过 HTTP POST 导入；后端校验身份和字段，用 Drizzle 查询 D1，已有岗位更新，新岗位插入。之后业务规则分别判断资格和匹配分，GET 接口把数据返回给浏览器，React 更新状态后显示看板。工程上要关注来源失败、重复导入、误合并、规则不一致，以及数据库写入成功但页面尚未刷新的区别。当前并发原子性和整表查询扩展性还有改进空间。”</p></Spoken>
      <div className="ip-callout"><strong>AI 辅助开发，个人贡献怎么讲？</strong><p>可以说“我借助 AI 实现，自己负责需求、链路设计、规则确认、源码核对与验证”，前提是这些确实由你完成。仅仅读懂这节内容，还不能说独立手写了全套系统。练习时要能顺着一条真实岗位，解释来源记录、汇总 JSON、导入响应、数据库行和页面结果如何对应。</p></div>
    </Section>

    <Section id="agent" number="05" title="到底哪一部分是 Agent？" intro="重点看它是否围绕目标执行工具动作、读取反馈并继续工作，而不是看产品名字里有没有 Agent。">
      <div className="ip-callout ip-callout-green"><strong>本项目最明确的 Agent：从冻结材料生成可检查的简历文件。</strong><p>它使用 shell 操作文件，编译和检查产生反馈，再据此修改。程序在外面约束输入、记录状态、回收产物。这样描述比“整个网站都是 Agent”更准确。</p></div>
      <ol className="ip-cycle"><li><span>01</span><h3>读输入</h3><p>读 JD、事实、模板和规则，确定能写什么。</p></li><li><span>02</span><h3>调用工具</h3><p>用 shell 写 TeX，再用 LuaLaTeX 编译 PDF。</p></li><li><span>03</span><h3>看反馈</h3><p>检查编译错误、页数和抽取文本。</p></li><li><span>04</span><h3>修改并交付</h3><p>按反馈修文件，再由服务端取回保存。</p></li></ol>
      <Table caption="三个概念不要互相替代" headers={["说法", "准确理解", "对应项目"]} rows={[
        ["调用模型 API", "程序发请求，模型返回内容。是否是 Agent 还要看后续行为。", "DeepSeek 字段选择。"],
        ["固定的 RAG 工作流", "程序安排好检索、重排、检查和生成顺序。", "当前 evidence-rag，不自主选择所有工具和路线。"],
        ["工具型 Agent 工作流", "模型在目标与工具范围内做多步操作，依据反馈继续处理。", "CV 的 hosted shell 任务；外围仍有确定性的编排代码。"],
      ]} />
      <Spoken title="为什么不是普通聊天机器人"><p>“因为它需要把任务做到能交文件：使用工具写源文件、编译、检查并修复。同时我把版本、状态和存储交给程序控制，模型不能自己决定写回事实库或把申请标成已提交。”</p></Spoken>
    </Section>

    <Section id="rag" number="06" title="RAG 全过程：每一步的输入、工具、输出与交接" intro="先准备事实与可复用向量，再处理这次的问题。以下是标准模型模式；本地原文模式没有学习型 embedding、专用 reranker 或模型生成。">
      <div className="ip-route-bar"><span>资料侧：R1～R3</span><span>问题与检索：R4～R7</span><span>证据与回答：R8～R10</span></div>
      <div className="ip-example"><span>一直拿这道题做例子</span><h3>“XGBoost 在后期时间验证队列的 AUC 是多少？”</h3><p>目标事实是 <code>READM-011</code>。线上复测最后回答 <strong>0.745</strong>，并附对应引用。看它怎样从事实文件走到这句话。</p></div>
      <Steps steps={ragSteps} />
      <div className="ip-callout"><strong>步骤多，不代表每步都调用一次大模型。</strong><p>读 JSONL、BM25、余弦、RRF 和引用校验都是程序。文档向量全部命中缓存且证据足够时，通常是 1 次问题 embedding、1 次 BGE、2 次 DeepSeek（检查与生成）。首次为 133 条事实编码时，还会有 9 批文档 embedding 请求。缓存、并行与提前返回会改变耗时。</p><p>R3 是 R2 读缓存前的版本检查；代码会并行准备文档向量与问题向量。编号为了讲清职责，不代表 10 次串行模型调用。</p></div>
      <Table caption="RAG 里什么真的保存了？" headers={["东西", "位置 / 格式", "下次怎么用"]} rows={[
        ["原始事实与修订", "Git 中 3 个 JSONL 文件", "GitHub API 读取，逐行解析并按 fact_id 合并。"],
        ["事实缓存", "当前 Worker 实例内存，约 5 分钟", "同一实例可复用，不是所有实例永久共享。"],
        ["文档向量", "R2 分批 JSON，二维数值数组", "按指纹路径 bucket.get，JSON.parse，验证 1024 维，与事实顺序对齐。"],
        ["问题向量、候选与分数", "本次请求内存中的数组 / Map", "直接传给相似度、RRF 和后续步骤，不逐步落盘。"],
        ["最终问答", "API JSON → React state", "页面显示回答与引用，当前刷新后不保留问答历史。"],
      ]} />
    </Section>

    <Section id="algorithms" number="07" title="把生涩的算法名，彻底讲成人话" intro="先理解解决什么问题，再看公式。演算数字是教学示例，项目成绩在“测评怎么算”一节。">
      <details className="ip-deep" open><summary>1. BM25 到底怎么算？它不是“BM2.5”</summary>
        <p><strong>先看词有没有对上，再决定这个词值得加多少分。</strong>越少见的词越有区分力；多出现会加分，但越加越慢；文章很长时要防止它因为词多占便宜。</p>
        <Table caption="公式里的变量" headers={["变量", "直白含义", "项目实现"]} rows={[
          ["N、df(t)", "总共几条事实；几条提到这个词", "同一个词在一条事实出现 10 次，df 仍只加 1。"],
          ["f(t,d)", "这个词在当前事实出现几次", "出现越多贡献越大，但会饱和。"],
          ["L、avgL", "当前文本词项数；全部文本平均词项数", "使用拆词后的长度，不是 PDF 页数。"],
          ["k1=1.5、b=0.75", "词频饱和程度、长度修正强度", "当前固定配置，未系统调参；b=0 不做长度修正。"],
        ]} />
        <pre className="ip-formula"><code>{`IDF(t) = ln(1 + (N - df(t) + 0.5) / (df(t) + 0.5))

BM25(q,d) = Σ IDF(t) × f(t,d) × (k1+1)
                     / [f(t,d) + k1 × (1-b + b × L/avgL)]`}</code></pre>
        <p><strong>手算一个词：</strong>假设 100 条事实中 10 条提到它，IDF 约 2.264。文本长度等于平均长度，出现 1 次约得 2.264 分；出现 3 次约得 3.774 分，没有翻 3 倍。如果出现 3 次、文本却是平均长度的 2 倍，则约得 3.019 分。对问题的各个不同词项算完再相加。</p>
        <p>这是排序分，不是概率。BM25 属于词法/稀疏检索，也可以用词项权重表示，不能简单说“它绝对与向量无关”。本实现直接逐条算分，没有部署专用全文检索引擎。</p>
      </details>
      <details className="ip-deep"><summary>2. TF-IDF + 余弦，与 BM25 有什么区别？</summary>
        <Table caption="两种词项方法" headers={["角度", "TF-IDF + 余弦", "BM25"]} rows={[
          ["基本做法", "词项加权成稀疏向量，再比较方向。", "查询词的贡献相加，得到检索分。"],
          ["出现次数", "取决于使用原始、对数等 TF 定义。", "公式中显式设置词频饱和。"],
          ["文本长短", "余弦归一化会影响长短，不能说完全不处理长度。", "用 L/avgL 和 b 显式调节长度影响。"],
          ["共同限制", "没有共享词项时难以处理同义改写。", "也不天然理解所有同义、跨语言表达。"],
        ]} /><p>确切词项匹配都可以作为基线，谁更好要同集比较。本项目使用 BM25，还没专门与 TF-IDF + 余弦做对照，不能说它任何场景都更好。</p>
      </details>
      <details className="ip-deep"><summary>3. 本地哈希向量是什么？与 embedding 差在哪？</summary>
        <p>想象有 384 个数字格子。程序把词和字符三元组用固定 FNV-1a 哈希映射到格子，累计加 1 或减 1，最后归一化。相同片段会走到相同格子，不同片段也可能撞格。<strong>格子关系没有通过训练学出来。</strong></p>
        <p>学习型 embedding 的数值来自训练后的模型，可以尝试把同义改写或不同语言的相关文本放得更近。本地哈希主要依赖词形重合，不能说已经学会语义。</p><p>记住：哈希能产向量；余弦负责比较；Qwen3 是新接入的学习型编码模型。SHA-256 内容指纹则只确认版本，不做语义表示。</p>
      </details>
      <details className="ip-deep"><summary>4. Embedding 模型里面发生了什么？</summary>
        <p>文本拆成模型 token，经训练好的神经网络处理，再汇总为固定长度的表示。不是把“医疗”放第 1 维、“AI”放第 2 维，各维通常不能这样直接解释。</p>
        <p>检索训练会利用相关与不相关文本的关系，让有用的表示更容易接近。模型的语言、领域、长度、维度和训练数据会影响效果。这里调用现成 Qwen3，没有用自己的事实训练或微调。</p><p>参数多或维度大不自动等于更适合。换编码模型时要重算文档向量，并隔离版本；模型和向量数据库是两个部件，模型不会自带你的知识库。</p>
      </details>
      <details className="ip-deep"><summary>5. Reranker 为什么还要把问题和资料一起读？</summary>
        <p>Embedding 把问题和资料分别压成向量再比较；cross-encoder reranker 把这一对文本一起送进模型，互相结合后输出相关性分。计算更重，所以先缩小候选再用。</p>
        <p>“调用 Qwen3 接口”与“训练 Qwen3”很相关，却不是同一项经历。因此即使重排靠前，后面的充分性检查仍然必要。BGE 不写最终答案，也不能找回初筛已经丢掉的资料。</p><p>可以对照其他 BGE 版本、Qwen3 Reranker 或生成模型重排，但当前未完成横向评测，不能说所选组合唯一或最优。同品牌不是要求，问题与文档的 embedding 空间兼容才是要求。</p>
      </details>
      <details className="ip-deep"><summary>6. 余弦、点积、欧氏距离有什么区别？</summary>
        <Table caption="向量比较方法" headers={["方法", "看什么", "要记住"]} rows={[
          ["余弦", "(q·d)/(||q||×||d||)，比较方向。", "当前向量召回使用；不是模型，不是相关概率。"],
          ["点积", "Σqᵢdᵢ，受方向和长度共同影响。", "双方都归一化为单位向量时，点积等于余弦。"],
          ["欧氏距离", "√Σ(qᵢ-dᵢ)²，越小越近。", "单位向量有 L2²=2-2cos，因此近远顺序对应。"],
        ]} /><p>[1,0] 与 [2,0] 方向相同、长度不同，余弦是 1，点积是 2，欧氏距离是 1。选择要和模型约定匹配，不能把不同模型的向量混起来直接比较。</p>
      </details>
      <details className="ip-deep"><summary>7. RRF 怎么合并两份名单？</summary><p>事实 A 在两路都第 1，融合分为 1/61+1/61≈0.0328；B 只在向量名单第 1，只得 1/61≈0.0164。两路都靠前的更容易留下。它避免直接比较 BM25 的 8 分和余弦的 0.8。</p><p>常数 60 控制名次贡献；Top-K 的 20、5 控制保留条数。它们不是同一个参数，也不是正确率。</p></details>
    </Section>

    <Section id="cv" number="08" title="从一个 JD 到一份 PDF，文件怎么一路传？" intro="这是已实现的 CV 工作流说明。当前自动生成暂停。">
      <Steps steps={cvSteps} />
      <Table caption="简历五件套，每个文件做什么" headers={["文件", "里面是什么", "谁读取 / 后续用途"]} rows={[
        ["cv_draft.tex", "文字、结构与版式源文件。", "LuaLaTeX 编译；后续修改源文件。"],
        ["cv_draft.pdf", "可预览、可上传的简历。", "网页查看和扩展上传；存在不等于质量已验证。"],
        ["cv_draft.txt", "从 PDF 抽出的纯文本。", "检查实际文字、缺字、乱码和遗漏。"],
        ["cv_review.md", "事实选择、措辞与遗留问题等审校说明。", "人工检查参考；自评不替代独立核验。"],
        ["application_decision.json", "资格、建议动作、硬门槛和支持项。", "程序或人工审计，不是模型扩大权限的凭证。"],
      ]} />
      <Spoken title="文件如何衔接"><p>“输入按任务 ID 存 Git 文件包，再把这次实际附加的内容发给模型。Agent 在工具容器生成文件，服务端下载存 R2，并把对象键记到 D1。之后页面或扩展先从 D1 找键，再去 R2 取到真正的 PDF 字节。”</p></Spoken>
    </Section>

    <Section id="browser" number="09" title="扩展拿到资料和 PDF，怎么填表？" intro="重点说明自动队列。手动选择已申请记录或模板的 autofill 入口还可能从 Git 取简历，不要混为同一路径。"><Steps steps={browserSteps} /><div className="ip-callout"><strong>字段映射和自由回答申请问题，是两件事。</strong><p>match-field 已实现的是“这个字段对应哪个已有资料键”。自动队列调用的 semantic-answers 路由当前不存在，不能描述成已经能完整回答所有自定义问题。失败会被记录，任务保留待人工检查。</p></div></Section>

    <Section id="metrics" number="10" title="Recall、MRR、NDCG：到底测了什么？" intro="2026-11-08：固定 50 题 Evidence QA 测试集，包含 45 道有答案题和 5 道无答案难负例；资料库有 133 条可检索事实。">
      <Table caption="指标分别在问什么" headers={["指标", "人话解释", "计算"]} rows={[
        ["Recall@K", "前 K 找回多少应该找回的相关资料？", "单题：前 K 中相关数 / 全部已标相关数，再取问题平均。本次单目标，等于命中率。"],
        ["MRR@K", "第一条正确结果出来得早不早？", "第一条正确结果在第 r 名得 1/r；前 K 没有得 0，再取平均。"],
        ["NDCG@K", "前 K 排名离理想排序多远？", "DCG=Σ(2^相关等级-1)/log₂(名次+1)，除以理想排序 DCG，再对问题平均。"],
      ]} />
      <div className="ip-two-column"><div className="ip-paper"><h3>本次 NDCG 怎样算？</h3><p>有答案题主要标 1 条目标事实。目标第 1 名得 1；第 2 名约 0.631；第 3 名 0.5；第 4 名约 0.431；不在前 5 得 0。最后对 45 道有答案题平均。</p></div><div className="ip-paper"><h3>无答案题另算</h3><p>无答案题没有目标 fact_id，不能混进 Recall 的分母。我单独跑完整问答链路，看系统是否明确拒答并返回 0 条引用，本轮是 5/5。</p></div></div>
      <Table caption="50 题固定版本评测，检索分数不等于生成准确率" headers={["阶段", "Recall / 命中", "MRR", "NDCG@5"]} rows={evaluationResults.map((item) => [item.stage, item.recall, item.mrr, item.ndcg])} />
      <Table caption="这 50 题包含什么" headers={["题目类型", "数量", "怎样判定"]} rows={[
        ["有答案 Evidence QA", "45", "目标 fact_id 是否进入候选，并记录第一次出现的排名。"],
        ["无答案难负例", "5", "完整链路是否明确拒答，而且不返回任何事实引用。"],
        ["合计", "50", "中英文、精确术语、同义改写、数字、状态边界和无答案问题。"],
      ]} />
      <div className="ip-callout"><strong>这次能得出的结论</strong><p>本地 BM25 + 固定哈希在前 20 找回 39/45；加入 Qwen3 语义召回和 RRF 后是 45/45。BGE 只看融合后的候选并压到前 5，保留 44/45，唯一漏项是 QA-044。</p><p>5 道无答案题都正确拒答并返回 0 条引用。混合召回的 100% 只属于这套固定的直接事实问答，不表示生成回答、开放问题或整个项目 100% 正确。</p></div>
      <div className="ip-callout"><strong>为什么第一版 50 题看起来很低？</strong><p>第一版把 26 道“拿一条 JD 要求，寻找可迁移能力”的题也塞进直接事实问答。这个子集的混合 Recall@20 只有 19.9%，把总分拉到 55.7%。它需要多事实归纳、证据等级和简历能力映射，目标与单事实问答不同。</p><p>我保留它作为压力测试，但不再和 Evidence QA 合成一个分数。正确做法是分别定义任务、标注和合格线，再测 CV Tailor 那条结构化证据链。</p></div>
      <h3 className="ip-subtitle">检索分高以后，回答还要另外测</h3>
      <Table caption="还需要评估什么" headers={["层次", "怎么检查", "目前覆盖"]} rows={[
        ["充分性与拒答", "无答案是否说明不足；有答案是否误拒。", "5 道固定难负例全部拒答且 0 引用；45 道有答案题的最终回答误拒率仍需逐题标注。"],
        ["答案忠实度", "拆成事实主张，逐条检查是否被原文支持，汇总支持比例。", "有引用代码检查与少量人工复核，无统一忠实度分数。"],
        ["正确与完整", "是否回答问题，数字对象是否对应，有没有漏条件。", "AUC 能答 0.745；负二项有原文回退，不能说答案评测满分。"],
        ["耗时与成本", "分阶段计时和记用量，区分冷/热缓存，统计中位数与尾部延迟。", "本轮未系统记录，不报未经测量的改善百分比。"],
        ["稳健性与组件对照", "改写、中英混合、多事实、冲突、过期、无答案与恶意输入；比较各检索组合。", "需要固定版本的独立标注集，再做 BM25-only、向量-only、融合、加重排对照。"],
      ]} />
      <Spoken title="面试问成绩"><p>“我冻结了 50 题测试集，其中 45 题有目标事实，5 题故意无答案。本地 BM25 加哈希向量的 Recall@20 是 86.7%；加入 Qwen3 embedding 和 RRF 后是 100%，MRR 0.833，NDCG@5 0.876；BGE 重排压到前 5 后 Recall@5 是 97.8%，MRR 0.941，NDCG@5 0.950。5 道无答案题全部拒答且 0 引用。这个分数只评价直接证据问答检索，生成忠实度、耗时和岗位能力迁移还要另外测。”</p></Spoken>
    </Section>

    <Section id="concepts" number="11" title="术语速查：中文意思与项目例子" intro="陌生词先查这一栏。专业名词可以记，回答时先说它在这里做了什么。"><div className="ip-glossary">{glossary.map(([term, plain, example]) => <article key={term}><h3>{term}</h3><strong>{plain}</strong><p>{example}</p></article>)}</div><h3 className="ip-subtitle">证据分级，为什么不能只看“相关”？</h3><Table caption="CV 分析证据类别，标准问答另有充分性检查" headers={["名字", "口语意思", "例子"]} rows={evidenceLevels} /></Section>

    <Section id="decisions" number="12" title="为什么这样做，比别的方法好在哪里？" intro="讲清场景与代价。没有做过对照，就不要把选择理由说成已经证明更优。"><div className="ip-decisions">{decisions.map(([question, implementation, tradeoff]) => <article key={question}><h3>{question}</h3><dl><dt>现在怎么做</dt><dd>{implementation}</dd><dt>优势和代价</dt><dd>{tradeoff}</dd></dl></article>)}</div></Section>

    <Section id="incidents" number="13" title="什么问题，怎么改，改完怎么验？" intro="前三项来自本轮实测；后面是源码已有的防护和仍未补齐的工程问题。"><div className="ip-incidents">{incidents.map((item, i) => <article key={item.title}><div className="ip-incident-head"><span>CASE {String(i + 1).padStart(2, "0")} · {item.label}</span><h3>{item.title}</h3></div><dl><dt>看到的现象</dt><dd>{item.symptom}</dd><dt>为什么发生</dt><dd>{item.cause}</dd><dt>怎样处理</dt><dd>{item.fix}</dd><dt>还没解决什么</dt><dd>{item.limit}</dd></dl></article>)}</div></Section>

    <Section id="questions" number="14" title="面试追问：用口语直接练习" intro="先自己说，再展开核对。每题都有继续追问时要讲清的点。"><div className="ip-questions">{interviewQuestions.map(([question, answer, followup], i) => <details key={question}><summary><span>{String(i + 1).padStart(2, "0")}</span>{question}</summary><div className="ip-question-body"><p className="ip-answer">{answer}</p><p className="ip-followup"><strong>继续追问时：</strong>{followup}</p></div></details>)}</div></Section>

    <Section id="boundaries" number="15" title="把“已做、已测、没做完”分清楚">
      <Table caption="截至 2026-11-08 的面试表述" headers={["可以说", "需要带上的限定"]} rows={[
        ["接入学习型 embedding 和专用 reranker。", "证据问答已跑通，不等于训练模型或全站统一接入。"],
        ["做过固定 50 题 RAG 评估。", "45 道直接证据题加 5 道无答案题；不能说生成或整体准确率达 100%。"],
        ["有能调用 shell 的简历 Agent。", "自动生成暂停，指令要求与独立强制验证要分开。"],
        ["有状态、版本键与恢复逻辑。", "不是所有环节已原子化，浏览器领取与 Git 冲突处理还有缺口。"],
        ["扩展读取资料与 PDF，执行填表上传。", "最终停待人工检查；逐题回答路由未完整接通。"],
        ["用规则和反馈改善岗位筛选。", "没有训练推荐模型，没有可宣称的线上 AUC 或申请转化提升。"],
      ]} />
      <h3 className="ip-subtitle">想看代码，按问题去找</h3><div className="ip-sources">{sourceMap.map(([topic, path]) => <div key={topic}><strong>{topic}</strong><code>{path}</code></div>)}</div>
      <details className="ip-deep"><summary>专业概念的原始资料</summary><p>项目行为以源码和实测为准，下面用于核对概念与模型职责。</p><ul className="ip-references">
        <li><a href="https://huggingface.co/Qwen/Qwen3-Embedding-0.6B" target="_blank" rel="noreferrer">Qwen3-Embedding-0.6B 官方模型卡</a></li>
        <li><a href="https://huggingface.co/BAAI/bge-reranker-base" target="_blank" rel="noreferrer">BGE Reranker 官方模型卡</a></li>
        <li><a href="https://nlp.stanford.edu/IR-book/html/htmledition/okapi-bm25-a-non-binary-model-1.html" target="_blank" rel="noreferrer">Stanford 信息检索教材：BM25</a></li>
        <li><a href="https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf" target="_blank" rel="noreferrer">RRF 原论文</a></li>
        <li><a href="https://github.com/beir-cellar/beir" target="_blank" rel="noreferrer">BEIR 官方评测仓库</a></li>
      </ul></details>
    </Section>
    <footer className="ip-footer"><a href="/">返回 Job Radar</a><a href="/evidence-rag">试一次 RAG ↗</a><a href="#pitch">回到开场 ↑</a><span>口语版 · 源码核对 · 2026-10-29</span></footer>
  </main>;
}
