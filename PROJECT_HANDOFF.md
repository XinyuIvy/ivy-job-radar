# Job Application / CV Knowledge Base 项目交接

最后更新：2026-08-22（America/New_York）

## 最高优先级交接：Autofill 0.4.11 已发布，下一阶段接入 CV Prebuilder Workspace Agent

> 本节是 2026-08-22 当前最高权威，覆盖下方所有仍写着“当前生产权威”“0.4.6”“尚未自动生成 CV”或其他旧 next step 的章节。旧内容只用于追溯，不得把扩展回退到旧版本，也不得重新建立另一套自动填表或 CV 定制流程。

### A. 当前版本与验收锚点

- Ivy Job Radar 生产 Site：`https://ivy-job-radar.rourou1199.chatgpt.site`
- Autofill 0.4.11 的生产代码锚点是 Site version 137；后续只修改 handoff 的 checkpoint 会继续增加 Site version，但不代表扩展代码再次变化。
- Chrome 扩展版本：`0.4.11`，弹窗顶部应显示 `AUTOFILL V4.11`。
- GitHub `XinyuIvy/ivy-job-radar@main` 的 0.4.11 同步提交：`28ffa555a475625550bb94add3b4c7534ca4633f`。
- 全局自动填表资料：`XinyuIvy/CV@main:master/application-forms/application-autofill-profile.md`。
- 期刊评级资料写入提交：`1fdc36caa9d9bd8282388c6fa44a50fd07ee7d97`。
- 发布前验收：32 个前端/运行时测试、235 个 Python 测试、lint 与生产 build 全部通过。
- 用户固定扩展目录：`/Users/ivyzhang/Documents/Development_Projects/ivy-job-radar/browser-extension`。以后继续使用 `git pull origin main`、Chrome Reload、刷新申请页，不要求反复下载 ZIP。

#### A.1 2026-08-22 最新站点修复

- CV Prebuilder Phase 1 已完成：新增 `cv_prebuild_jobs` D1 状态表、安全 migration、收藏状态初始化/取消和候选岗位 badge。代码锚点为 Site version 143 / commit `9f37143`，GitHub `main` 同步提交为 `ba0f5614bbab7749b6bfc83e02aa05a676375c1f`。本阶段没有调用 Agent、没有创建 PRECV bundle、没有自动生成或提交 CV。下一 Chat 必须从 Phase 2 的 PRECV bundle 开始，不得重复 Phase 0–1。
- Phase 1 对已有收藏做了安全回填：没有完整 JD 的岗位显示 `blocked_missing_jd`，有完整 JD 但尚未配置 Agent 的岗位显示 `blocked_configuration`；取消收藏会标记 `cancelled`。UI 已覆盖 queued、准备 bundle、Agent 排队/运行、ready、stale、可重试/终止失败和 cancelled badge，供后续阶段直接复用。
- Phase 1 验收为 37 个 Node 测试、243 个 Python 测试、lint、production build、Drizzle 再生成和“旧库已含 scan_status 新列”的 migration 模拟全部通过。Drizzle 历史 `0010_snapshot.json` 缺少末尾 `}` 的已有错误也已修复；`0013` migration 明确不重复 ALTER `scan_status`，避免再次触发数据库冷启动失败。
- CV Prebuilder Phase 0 已完成：`/api/saved-jobs` 现在有 D1 权威持久化、POST/DELETE 幂等与失败回滚，代码锚点为 Site commit `a61f38e`。后续不得重复实现 Phase 0。
- 候选岗位的事实库评分与定制 CV 曾共同报错 `Cannot read properties of undefined (reading 'tech')`。根因是 NeuroStat 等旧事实记录没有 `industry_translation`，Hybrid RAG 与 CV analyze 却直接读取对应 track。现在缺失行业翻译时回退到 `no_evidence` 翻译层，仍使用真实方法、BM25、embedding、concept graph 和事实边界完成评分，不丢弃该事实，也不让整份分析失败。
- 申请列表已经改成高密度三列单行清单，每条只显示公司、岗位和申请日期；备注、匹配度、Application ID、下一步、跟进日期、截止日期和行内操作按钮不再显示。标题显示当前 bucket 的记录数量。
- 本轮代码锚点为 Site version 141 / commit `780fbfa`。验收包括 240 个 Python 测试、9 个 Hybrid RAG 定向测试、lint 和 production build。单独用 Node 24 扫描全部 `tests/*.test.mjs` 时，历史 `cv-tailor-alibaba.test.mjs` 仍因 extensionless import 报 `ERR_MODULE_NOT_FOUND`；项目正式测试脚本不包含这条直接扫描方式，本轮相关 Hybrid RAG 测试全部通过。

### B. 自动填表已经做到哪里

#### B.1 只补空白，不改用户已填内容

- `fillMappedControl` 在所有普通字段、日期、select、ARIA combobox 和 textarea 上都先检查 `isEmpty`。
- 招聘网站上已经手动填写或选择的值必须保留，扩展只补真正空白的字段。
- 不自动点击 Submit / Apply / Finish，不绕过验证码，不上传未明确授权的附件。
- 日期和学历的旧版“主动覆盖纠错”规则已被空白优先边界取代。下一 Chat 不得为了纠正猜测值重新恢复全表覆盖。

#### B.2 板块语义识别

- 字段识别不再依赖逐个添加精确关键词。它先判断局部板块语义，再结合直接标签、placeholder、控件类型、同卡字段结构和 DOM 顺序映射具体字段。
- 已支持的板块：教育、工作/实习、项目、论文/期刊、荣誉奖励、语言、作品链接、校园经历、技能。
- “获奖名称 / 奖项名称 / 获奖情况 / 奖项描述”等同类表达在奖励板块内按控件结构识别，不要求用户每遇到一个同义词就回来加词。
- “论文详情”写研究内容、方法、贡献或已核验描述，不得再把 journal 名称塞入详情；“刊物/机构”只选择期刊/会议类别或页面允许的级别。
- 低置信字段必须留空，不允许跨板块把奖项写入工作描述，也不允许把导师、实验室或研究方向串到错误学历。

#### B.3 重复行自动添加

扩展会在识别到相应板块、存在权威数据且板块内有明确可见的“添加 / 新增 / Add”按钮时，逐行点击并等待页面渲染。只点击对应板块内部的明确按钮，不点击页面级或语义不明的按钮。

- 教育：自动补到三行，固定顺序为博士、硕士、本科。
- 工作/实习：自动补到当前 APP 最终定制 CV packet 中的经历数。
- 项目：自动补到当前 APP 最终定制 CV packet 中的项目数。这里的“全部项目”是本岗位最终 CV 选中的全部项目，不是把全局所有项目无差别塞进每份申请。
- 论文：使用 global profile 顶层 `publications` 的完整清单，当前共 11 条，包含已发表、在审、返修与 Preprint。
- 奖项：当前权威资料有两条。
- 语言：当前权威资料有中文和英语两条，只填语言名称，熟练度保留人工选择。
- 作品：当前权威资料有 AI Usage Dashboard 和 Ivy Job Radar 两条。
- 校园经历：只有 global profile 或权威 APP packet 确实存在 `campus_experiences` 时才自动添加，当前不得凭空编造校园经历。

已加入针对三段教育、两项奖励、校园经历、项目、论文重复行和手动值保留的回归测试。

#### B.4 教育、日期与已确认个人资料

- 三段教育固定绑定：第一段范德堡博士，第二段耶鲁硕士，第三段西南财经本科。
- 范德堡：`2023-08` 至 `2027-05`，导师 Simon Vandekar，VUMC。
- 耶鲁：`2021-08` 至 `2023-05`，导师 Wei Wei，YCAS。
- 西南财经：`2017-09` 至 `2021-06`。
- 日期控件会根据控件类型、placeholder 和写入回读尝试 `YYYY`、`YYYY-MM` 或 `YYYY-MM-DD`。只有年月且网页必须完整日期时，开始日期用当月 1 日，结束日期用当月最后一天。
- 已确认个人资料：手机 `15840470437`、籍贯 `四川省成都市`、民族 `汉族`、出生日期 `1999-01-11`、微信 `ivyzzzhang`。
- 这些确认字段可以填写，但不得从它们推断其他敏感信息或用于岗位筛选。

#### B.5 论文级别记录

每个唯一刊物/机构在 global profile 的 `journal_rankings` 中保存：评级年份、CAS/JCR/CCF 字段、最好可核实等级、表单 Level、来源 URL、核验日期和备注。缺失评级不等于 Level 4，禁止猜测。

当前映射：

| 刊物/机构 | 已核实等级 | 表单 Level |
| --- | --- | --- |
| Statistical Methods in Medical Research | 2025 JCR Q1 | Level 1 |
| Research in Autism Spectrum Disorders | 2025 JCR Q1 | Level 1 |
| Psychometrika | 2025 JCR Q1 | Level 1 |
| Imaging Neuroscience | 2025 JCR Q2 | Level 2 |
| Annals of Applied Statistics | 2025 JCR Q2 | Level 2 |
| IET Software | 2025 JCR Q3 | Level 3 |
| IEEE EMBC | 未核实到 CCF A/B/C | 留空 |
| bioRxiv | Preprint server，不是分区期刊 | 留空 |

### C. 自动填表仍需继续验证的边界

1. 0.4.11 已通过模拟真实结构的回归测试并上线，但尚未在所有实际招聘网站逐站完成最终人工验收。用户下一次遇到真实页面时，应先确认版本 0.4.11、刷新申请页，再观察具体失败控件。
2. 自定义下拉框若页面不暴露可匹配 option 文本，扩展可能无法可靠选中；此时保留空白由用户手动选择，不得点击相似但未经确认的级别。
3. 只有年份而网页要求完整日期的论文，在没有已核实月份时保持空白，不生成伪造的 1 月 1 日。
4. 校园经历目前只有识别、重复行和结构化数据接口；没有权威 `campus_experiences` 数据时不会生成内容。
5. `/api/saved-jobs` 的服务器 route、D1 持久化和幂等回归已经在 Phase 0 完成。接入 Agent 时复用该权威收藏事件，不得恢复仅乐观 UI、刷新即丢失的旧行为。
6. 不要把自动填表和 CV 预生成混在同一个浏览器扩展任务中。自动填表继续由扩展负责；CV 预生成由 Job Radar 服务端与 Workspace Agent 负责。

### D. 当前 CV Tailor 为什么仍要等待

当前 `定制 CV` 页面没有调用任何模型。现有流程只做：

1. 读取 application 和完整 JD。
2. 用户手动选择母版并确认 JD。
3. `/api/cv-tailor/analyze` 生成 Job Radar 初步匹配。
4. `/api/cv-tailor/archive` 冻结申请包并生成 `chat_prompt.txt`。
5. 页面要求用户复制 Prompt 到新的 Work / Codex Chat。

真正耗时的岗位画像、九轮内部审校、TeX 编写、LuaLaTeX 编译、两页密度调整和 PDF 预览全部在后续 Chat 中发生，所以现在每份第一版仍可能等待 5 至 10 分钟以上。

### E. 用户确认的新目标

用户希望在收藏一个岗位后立即后台预生成一份临时定制 CV。等她真正准备申请时，应直接拿到接近定稿的第一版 Chat 和 PDF，只需少量修改、确认并提交，不再从零等待。

这不是自动提交申请，也不是自动创建最终 `cv_customized` 或 `cv_submitted` 文件。它只生成可继续编辑的临时预览。

### F. 推荐架构：专用 CV Prebuilder Workspace Agent

优先使用 OpenAI Workspace Agents API，不把整个 Job Radar 改造成 Agent，也不尝试直接调用一个普通 ChatGPT 对话。

官方能力边界：

- Job Radar 可以从服务端触发一个已发布到 API channel 的 Workspace Agent。
- 触发接口会持久排队并返回 Chat `conversation_url`。
- 使用 `conversation_key` 可让同一岗位或申请继续同一 Agent 对话。
- 使用 `Idempotency-Key` 可避免同一保存事件重复生成。
- beta run status 可以轮询 `queued / in_progress / completed / failed` 等状态。
- 当前 API 不能直接读取 Agent 回复正文。因此最自然的交付是 Job Radar 保存 `conversation_url`，用户点击“打开预生成 CV”进入已经完成的 Chat；临时 PDF 在该 Chat 中提供。
- 如果未来要求 Job Radar 自己直接读取并展示 PDF，则改用 Responses API background mode 加 R2 artifact storage，不要假装 Workspace Agent API 能返回正文。

官方文档：

- `https://developers.openai.com/workspace-agents/trigger-runs`
- `https://developers.openai.com/api/docs/guides/background`

### G. 收藏岗位到预生成 CV 的目标流程

1. 用户点击收藏。
2. 权威 `/api/saved-jobs` POST 先把收藏写入 D1，并立即返回，不能让 5 至 10 分钟的 CV 任务阻塞收藏交互。
3. 后台创建一条 `cv_prebuild_jobs` 记录。
4. 检查岗位是否仍开放、完整 JD 是否存在、语言/track 是否可推断。
5. 自动选择“临时推荐母版”。该母版只用于预生成，用户真正申请时仍可以修改；母版改变后应标记旧草稿 stale 并重新生成。
6. 为尚未创建 application 的收藏岗位建立私有 prebuild bundle，例如：

```text
XinyuIvy/job-application-archive
└── prebuilds/2026/PRECV-2026-JOB-<jobId>-<hash8>/
    ├── job_record.yaml
    ├── jd_snapshot.md
    ├── fact_master_snapshot.md
    ├── cv_display_rules_snapshot.yaml
    ├── canonical_project_index.jsonl
    ├── canonical_fact_index.jsonl
    ├── canonical_capability_index.jsonl
    ├── canonical_concept_index.jsonl
    ├── canonical_relation_index.jsonl
    ├── canonical_retrieval_index.jsonl
    ├── cv_base.tex
    └── prebuild_prompt.txt
```

7. 调用 Workspace Agent trigger API，输入 PRECV ID 和私有目录，使用 `conversation_key=PRECV-ID`。
8. 保存 `agent_trigger_run_id` 与 `conversation_url`，Job Radar 卡片显示“排队中 / 生成中”。
9. Agent 读取完整 JD 和冻结材料，执行现有九轮审校，创建本地临时 TeX/PDF，使用 LuaLaTeX 编译并检查接近但不挤满两页。
10. Agent 在 Chat 中交付岗位角色画像、项目/论文取舍、完整 CV、关键词覆盖、实际 PDF 页数和可打开的临时 PDF，然后等待用户确认。
11. Job Radar 轮询 run status，完成后显示“初稿可用”和“打开预生成 CV”。
12. 用户以后把收藏岗位转为“准备材料”时，沿用同一 conversation URL；创建正式 APP bundle 后，把 APP ID 发入同一 conversation，而不是另开一份重复草稿。
13. 只有用户明确确认“PDF定稿 / 最终版确认”后，才保存 `cv_customized_<APP-ID>.tex` 并触发现有 GitHub Actions；只有实际投递版本确认后才创建 `cv_submitted_<APP-ID>.pdf`。

### H. Agent 必须继承的 CV 硬规则

- 完整 JD 是主权威，结构化 requirement 和 match packet 只是辅助。
- 先做岗位角色画像和学术权重判断，再做风格对齐，最后才做中文语言审校。
- 行业/实习经历独立成节；研究型项目和应用型项目至少分为两个不同 section；三类事实都存在时必须分三类呈现。
- 项目、论文和学术材料数量由 JD 与岗位画像决定，不机械放同一套内容。
- 所有研究、项目、实习、工作和软件系统必须精确到开始年月与结束年月；缺月停止并询问，不猜。
- 只要包含学术传播或综合成果，明确写“以第一作者身份在九个学术会议作报告”。
- 中文个人简介写“博士候选人”，不写大学，不写预计毕业时间。
- SQL 只写 `SQL`；不得加入 TypeScript 或 React。
- 中文地点使用“城市，国家”；括号内英文首字母大写且保留官方大小写；皮层写“脑区皮层”等明确表述。
- PDF 目标是尽量接近但不挤满两页，不把 1.5 页作为目标，也不通过缩小字体和破坏母版间距硬塞。
- 预生成只产生临时预览，禁止自动改申请状态、自动提交或提前生成最终 `cv_customized` / `cv_submitted` 文件。

### I. 建议的数据表与状态

新增 `cv_prebuild_jobs`，至少保存：

```text
id
job_id
application_row_id (nullable)
prebuild_id
generation_key
status
language
track
template_file
jd_sha256
fact_master_sha
prompt_version
agent_trigger_run_id
conversation_url
attempts
last_error
created_at
updated_at
completed_at
```

`generation_key` 应由稳定岗位身份、JD hash、母版文件/版本、事实母版 commit 和 Prompt version 组成并唯一约束。建议状态：

```text
queued
preparing_bundle
agent_queued
agent_running
ready
blocked_missing_jd
blocked_configuration
stale
failed_retryable
failed_terminal
cancelled
```

### J. 触发、并发、失败与安全规则

- 用户明确希望“收藏即预生成”，不是只在进入准备材料后才开始。
- 只有完整 JD 存在且岗位未确认关闭时调用 Agent。缺少 JD 时收藏仍成功，但 prebuild 状态为 `blocked_missing_jd`。
- 收藏保存必须先成功返回；Agent 失败不能导致收藏回滚。
- 同一 `generation_key` 只触发一次；网络重试使用相同 Idempotency-Key。
- 建议最多同时运行两份，其余排队，避免同时收藏多个岗位时失控。
- 取消收藏后，尚未启动的任务取消；已经运行的 Agent 不强制删除 Chat，但不再自动重试，并标记 `cancelled` 或 orphaned。
- 用户将岗位转为“准备材料”时，若 prebuild 仍在队列中则提高优先级；若 ready 则直接复用。
- 事实库、JD、Prompt 或母版变化时，旧草稿标记 stale，不静默覆盖用户已经修改的 Chat。
- Workspace Agent access token 与 trigger ID 必须作为受保护的 Site runtime secrets 保存，禁止写入 GitHub、浏览器扩展、本地公开配置、日志或聊天消息。
- 未配置 Agent secret 时，收藏功能必须正常工作，只显示 `blocked_configuration`，不能让整个岗位保存接口 500。

### K. 一次性人工设置

此处目前未完成，下一 Chat 不得假装已经有 Agent 或 token：

1. 在 ChatGPT Work 中创建专用 `CV Prebuilder` Workspace Agent。
2. 给 Agent 配置读取 `XinyuIvy/job-application-archive` 与 `XinyuIvy/CV` 的 GitHub 能力；写入权限只在最终确认流程确实需要时启用。
3. 把现有九轮 Prompt 合同做成 Agent 指令或 skill，禁止依赖聊天记忆。
4. 发布 Agent 的 API channel，取得稳定 `agtch_...` trigger ID。
5. 创建 Workspace Agent access token。
6. 通过安全界面把 trigger ID 与 token 配置成 Site runtime secrets。不得让用户把 token 粘贴进 Chat。
7. 官方文档没有在当前核对中明确给出该功能对用户账户的具体费用/配额。下一 Chat 必须先确认用户当前 workspace 是否显示 Agent API channel，不得声称一定免费或一定包含在现有订阅中。

### L. 下一 Chat 的实施顺序

#### Phase 0：已完成，保留为回归边界

- `/api/saved-jobs` POST/DELETE/GET、D1 持久化、幂等、删除边界和前端失败回滚已经完成并发布。
- 后续修改必须继续通过：收藏刷新后仍存在、取消收藏后消失、重复收藏不重复插入、失败时前端回滚。
- 下一实施阶段直接进入 Phase 1，不再重复核对或重写该 route。

#### Phase 1：已完成，保留为状态层回归边界

- `cv_prebuild_jobs` schema、D1 migration、已有收藏回填、收藏/取消状态写入和卡片 badge 已完成并发布。
- 收藏接口仍先保存权威收藏；prebuild 状态初始化失败不会回滚收藏，也没有任何 Workspace Agent / OpenAI API 调用。
- 配置缺失、JD 缺失、stale、失败、cancelled、排队、运行和 ready 状态均有稳定枚举与可见 badge。
- `ivy_schema_v1` 冷启动标记保持不变；新 migration 不重复添加已有 `scan_status` 列。
- 后续修改必须保留 Phase 0–1 回归：收藏持久化与幂等、缺 JD/缺配置仍保存成功、取消任务状态、状态 badge 和无 Agent 调用。

#### Phase 2：建立 prebuild bundle

- 从 job row、完整 JD、推荐临时母版与同一 CV commit 创建私有 PRECV bundle。
- 不创建虚假的 applications 记录，不提前分配最终 APP ID。
- 用 `generation_key` 保证幂等。
- 验证 bundle 的完整 JD、事实母版、canonical indexes、展示规则和母版来自同一冻结版本。

#### Phase 3：创建并发布 Workspace Agent

- 创建 Agent 指令/skill，继承 H 节全部规则。
- 先用一个真实但用户确实收藏的岗位手动触发，不创建 synthetic CV。
- 验证 Agent 可以读私有 bundle、本地编译 LuaLaTeX、生成不超过两页且文本可提取的 PDF，并在 Chat 中交付。
- 只有这一阶段需要用户完成一次 API channel 与 access token 安全设置。

#### Phase 4：接入自动触发和状态轮询

- POST 收藏成功后异步触发 Agent。
- 存储 conversation URL 和 beta run ID。
- 卡片显示排队、生成中、初稿可用、阻塞或失败。
- ready 时按钮从“定制 CV”升级为“打开预生成 CV”；保留手动重新生成入口。

#### Phase 5：第一次真实端到端验证

- 让用户选择一个她真的想收藏/申请的岗位，不要随机选择，不要创建 synthetic job。
- 点击收藏后确认页面立即响应，后台状态依次变化。
- 检查 PRECV bundle、Agent conversation、岗位画像、section 结构、年月、九个会议报告、论文取舍、LuaLaTeX PDF 页数与密度。
- 再次收藏/重复事件不创建第二个 run。
- 转入准备材料后继续原 conversation，并验证最终 APP bundle 与确认边界。

### M. 必须新增的回归测试

1. `/api/saved-jobs` POST 持久保存，DELETE 正确删除，重复 POST 幂等。
2. 收藏响应不等待 Agent 完成。
3. 缺少完整 JD 时不调用 Agent，收藏仍成功。
4. 缺少 Agent secrets 时不调用外部 API，收藏仍成功并记录 `blocked_configuration`。
5. 同一 generation key 的重复请求只产生一个 run。
6. JD、母版、事实 commit 或 Prompt version 改变会产生新 generation key，并把旧草稿标记 stale。
7. Agent trigger 返回 202 后正确保存 conversation URL 和 run ID。
8. Agent API 5xx/timeout 进入有限重试，不无限循环。
9. 取消收藏后 queued task 取消，running task 不自动重试。
10. 页面不泄露 access token、GitHub token、完整 private bundle URL 或内部错误响应。
11. 预生成流程不得创建 `cv_customized_<APP-ID>` 或 `cv_submitted_<APP-ID>`。
12. 已经手动填写的申请表字段与现有 0.4.11 自动填表行为不受 Agent 接入影响。

### N. 下一个 Chat 可直接使用的接手指令

```text
继续 Ivy Job Radar 的两个连续任务，严格读取 XinyuIvy/ivy-job-radar 最新 main 的 PROJECT_HANDOFF.md 顶部“Autofill 0.4.11 已发布，下一阶段接入 CV Prebuilder Workspace Agent”作为最高权威。

任务一：保留并验证 Autofill 0.4.11。不得回退为逐个关键词识别，不得覆盖用户已经手动填写的字段。自动添加支持教育、工作/实习、当前 APP 项目、完整论文、奖励、语言、作品和有权威数据的校园经历。低置信字段与无法核实的期刊等级/日期继续留空。

任务二：按 Phase 2 继续 CV Prebuilder Agent。Phase 0 的收藏权威持久化和 Phase 1 的 `cv_prebuild_jobs` 状态层都已经完成，不要重复实现。下一步只建立 PRECV bundle、稳定 `generation_key` 和临时母版选择，仍不调用 Agent；之后再创建/发布 Workspace Agent，最后接 trigger 和状态轮询。

用户要求收藏岗位后立即后台生成临时 CV。临时 Agent 必须执行完整 JD/事实审核、岗位角色画像、项目与论文取舍、事实复核、风格对齐、中文语言审校、年月检查、LuaLaTeX 两页密度检查和最终回归。行业/实习、研究型项目、应用型项目必须分节；学术传播写九个第一作者会议报告；所有项目精确到年月；目标接近但不挤满两页。

普通 Chat 不能被网站直接调用。优先使用 Workspace Agents API，保存 conversation_url 和 run status。当前 API 不能读取 Agent 回复正文，所以 ready 后让用户打开该 Chat；若用户要求 Job Radar 直接显示 PDF，再评估 Responses API background mode + R2。不得让用户把 access token 粘贴进 Chat，也不得声称 Agent API channel、token、费用或配额已经配置。

每个阶段完成后运行相关测试、lint、生产 build，按 Sites lifecycle checkpoint 发布，并同步 GitHub main。第一次真实 Agent 验证必须由用户选择一个确实要收藏/申请的岗位，不得创建 synthetic job 或批量触发历史收藏。
```

## 历史状态：Autofill 0.4.6 整组绑定、日期偏移与确认身份字段

- 0.4.5 的教育补填以学校字段为每张教育卡的锚点，按页面顺序固定填博士、硕士、本科，学院、导师、实验室、研究方向和日期不再独立计数或跨卡拼接。
- 用户已确认耶鲁硕士为 2021-08 至 2023-05；全局权威资料已同步，第二段教育卡应填写完整月份。
- 用户已明确确认手机 15840470437、籍贯四川省成都市、民族汉族、出生日期 1999-01-11、微信号 ivyzzzhang；敏感字段只允许从这些明确确认的 profile key 读取，不推断、不参与筛选。
- 论文板块出现时，以 global profile 顶层 `publications` 为完整权威清单，自动补足重复行并填写全部已发表、在审、修回和 Preprint；未发表 late-stage manuscript 与 NeuroStat 不进入。只有年份而无精确月日时，不为全日期控件伪造 1 月 1 日。
- 项目板块出现时，自动补足到当前 APP 最终定制 CV 数据包的项目数，只填这份岗位简历选中的项目，不用全局项目库污染岗位定制结果。
- 表单板块在写入前一次性识别并限制在局部容器，工作描述不再因页面上已有奖项文字而被重新归类；辉瑞描述只来自对应 APP 的最终定制 CV 数据包。
- 日期解析器已修复 30/31 日被截成 3 日的问题，并对受控日期组件的一天时区偏移进行补偿；APP-2026-1XC-0040 辉瑞区间为 2026-05 至 2026-08。

- 0.4.3 把 `[role="combobox"]` 纳入通用字段识别后，部分招聘网站使用 `div` 作为 ARIA combobox。旧 `setCombobox` 会把该 `div` 传给原生 `HTMLInputElement.value` setter，浏览器抛出 `Illegal invocation` 并中断整轮自动填充。
- 0.4.4 只对真实 `input` 或 `textarea` 调用原生 value setter；contenteditable 元素使用文本内容；纯 `div` combobox 只通过点击和候选项选择，不再调用输入框 setter。
- 回归测试使用带原生 brand check 的伪 input setter，确认 `div` combobox 不再触发 `Illegal invocation`。

## 历史状态：Autofill 0.4.3 板块语义与自适应日期

- 扩展不再把精确标签词作为唯一入口。先从局部标题、同一区块字段组合和控件类型判断教育、工作/实习、项目、语言、作品、技能、荣誉奖励或论文/期刊板块，再在板块内映射具体字段；无法高置信判断时保持空白。
- 三个教育区块按页面顺序固定绑定博士、硕士、本科。Global profile 的教育数组会先按学位层级排序，补填脚本按区块整体覆盖学校、学历、专业和日期，避免解析器旧值造成字段串位。
- 日期控件按实际类型、placeholder 和写入后回读自动尝试 `YYYY`、`YYYY-MM` 或 `YYYY-MM-DD`。只有年月而页面要求完整日期时，开始/中性日期用当月 1 日，结束日期用当月最后一天；仍不编造缺失月份。
- 项目区块兼容“开始日期 / 结束日期”的完整日期范围控件。工作/实习区块也可按结构识别雇主、职位、地点、起止日期和描述。
- 荣誉奖励板块按结构把日期控件映射为获奖时间、下拉框映射为奖项类型、长文本框映射为获奖情况；不要求标签必须精确写成“获奖名称/描述”。
- 论文/期刊板块按结构识别论文名称、作者顺序、发表时间、刊物/机构和论文详情。优先读取最终 APP packet 的结构化论文；兼容常见 LaTeX citation 中的标题、期刊、年份和第一作者信息。
- 扩展版本为 `0.4.3`。用户的固定安装目录仍为 `/Users/ivyzhang/Documents/Development_Projects/ivy-job-radar/browser-extension`；更新流程是 `git pull origin main`、Chrome Reload、刷新申请页，不要求重复下载 ZIP。

## 历史状态：Autofill 0.4.1 日期区块绑定修复

- `XinyuIvy/CV@main:master/application-forms/application-autofill-profile.md` 已加入已确认的精确月份：范德堡大学 `2023.08 - 2027.05`，西南财经大学 `2017.09 - 2021.06`。教育补填现在按同一区块内的学校值绑定整组字段，并允许纠正网页或简历解析器预填的错误日期。
- 项目区块识别向上检查更多层级并允许识别表单根节点；`起止时间` 的两个输入框继续依 DOM 顺序绑定开始与结束年月。已确认当前 APP packet 含项目 `start_year/start_month`，此前空白来自区块识别失败。
- Global profile 新增两条语言：中文（兼容普通话、汉语、Chinese、Mandarin）和英语（兼容 English）。扩展只选语言，不填精通程度。
- Global profile 新增两条获奖：`Vanderbilt University Provost's Pathbreaking Discovery Award` 与 `NIH Replication Prize`，均含年份和已核验描述。扩展不上传获奖附件。
- Global profile 新增两条作品：`AI Usage Dashboard` 与 `Ivy Job Radar 多源岗位情报平台`，包含 GitHub URL 和描述。扩展不上传作品附件。
- Profile 更新提交为 `dc4a589c6430b5ab9b1528389c1a28e99431fe18`。

- 修复中文项目表单中单独标为“描述”的 textarea 无法命中 `project.description` 的问题。只有当附近区块同时出现项目名称、项目角色、项目链接等项目证据时，才把通用“描述”判为项目描述，避免误填其他描述字段。
- 新增项目成对日期识别。“起止时间 / 项目时间 / 项目日期”下的两个日期框按 DOM 顺序分别绑定 `project.startDate` 与 `project.endDate`。
- 项目日期优先读取 packet 的 `start_year/start_month/end_year/end_month`，并兼容 `start_date/end_date` 与日期范围文本；写入表单统一为 `YYYY-MM`。
- 项目描述优先读取 `bullets`，并兼容 packet 中的 `description` 或 `summary`。
- 项目区块里单独写成“角色 / Role”的字段现在会命中 `project.role`；值优先来自最终 packet 的 `role`，并兼容 `author_role`、`contribution`、`position`，因此可以原样填写“第一作者”“独立开发者”等已核验角色，不从描述猜测。
- 扩展版本升至 0.4.1，`/autofill` 提供日期修复版扩展下载。用户需要替换旧的 unpacked extension 并在 `chrome://extensions` 重新加载，已打开的申请页也要刷新。
- 教育日期不再按区块顺序猜测，而是在普通填充结束后按同一区块的学校名称强制校正。
- 项目起止时间不再只依赖标签 DOM 深度，而是在项目名称写入后按同一区块的项目名称绑定日期。
- 获奖年份等带日历的只读输入允许程序化写入，但仍不会自动上传证明附件。

## 当前生产权威状态：岗位身份去重与手动保存字段识别修复

> 本节是 2026-08-20 之后继续维护时的最高优先级入口。生产 Sites 源码当前领先于 GitHub `main`，不得把 GitHub `main` 整体覆盖到生产 Site。GitHub PR #101 仍是 Draft/Open，必须按文件移植新改动，不能把旧分支当作生产权威版本。

本轮修复 Chrome 手动保存时岗位名和公司识别不准的问题：

- 已确认并修复服务端错误：公司为空时，旧代码把岗位名传入公司推断，可能把“生物统计总监”一类岗位名保存成公司。
- 书签 v4 同时发送 JSON-LD、BOSS、LinkedIn、Workday、通用 ATS、H1、Open Graph 和页面标题候选值，由服务端按来源可信度统一选择。
- Workday 不再把整个 `jobPostingHeader` 容器当岗位名，只读取精确标题节点或其内部标题元素。
- BOSS、LinkedIn 和招聘平台品牌会被排除为公司候选；无法可靠识别公司时显示“待补充公司”，不再拿岗位名凑数。
- 保存窗口在真正写入岗位池和待提交申请之前显示可编辑的“岗位名称”和“公司”。用户确认后的字段优先级最高，JSON-LD 和页面标题不得覆盖。
- 旧书签继续兼容，也会进入确认窗口并获得服务端纠错；重新安装书签后才能使用 v4 的多候选采集。
- 不批量改写已有岗位，也不删除历史记录。已有错误记录需要在后续明确选择目标后单独更正。

2026-08-20 进一步修复“准备材料岗位仍出现在今日”的身份匹配漏洞：

- 实际生产数据确认了根因。快手同一岗位在 jobs 中为 `Campus`，在 applications 中为 `快手`；小米同一岗位在 jobs 中曾把 `数据科学家` 或岗位名保存成公司，而 applications 中公司为 `小米`。两边 URL 和岗位 ID 相同，但旧逻辑先比较公司名，导致后续稳定 ID 与 URL 匹配没有执行。
- 新规则按强度排序：同来源的稳定职位 ID 优先，其次是精确职位详情 URL，最后才使用标准化公司名、岗位名和地点。两个不同稳定职位 ID 永远不得仅因同公司同标题而合并。
- 小米的 `/position/<id>/detail` URL 现在能正确提取职位 ID；tracking query 不参与职位身份。
- `/api/jobs` 的索引候选不再把错误公司名嵌入 stable ID 和 canonical URL 索引键，候选命中后仍由严格 identity function 复核。
- 加入或保存为“准备材料”后，React state 会立即移除同一今日岗位；Chrome 保存的跨窗口事件同样立即移除，不再等刷新。
- 已加入小米、快手、米哈游、拼多多和大疆官方招聘域名映射；岗位名本身和 `Campus` 不得成为公司。已存在的错误公司名在 `/api/jobs` 响应层按可信官方域名纠正，不批量写库。
- 运行时回归覆盖：公司名错误但职位 ID 相同必须匹配；小米详情 URL 必须提取 ID；不同 requisition IDs 必须保持分离；Kuaishou role heading 必须胜过门户 SEO 标题。

永久回归覆盖 BOSS 平台名排除、岗位名不得回填公司、Workday 精确标题优先、用户确认值不可被覆盖，以及上述身份边界。当前验收：Python 231 tests、运行时 11 tests、lint、生产 build 全部通过。

发布前生产版本为 Sites version 117，生产地址仍为：

`https://ivy-job-radar.rourou1199.chatgpt.site`

历史上 version 116 的 D1 `PRAGMA user_version` 冷启动改动曾导致数据库 API 500；version 117 已用 `ivy_schema_v1` 修复。本轮不得改动数据库初始化路径。



## 0. 2026-08-12 权威交接：人工复核版定制 CV 已接入，下一步只做第一次真实申请包验证

> 本节是当前运行状态与 next step 的最高优先级记录，覆盖下方旧章节中“application archive 尚未创建”“继续下一轮 RAG / shadow mode”等过时表述。下方第 1–12 节保留用于追溯 RAG 建设与验证历史，不再作为当前行动指令。**下一个 Chat 不得重新启动第三套验证、v10/v2.1、shadow mode、production RAG migration、自动 TeX 或无人工确认的 CV 生成。**

### 0.1 用户最终确认的使用流程

用户在 Ivy Job Radar 页面上的日常操作只有：

1. 在“待提交申请”中点击某个真实岗位的“定制 CV”。
2. 系统为该申请生成稳定的 `APP-...` ID，在私有仓库建立独立目录，冻结完整输入。
3. 页面显示“复制 Prompt”；用户把 Prompt 粘贴进新的 Work / Codex Chat。
4. 后续分类复核、纯文本内容修改、TeX、PDF 检查和归档全部在 Chat 中完成。Job Radar 页面不提供复杂 CV 编辑器，也不自动生成最终 CV。

初始 application bundle 固定写入：

```text
XinyuIvy/job-application-archive
└── applications/<year>/<APP-ID>/
    ├── application_record.yaml
    ├── jd_snapshot.md
    ├── jd_requirements.json
    ├── match_packet.json
    ├── fact_master_snapshot.md
    ├── canonical_project_index.jsonl
    ├── canonical_fact_index.jsonl
    ├── canonical_capability_index.jsonl
    ├── canonical_concept_index.jsonl
    ├── canonical_relation_index.jsonl
    ├── canonical_retrieval_index.jsonl
    ├── cv_base.tex
    └── chat_prompt.txt
```

后续人工复核与定稿产生的文件仍写入同一申请目录：

```text
match_analysis.md
evidence_manifest.json
cv_changes.md
cv_customized.tex
cv_customized.pdf
cv_submitted.pdf
interview_brief.md
```

`cv_submitted.pdf` 只有在用户明确确认“这就是实际投递版本”后才创建；`interview_brief.md` 只在 CV 定稿后生成。

### 0.2 Job Radar、Chat、RAG 和 Codex 的职责边界

- Job Radar 保存完整 JD、拆分要求、生成**初步** Direct / Transferable / Adjacent / Unsupported 分类，并创建申请包。
- 事实母版与 canonical indexes 保存用户完整、已验证的事实、能力、限制和 evidence IDs。
- Chat 必须读取完整 JD、完整事实母版快照、canonical indexes、`cv_base.tex` 和 Job Radar 初步分类，独立复核；初步分类不是最终结论。
- Chat 与 Job Radar 分类一致时直接合并，不逐条打扰用户。
- 分类不一致但不会影响实际 CV 时只记录；只有可能影响项目选择、顺序或表述的分歧才找用户确认，每批最多 3–5 条。
- RAG 只在事实母版不足以确认具体数字、方法、贡献边界或争议分类时，按 evidence ID 回查相关原始片段；不得一开始通读全部论文/代码，也不得仅凭检索分数判定事实。
- Chat 不再在初步分类或第一版内容后停下等待用户重复发出相同修改要求。当前 Prompt 要求在一次任务内部连续完成：完整 JD/证据审核、岗位角色画像和学术权重判断、内容与论文取舍、逐项事实复核、角色画像风格对齐、中文语言审校、年月/格式检查、本地 LuaLaTeX PDF 页数与页面密度验证、最终回归审查。第一条完整回复直接交付接近定稿的完整内容和本地预览 PDF，之后只保留一次用户定稿确认。
- 岗位角色画像必须先于中文语言审校；论文数量按岗位是研究/学术导向、应用/业务导向或混合型动态取舍。只要 CV 包含学术传播或综合成果信息，必须明确写“以第一作者身份在九个学术会议作报告”，不得只列两个代表会议而掩盖总数。
- CV 必须按 JD 建立清晰 section 结构，禁止把所有项目放进一个列表平铺。行业/实习经历独立成节；研究型项目与应用型项目至少分成两个不同的项目 section；当前事实同时包含三类时必须分别呈现。section 名称、顺序和篇幅随岗位画像调整，项目不得跨 section 重复。
- 所有研究、项目、实习、工作和软件系统必须逐条核验开始年月与结束年月；只写年份即不合格，缺月必须询问而不是猜测。自动本地预览目标是尽量接近但不挤满 2 页，而不是刻意停在 1.5 页；第二页应接近完整并保留正常页底留白。内容不足时补回与岗位画像相关且有事实支持的证据，不加入弱相关内容凑页数；过长时先删低相关与重复内容，按岗位学术权重调整论文，而不是缩小字体硬塞。
- 本地工作 TeX/PDF 只用于 Chat 预览，不能写入归档。只有用户明确确认定稿后，才保存 `cv_customized_<APP-ID>.tex` 并触发归档 PDF workflow。
- TeX 必须复制并保持 `cv_base.tex` 的 document class、packages、字体、字号、页边距、section、bullet、行距、项目间距、联系方式、日期/地点、`\\hfill` 和自定义命令。不得重新设计版式或明显缩小字体硬塞两页。
- 中文 CV 的长期展示规则已内嵌进当前 Prompt 合同，历史申请包重新打开时也会获得最新版：个人简介必须明确写“博士候选人”，但不得出现范德堡大学或 Vanderbilt University；每个研究、项目、实习、工作和软件系统条目都必须使用 `YYYY 年 M 月 - YYYY 年 M 月` 或 `YYYY 年 M 月 - 至今`，缺月时停止确认而不是猜测；地点按“城市，国家”；括号内英文首字母大写但保留官方大小写；皮层相关表述必须明确为“脑区皮层”“脑区皮层厚度”或“脑区皮层表面积”。
- JD 关键词优先；只要事实支持，尽量使用 JD 原词或自然变体。不与 JD 冲突且仍有价值的行业关键词继续保留。Transferable/Adjacent 必须保留迁移或边界语义；Unsupported 关键词不得为 ATS 强塞。
- Job Radar 不自动修改 CV、不自动生成/发布 TeX/PDF、不改变申请状态。旧 `/api/cv-tailor/publish` 已关闭自动发布能力。

三个确认点：

1. 分类阶段：只确认会影响 CV 的重要分歧。
2. 内容阶段：确认所有纯文本内容与项目顺序。
3. PDF 阶段：确认最终排版和实际投递版本。

### 0.3 2026-08-12 已完成并合并

私有归档仓库：

- `XinyuIvy/job-application-archive` 已创建，visibility = Private。
- 初始化 PR #1 已合并，merge commit `a9d2195484317f563be6db1ddff3777a0957f8ca`。
- PR #2 已合并，使 `scripts/build_cv.sh` 可直接执行，merge commit `7641dc06ecdbf150f62db843c2555bac595970c6`。
- 仓库已有：README、完整 archive contract、`applications/README.md`、LaTeX build ignore rules、统一 LuaLaTeX build script。
- build script 会运行 LuaLaTeX、拒绝超过两页的 PDF、并用 `pdftotext` 检查 ATS 文本；它不会自动创建 `cv_submitted.pdf`。

Job Radar：

- PR #72 `Add human-reviewed application archive workflow` 已合并。
- merge commit：`d6b7a5e0e1e2db344f965b56b3465ee60d9c4ab3`。
- 13 个 source/test files 已同步到 GitHub `main`。
- PR Python tests、app lint、app build 全部通过。
- Site 生产部署 version 96 已成功：
  - `https://ivy-job-radar.rourou1199.chatgpt.site`
- Site 环境已配置：
  - `APPLICATION_ARCHIVE_GITHUB_REPO=XinyuIvy/job-application-archive`
- 现有 `CV_GITHUB_TOKEN` 被代码用作 archive token fallback；未在仓库或日志中泄露 token。
- 站点和归档仓库代码/目录/Prompt 合同已验证；没有改 canonical facts、CV 母版或 RAG frozen outputs。

### 0.4 唯一尚未完成的运行时验证

**尚未创建第一份真实 application bundle。**

这是刻意停止点，不是功能回滚：用户还没有在已部署站点中选择具体哪个“待提交申请”作为第一份真实归档，因此本 Chat 没有擅自在私有仓库制造测试/假申请。

第一份真实 bundle 创建前，仍有一个必须实测的权限问题：

- GitHub connector 对 `job-application-archive` 有 admin/push 权限，证明 Chat 可以写该仓库。
- 但 Site 使用的是既有 secret `CV_GITHUB_TOKEN`；secret 值不可读取。
- 如果该 token 是覆盖全部 private repos 的 classic token，新仓库通常可直接写。
- 如果它是只授权旧仓库的 fine-grained token，刚创建的 archive repo 可能未被包含。
- 因此，在真实点击成功前，不得宣称“Site runtime 已验证拥有 archive write permission”。

### 0.5 下一个 Chat 必须按此顺序继续

1. 先读取并核对三个当前状态：
   - `XinyuIvy/ivy-job-radar@main`
   - `XinyuIvy/job-application-archive@main`
   - 已部署的 Ivy Job Radar Site
2. 不启动任何新 RAG 训练、验证轮次、shadow mode 或 consumer migration。
3. 让用户在“待提交申请”里选择一个她确实准备定制的真实岗位，并点击“定制 CV”；不要由 Chat 随机挑选，也不要创建 synthetic bundle。
4. 页面应依次显示：
   - 正在读取完整 JD 与申请信息
   - 正在生成 Job Radar 初步匹配
   - 正在冻结事实母版、行业 CV 母版和申请输入
   - 申请档案已创建 + 稳定 `APP-...` ID + “复制 Prompt”
5. 点击成功后，立即读取私有仓库中新建的申请目录并核验：
   - 13 个必需初始文件全部存在；
   - 目录名、`application_record.yaml.application_id` 和页面 APP ID 完全一致；
   - `jd_snapshot.md` 是该岗位完整 JD，不是 URL、摘要或关键词列表；
   - `application_record.yaml` 固定 CV repo commit、模板路径、行业、语言和 Job Radar mapping；
   - `match_packet.json` 明确标记 `preliminary_only`；
   - `fact_master_snapshot.md` 与 canonical indexes 来自同一个冻结的 CV commit；
   - `cv_base.tex` 是所选行业/语言母版；
   - `chat_prompt.txt` 包含小批量分歧确认、JD 关键词优先、行业关键词保留、内容先于 TeX、母版布局锁定等规则。
6. 再点击一次同一岗位的“定制 CV”，验证幂等性：应返回 existing bundle，不得创建第二个 APP ID 或覆盖已冻结文件。
7. 如果成功，把生成的 Prompt 复制到 Work / Codex Chat。该 Chat 只执行“读取、独立分类审核、第一版纯文本内容建议”，然后停下来等待用户确认；不得直接生成 TeX。
8. 如果页面报 archive access 错误：
   - 先记录准确 error code 和 worker log；
   - 最可能是既有 Site GitHub token 没有包含新 private repo；
   - 不要把 private JD 写回 public Job Radar 或 CV repo；
   - 不要在聊天里索要或粘贴 token；
   - 停止并让用户在 GitHub 安全界面把 `XinyuIvy/job-application-archive` 加入现有 fine-grained token，或安全创建专用 token；
   - 然后把它作为 secret `APPLICATION_ARCHIVE_GITHUB_TOKEN` 更新到同一个 Site，重新部署相同 source version，再重复第 3–7 步。
9. 如果初始包验证通过，本阶段即完成。不要继续批量迁移历史申请，也不要自动为其他岗位创建 bundle，除非用户另行要求。

### 0.6 下一 Chat 可直接使用的接手指令

```text
继续 Ivy Job Radar 的人工复核版“定制 CV”接入，只完成第一次真实 application bundle 的端到端验证，不开始新的 RAG 改进或验证轮次。

开始前读取：
1. XinyuIvy/ivy-job-radar 最新 main 的 PROJECT_HANDOFF.md，严格以顶部 0 节为权威；
2. XinyuIvy/job-application-archive 最新 main；
3. 当前 Ivy Job Radar Site 状态。

让用户从“待提交申请”中选择一个她确实要定制的真实岗位并点击“定制 CV”。不要随机选择岗位，不要创建 synthetic bundle。点击后验证稳定 APP ID、13 个必需文件、完整 JD、冻结的事实母版/canonical indexes/CV 母版、preliminary-only match packet 和 chat_prompt。再点击同一岗位一次验证幂等性。

如果 Site 无法写入新私有仓库，记录准确错误并判断是否为现有 fine-grained GitHub token 未包含 XinyuIvy/job-application-archive。不得把材料写入 public Job Radar 或 XinyuIvy/CV，不得在聊天中索要 token。需要用户在 GitHub 安全界面扩展 repo access 后，再安全更新 Site secret APPLICATION_ARCHIVE_GITHUB_TOKEN 并重新部署。

验证成功后，让用户复制生成的 Prompt 到 Work/Codex Chat。该 Chat 第一阶段只读取并独立复核分类、给纯文本 CV 内容建议，然后等待用户确认；内容定稿前不得生成 TeX。
```

> 新 Chat 接手时必须重新读取 `XinyuIvy/CV` 与 `XinyuIvy/ivy-job-radar` 的最新 `main`、开放 PR、recent commits、Actions、manifest/handoff 和可见并发状态。GitHub 当前状态优先于本文记录的 SHA。

## 1. 系统分工

- `XinyuIvy/CV`（private）：authoritative original evidence、canonical cards/ontology、canonical deterministic retrieval artifacts、retrieval evaluation dataset、reviewed gold labels、CV templates。
- `XinyuIvy/ivy-job-radar`（public）：岗位/JD/申请状态、CV Tailor UI、当前仍运行 legacy Hybrid RAG prototype。
- 未来私有 `XinyuIvy/job-application-archive`：申请归档包；**尚未创建**。

## 2. 当前完成状态

已完成：

1. Stage 1 original evidence audit：15 个 major projects 全部 Ready for bounded Stage 2。
2. Stage 2 canonical structured knowledge graph：15 Project Cards / 37 Fact Cards / 14 Capability Cards / 18 Concepts。
3. canonical deterministic retrieval compilation：15 project / 37 fact / 14 capability / 18 concept / 84 unified retrieval / 118 relations。
4. retrieval evaluation dataset：42 queries。
5. frozen legacy Hybrid RAG baseline evaluation。
6. **15 条 subjective human-review cases 已全部由用户逐条/汇总确认并写入 reviewed gold。**

当前仍未做：

- 未重新生成 embeddings。
- 未修改 BM25、weights、thresholds、fusion、reranking 或 classification。
- 未切换 Job Radar consumer。
- 未修改 canonical facts。
- 未修改 CV templates。
- 未针对具体 JD 生成 CV。
- 未创建 application archive repo。
- **未开始 RAG v2。**

## 3. 关键验收锚点

### CV / canonical + evaluation

- canonical retrieval implementation PR #7 → `23d6ef58408cebc320483c3475282816c9c3ab19`
- canonical main validation anchor → `cc65aeb445de39d5289bd547933f316eb166f205`
- retrieval evaluation PR #15 → `a4e376b4aa2b4704a76032a7a063f9fefddb505e`
- **reviewed gold PR #16 → `65c3f33f86a3eaff13c0a54f183f25a7d0bc77bf`**

### Job Radar

- frozen legacy runtime commit → `b857b472fb774d6df337a37072201f188dfc3824`
- evaluation-stage handoff merge → `7a25b4bea440f562f2be9a32e08bf5c1280fc3b7`

## 4. Canonical authority chain

Stage 1 authority：

- `STAGE1_COMPLETION_MANIFEST.yaml`

Stage 2 canonical graph：

- `STAGE2_CANONICAL_MANIFEST.yaml`
- `STAGE2_SCHEMA.yaml`
- `STAGE2_PROJECT_CARDS.yaml`
- `STAGE2_FACT_CARDS.yaml`
- `STAGE2_CAPABILITY_CARDS.yaml`
- `STAGE2_ONTOLOGY.yaml`
- `STAGE2_COMPILED_MODEL_CONTEXT.yaml`
- `STAGE2_VALIDATION_REPORT.yaml`

Canonical retrieval：

- `CANONICAL_PROJECT_INDEX.jsonl`
- `CANONICAL_FACT_INDEX.jsonl`
- `CANONICAL_CAPABILITY_INDEX.jsonl`
- `CANONICAL_CONCEPT_INDEX.jsonl`
- `CANONICAL_RELATION_INDEX.jsonl`
- `CANONICAL_RETRIEVAL_INDEX.jsonl`
- `CANONICAL_RETRIEVAL_BUILD_MANIFEST.yaml`
- `CANONICAL_RETRIEVAL_VALIDATION_REPORT.yaml`

Guardrails：stable IDs、project linkage、status、ownership、exact sources、allowed expression、prohibited expansion 必须保留。`evidence_strength.ranking_semantics = none`。

## 5. Retrieval evaluation / frozen baseline

Private CV 路径：`master/project-evidence/evaluation/`

核心文件：

- `RETRIEVAL_EVAL_SCHEMA.yaml`
- `ANNOTATION_GUIDE.md`
- `RETRIEVAL_EVAL_QUERIES.json`
- `LEGACY_BASELINE_FREEZE.yaml`
- `LEGACY_BASELINE_RESULTS.json`
- `LEGACY_BASELINE_REPORT.yaml`
- `HUMAN_REVIEW_QUEUE.yaml`
- `POST_REVIEW_EVALUATION_REPORT.yaml`
- `RETRIEVAL_EVAL_MANIFEST.yaml`
- `scripts/validate_retrieval_eval.py`
- `scripts/validate_reviewed_gold.py`

42-query authored dataset：

- English 37 / Chinese 5
- original deterministic boundary 27
- original subjective human-review-required 15

Frozen runtime：

`XinyuIvy/ivy-job-radar@b857b472fb774d6df337a37072201f188dfc3824`

直接 import 原 `app/lib/hybrid-rag.ts`，输入仍是 legacy：

- `FACT_INDEX.jsonl`
- `FACT_INDEX_STATUS_ADDENDUM.jsonl`
- `CONCEPT_EDGES.jsonl`

Frozen diagnostics：

- `local_subword_hash_v1`, 384 dimensions
- BM25 `k1=1.5`, `b=0.75`
- existing graph / candidate union / scoring / classification

### Frozen baseline metrics（不可覆盖）

```text
requirement extraction failures = 1
Project Recall@1 = 0.647436
Project Recall@3 = 0.844017
Project Recall@8 = 0.920940
Project MRR = 0.839744
Project nDCG@8 = 0.838915
exact fact-ID recall = 0.461616
canonical fact IDs absent from legacy index = 11

deterministic classification accuracy = 0.666667
Unsupported hard-negative No-Evidence accuracy = 0.25
direct false-positive rate on must-not-be-Direct = 0.230769
```

主要结论：旧系统 project-level retrieval 相对不错，但 fact identity alignment 与 evidence adjudication/classification 明显弱，尤其 unsupported / overclaim boundaries。

## 6. Human review / reviewed gold（已完成）

15 条原 subjective cases 已由用户确认，最终分布：

- Direct = 4
- Transferable = 6
- Adjacent = 5
- Unsupported = 0
- Pending = 0

最终 IDs / labels：

- EVAL-020 Direct
- EVAL-021 Direct
- EVAL-022 Direct
- EVAL-024 Direct
- EVAL-025 Transferable
- EVAL-026 Transferable
- EVAL-027 Transferable
- EVAL-028 Transferable
- EVAL-029 Transferable
- EVAL-030 Transferable
- EVAL-031 Adjacent
- EVAL-032 Adjacent
- EVAL-033 Adjacent
- EVAL-034 Adjacent
- EVAL-035 Adjacent

`HUMAN_REVIEW_QUEUE.yaml` 现在是 final human-confirmed overlay；每条均包含：

- `human_decision`
- `reviewer: user_confirmed:XinyuIvy`
- `reviewed_at`
- `review_notes`

Validator Actions run `31339183349` 及最终 repeat run 均通过：

```text
reviewed_cases = 15
pending_or_null = 0
conflicting_labels = 0
Direct = 4
Transferable = 6
Adjacent = 5
Unsupported = 0
```

CI 在 review complete 状态下明确跳过 frozen runtime checkout、baseline rerun、baseline post-write，因此 reviewed gold **没有覆盖或改写 frozen baseline outputs**。

### Post-review evaluation（与 frozen baseline 分开）

`POST_REVIEW_EVALUATION_REPORT.yaml`：

- legacy classifier 在 15 条 reviewed subjective cases 上：`7/15 = 0.466667`
- 27 deterministic + 15 reviewed 全部 42 条：`25/42 = 0.595238`
- frozen deterministic-only accuracy 继续保留为 `0.666667`

这三个数字用途不同；不得用 post-review report 覆盖 `LEGACY_BASELINE_REPORT.yaml`。

## 7. Offline canonical RAG v2（已完成，未切 consumer）

CV implementation merge：

- PR #17 `Build and evaluate offline canonical RAG v2`
- merge commit `8b4f32f91edf63e913dc6c6a097ea182d6e4efe2`
- main-push validation workflow PR #18
- workflow merge commit `93369207abdf891f18ddc180c58eb558928a0e4b`

Private CV 路径：`master/project-evidence/rag-v2/`

核心 artifacts：

- `RAG_V2_ARCHITECTURE.yaml`
- `RAG_V2_EVALUATION_PROTOCOL.yaml`
- `RAG_V2_RESULTS.json`
- `RAG_V2_ABLATION_RESULTS.yaml`
- `RAG_V2_COMPARISON_REPORT.yaml`
- `RAG_V2_EXECUTION_MANIFEST.yaml`
- `RAG_V2_VALIDATION_REPORT.yaml`
- `scripts/rag_v2.py`
- `scripts/run_rag_v2_eval.py`
- `scripts/test_rag_v2.py`
- `scripts/validate_rag_v2.py`
- `.github/workflows/rag-v2-offline.yml`

架构边界：

- canonical Stage 2 indexes 是唯一 evidence input。
- candidate retrieval 与 evidence adjudication 分成两个阶段。
- retrieval 使用 positive canonical fields、field-aware BM25、bounded bilingual phrase aliases、deterministic character n-gram similarity 和 structural canonical linkage。
- adjudication 单独读取 status、ownership、allowed expression、prohibited expansion，再输出 Direct / Transferable / Adjacent / Unsupported。
- runtime 不读取 evaluation query IDs、gold IDs/labels 或 legacy outputs 作推断。
- 未调用外部 embedding/model/API，未用 42-query gold 作 supervised parameter fitting。

预声明 ablation 后选中 `without_canonical_graph`，准确含义是：

- **关闭 graph rank propagation**，因为它降低早期排序质量；
- canonical relations 仍用于 fact-capability-concept evidence linkage 和 guardrail inheritance；
- 不是删除 ontology，也不是退回 legacy graph。

选中 v2 与 frozen legacy 对比：

```text
Metric                                      Legacy       V2
Project Recall@1                            0.647436     0.844017
Project Recall@3                            0.844017     0.938034
Project Recall@8                            0.920940     0.991453
Project MRR                                 0.839744     0.987179
Project nDCG@8                              0.838915     0.974253
Exact fact-ID recall                        0.461616     0.912821
Full reviewed-gold classification accuracy  0.595238     1.000000
Unsupported hard-negative accuracy          0.250000     1.000000
Must-not-be-Direct false-positive rate       0.230769     0.000000
```

Exact fact-ID 指标的 denominator 不完全相同：v2 覆盖全部 39 个有 canonical fact references 的 query；legacy 只能评估 33 个 canonical-compatible cases。因此该 delta 是重要 diagnostic，但不能伪装成完全同 denominator 的严格估计。

Ablation 结论：

- 去掉 structured guardrail adjudication 后，full accuracy 降至 `0.690476`。
- Unsupported hard-negative accuracy 降至 `0.0`。
- must-not-be-Direct false-positive rate 升至 `1.0`。
- 这说明主要改进不是“换了 embedding”，而是 canonical fact alignment + explicit evidence adjudication。

Validation：

- 9 个 focused regression/safety tests passed。
- 42 queries、unique IDs、canonical reference resolution、input hashes、gold-leakage checks、positive-retrieval/guardrail separation、deterministic rerun 和所有 acceptance gates passed。
- PR #17 passing Actions run `31340437108`。
- workflow-only PR #18 passing Actions run `31340515159`；main 现在会在相关文件 push 时重跑同一套 tests/build/validator/drift check。

解释限制：42 条是 small authored benchmark。该数据集上的 perfect adjudication **不是外部验证，也不能证明 unseen JDs 上完美**。这是选择下一阶段的重要原因。

Scope remains unchanged：

- Job Radar `app/lib/hybrid-rag.ts` 未修改。
- `app/api/cv-tailor/analyze/route.ts` 未切换。
- legacy indexes / frozen outputs 未修改。
- canonical facts、CV templates 未修改。
- 当前 production consumer 仍是 legacy baseline。

## 8. 必须保持的事实边界

- Direct ≠ Transferable ≠ Adjacent。
- Transferable 不能写成真实目标行业经验。
- Adjacent 不能自动升级 Direct。
- planned/proposal ≠ completed。
- project-level methods ≠ personal contribution。
- retrieval score / embedding similarity / BM25 / graph distance ≠ factual truth。
- FACT_MASTER、旧 CV bullets、legacy Stage 2–7 不能创建 canonical/reviewed gold。

关键项目边界：

- NeuroStat `NVL-001/002`：planned/design-only；不得写 completed multi-agent implementation/results/RL training。
- Markov-switching Matrix AR：`collaborator_project_level_only`。
- Lumbosacral 两项目：primary statistical-analysis role 是 user-confirmed provenance，不得伪装为 manuscript CRediT。
- MAPA：coauthor + preprint/project-level context；不得升级 lead-method ownership 或 peer-reviewed status。
- Pfizer：direct 为 NB recurrent-event/AER、Monte Carlo/sensitivity、composite endpoint evaluation；不得写 joint longitudinal/copula/regulatory authority。
- Readmission：temporal validation ≠ prospective deployment / another-institution external validation。
- RESI：`up to about 50x` 必须保留 benchmark context。
- Model Reliance：model reliance ≠ causal feature importance / SHAP；research analysis ≠ production deployment。

## 9. Legacy Hybrid RAG 保留

旧 runtime 与 indexes 必须继续保留为 baseline/prototype，不是 canonical truth：

- legacy Stage 2–7
- `FACT_INDEX.jsonl`
- `FACT_INDEX_STATUS_ADDENDUM.jsonl`
- `PROJECT_INDEX.jsonl`
- `CONCEPT_EDGES.jsonl`
- `CREDENTIAL_INDEX.jsonl`
- `COURSEWORK_INDEX.jsonl`
- `PROFILE_INDEX.jsonl`
- `LITERATURE_INDEX.jsonl`

Job Radar current consumer 仍使用 legacy indexes。不要静默切换。

## 10. Future application archive contract

Durable specification：[`docs/APPLICATION_ARCHIVE_CONTRACT.md`](docs/APPLICATION_ARCHIVE_CONTRACT.md)。

核心约定：

- 每个申请用稳定 `APP-...` archive primary key。
- 必须保存完整 JD snapshot。
- 固定 required files：`application_record.yaml` + `jd_snapshot.md`；任一缺失必须停止，不能猜。
- requisition ID、数据库 row ID、UI applicationId 不自动等于 archive primary key。
- 当前 archive repo/packages 尚未创建。

## 11. Held-out / unseen-JD validation（已完成，未通过迁移门槛）

CV validation merge：

- PR #19 `Validate RAG v2 on held-out real JDs`
- merge commit `ce2998317bde5ddba56741edf3fb69e99e06280f`
- passing Actions run `31345339501`
- private artifacts: `master/project-evidence/heldout-validation/`

冻结设计：

- 5 个 v2 完成后才选取的真实 Job Radar JD snapshots；
- 20 条 core requirements；
- 4 条 adversarial overclaim cases；
- 4 条中文 paraphrases；
- 3 条 general skills / coursework coverage gaps，不强迫判成 Unsupported；
- 24 条 scored labels 全部由用户在预测运行前明确确认。

用户确认后的 label distribution：Direct 10、Transferable 2、Adjacent 6、Unsupported 6。`HOLD-007 = Direct` 的语义是具备真实 cross-functional collaboration 即满足要求，不需要和列举的每一个职能部门都有合作经历；实际 CV 仍只能写真实合作过的团队。

冻结 legacy 与 selected v2 的 held-out 结果：

```text
Metric                                      Legacy       V2
Project Recall@8                            0.378788     0.810606
Exact canonical fact-ID Recall@8            0.037879     0.435606
Full reviewed-gold classification accuracy  0.375000     0.583333
Unsupported accuracy                        0.000000     0.333333
Must-not-be-Direct false-positive rate       0.000000     0.250000
Chinese paraphrase label consistency         0.000000     0.000000
```

结论：v2 在 project retrieval 和整体 classification 上明显优于 legacy，但只通过 8 个预声明 gates 中的 `Project Recall@8`。其余 7 个 gates 失败，因此：

- 不允许 production consumer migration；
- 不进入 Job Radar shadow mode；
- 不修改 `app/lib/hybrid-rag.ts` 或 `app/api/cv-tailor/analyze/route.ts`；
- 不把 authored 42-query 上的 1.0 accuracy 当成 unseen-JD 表现。

主要 failure taxonomy：

- exact fact alignment 仍弱：project recall 已到 `0.810606`，fact recall 只有 `0.435606`；
- Unsupported guardrails 缺口：wet-lab molecular、neuromodulation/electrophysiology、platform ownership、trading deployment 等被判成 Direct/Adjacent；
- implicit target-domain transfer 检测不足：economic model、trading idea 等在没有显式 `transfer/apply` 时被升级成 Direct；
- Chinese-to-English sparse retrieval 失败：4 条中文 paraphrase 全部 Unsupported；
- related-context retrieval 不足：部分 client communication 案例被判 Unsupported，而不是 Adjacent。

两次完整执行的 legacy、v2 和 comparison outputs 均 byte-identical。Canonical facts、authored benchmark、frozen runtimes、CV templates 和 production consumer 均未修改。

## 12. 下一阶段入口

当前 held-out set 已经被查看并用于 error analysis，后续只能作为 frozen diagnostic / regression set，不能在修复后继续称作 untouched held-out validation。

下一阶段必须：

1. 基于 failure taxonomy 设计独立的 RAG v2.1 offline changes；
2. 不改当前 reviewed labels 或 requirements 来提高成绩；
3. 在检查 v2.1 predictions 之前，另行冻结第二套 untouched real-JD validation set；
4. 同时报告 authored benchmark、held-out diagnostic set 和第二套 untouched validation，不合并 denominator；
5. 只有第二套 untouched validation 通过预声明 gates，才重新讨论 shadow mode。

继续禁止：切换 production consumer、覆盖 legacy baseline、修改 canonical facts、修改 CV templates、生成具体 JD CV、创建 application archive repo。
