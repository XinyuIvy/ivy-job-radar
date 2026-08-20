# Job Application / CV Knowledge Base 项目交接

最后更新：2026-08-20（America/New_York）

> **本文件是当前项目最高优先级 handoff。** 新 Chat 接手时先重新读取 GitHub 当前 `main`、开放 PR、Actions 和本文件；GitHub 当前状态优先于本文记录的 SHA。下面保留 RAG 建设与评估历史，主要用于可追溯性和后续面试准备，不代表要重新启动已经结束的 RAG 实验。

## 0. 当前权威状态：真实申请 / CV / Autofill 已跑通，当前主要任务是 UX 与性能收尾

### 0.1 三个仓库的职责边界

- `XinyuIvy/CV`（private）：长期事实母版、原始项目证据、canonical facts/capabilities/concepts/relations、行业中英文 TeX 母版、全站共用 Application Autofill Profile。
- `XinyuIvy/job-application-archive`（private）：每个真实申请 `APP-...` 的冻结 JD、冻结事实快照、所选 CV 母版、Chat Prompt、最终 TeX/PDF/TXT/build manifest/application autofill packet，以及明确确认后的 submitted snapshot。
- `XinyuIvy/ivy-job-radar`：岗位采集/筛选、候选与申请工作流、定制 CV 入口、Autofill bridge / Chrome extension 和用户界面。

**不要混淆职责：** Job Radar 不是复杂 CV 编辑器；最终 CV 内容在 Chat 中人工审核和修改。`CV` repo 不保存某个岗位的最终定制 CV；`job-application-archive` 不应反向成为事实母版。

### 0.2 当前用户日常主流程

```text
发现 / 手动保存真实 JD
        ↓
候选岗位
        ↓
选择 CV 母版 + 确认完整 JD
        ↓
建立稳定 APP-ID 并冻结 13 个初始文件
        ↓
复制 Prompt 到新的 Work / Codex Chat
        ↓
Chat 独立复核 Direct / Transferable / Adjacent / Unsupported
        ↓
先改纯文本内容和项目顺序
        ↓
用户确认 final TeX
        ↓
Archive Action 生成 PDF / TXT / manifest / application_autofill packet
        ↓
实际投递后状态改为“已申请”
        ↓
Chrome Autofill = Global Profile + 当前 APP final packet + 对应 final PDF
```

三个确认点仍然有效：

1. 分类阶段：只确认会影响 CV 内容的重要分歧，每批最多 3–5 条。
2. 内容阶段：先确认 Summary / Skills / Projects / Experience / bullets 和顺序。
3. PDF 阶段：确认最终排版；只有明确确认“这就是实际提交版本”后才保存 submitted snapshot。

### 0.3 每个 APP 的初始冻结包

初始 application bundle 固定为：

```text
applications/<year>/<APP-ID>/
    application_record.yaml
    jd_snapshot.md
    jd_requirements.json
    match_packet.json
    fact_master_snapshot.md
    canonical_project_index.jsonl
    canonical_fact_index.jsonl
    canonical_capability_index.jsonl
    canonical_concept_index.jsonl
    canonical_relation_index.jsonl
    canonical_retrieval_index.jsonl
    cv_base.tex
    chat_prompt.txt
```

后续可产生：

```text
match_analysis.md
evidence_manifest.json
cv_changes.md
cv_customized_<APP-ID>.tex
cv_customized_<APP-ID>.pdf
cv_customized_<APP-ID>.txt
cv_build_manifest_<APP-ID>.json
application_autofill_<APP-ID>.json
cv_submitted_<APP-ID>.pdf
interview_brief.md
```

`match_packet.json` 永远只是 Job Radar 初步分类，不是最终事实判断。Chat 必须读取完整 JD、完整 frozen facts、canonical indexes 和当前 CV 后独立复核。

## 1. CV 定制：母版和语言是一级权威输入

### 1.1 母版选择

PR #95 恢复了 **CV mother template 必选**。系统可以建议行业方向，但不能静默替用户决定母版。

用户在定制 CV 页面选择的 mother template 决定：

- `language`
- `source_versions.cv_template_path`
- `cv_base.tex`
- Chat Prompt 中的硬语言约束

### 1.2 中文 / 英文一致性修复

PR #98，merge commit：

`181c03a286de3c124e74b21ef00bf533d0aa3888`

修复原则：

- `application_record.yaml`、`cv_base.tex`、`chat_prompt.txt` 三者的语言和模板必须一致。
- Prompt 必须明确写：本次输出语言、已确认母版、最终自然语言内容不得自行切换语言。
- JD 是英文不代表英文 CV；事实库含英文不代表英文 CV。
- 已存在但还没有 final customized CV 的旧 APP，如果用户本次明确选择另一个 mother template，可以重新冻结输入。
- 已经有 final customized TeX/PDF 或 submitted snapshot 的 APP 不得静默覆盖历史版本，必须显式处理版本冲突。

历史示例：`APP-2026-16M-0032` 曾经冻结成 `language=en + cv_tech.tex`，所以旧 Prompt 会继续输出英文。该历史行为不能用来推断现在的 selector 仍然无效。

## 2. Archive / PDF 构建当前规则

- Final confirmation 后 Chat 写 `cv_customized_<APP-ID>.tex`。
- Archive GitHub Action 使用 LuaLaTeX 编译，并验证 ATS 文本提取。
- 生成 PDF、TXT、`application_autofill_<APP-ID>.json` 和 build manifest。
- 普通新 CV 仍以 `<= 2 pages` 为硬门槛。
- 已明确确认 `Actual submitted version confirmed` 的真实已提交版本，即使超过 2 页，也允许原样归档，并在 manifest 中记录 page-limit exception；不得为了通过 validator 擅自删改真实已提交版本。
- 已增加 artifact recovery：final TeX 已存在但 PDF/TXT/autofill/manifest 缺失或落后时，应自动补建，而不是让用户重新“定稿”。

### 2.1 `APP-2026-16M-0032` 的已知构建事故

该 APP final TeX 实际编译为 3 页。旧 Action 因 `--max-pages 2` 持续失败，因此 Autofill 显示“最终 PDF 尚未生成”。这不是漏跑，而是 validator 硬失败。

修复后：

- 该 APP 被识别为 actual submitted version；
- PDF/TXT/autofill/manifest 已成功落盘；
- 普通未来 CV 的 2 页规则没有被整体放宽。

## 3. Autofill：三层权威来源

### 3.1 Global Application Profile

所有招聘网站共用的固定申请资料放在：

`XinyuIvy/CV/master/application-forms/application-autofill-profile.md`

这里维护 CV 通常不会完整写出的稳定资料，例如：

- 教育详细字段
- 学院 / 专业
- 导师
- 研究单位
- GPA / 排名
- 研究领域
- 其他跨网站固定申请信息

这些信息**不是 Tencent General Profile，也不是 ByteDance General Profile**。

### 3.2 Site-specific override

某个招聘网站特有的字段才放 site-specific profile，例如：

- 特殊事业群选项
- 是否接受调剂
- 某网站独有下拉
- 需要确认其选项含义的字段

不要在 site-specific 文件里重复维护项目描述、教育主数据或 APP-specific CV 内容。

### 3.3 APP-specific final CV packet

以下内容以当前 APP 的最终 CV 为权威：

- Experience / Project 选择和顺序
- 项目与经历描述
- Skills
- Publications
- 项目 URL
- 对应 final PDF

Global profile 只能补结构化固定字段，不能覆盖当前 APP 的项目叙述。

### 3.4 Autofill 已完成的重要修复

- DB 中 UI 概念“已提交”对应真实 stored status：`已申请`。PR #92 修复此前使用字符串 `已提交` 导致 0 candidates 的问题。
- PR #93 修复手动选择 APP 后，点击填写时 selected APP 被重新按 URL 匹配覆盖的问题。
- General education Autofill 已改成跨网站通用能力，不按腾讯/字节硬编码：自定义 DOM 使用邻近 label、教育 block context 和成对日期字段识别。
- 教育记录优先根据当前 block 已显示的学校匹配 Global Profile，不再简单按“第几个学校”猜。
- `学历类型` 与 `学历` 在不同网站可能不是同义词；选项语义未确认时不得把本科/硕士/博士强塞进“学历类型”。
- APP packet parser 会从最终 TeX 的 `\href` / `\url` 提取项目链接。
- “独立数据与 AI 系统”也作为 project-like section 解析，以便最终 CV 中 Ivy Job Radar / AI Usage 等系统项目 URL 能进入 packet。
- CV 没有写 URL 的项目不自动猜 URL。
- Extension 仍然 user-triggered、never submit、skip sensitive EEO；不会自动点击网站的 “Add another experience/project”。

## 4. 岗位 / 候选 / 申请工作流当前状态

### 4.1 手动保存与 Today 去重

Chrome 手动保存会建立岗位记录并进入申请工作流。过去因此可能同时出现在“今日岗位”和“待提交申请”。

现在原则是：只要已经进入 tracked application / candidate flow，就不应重复作为 Today discovery 显示。

隐藏关联优先级：

1. exact stored job URL；
2. stable posting ID / requisition identity；
3. logical company + title + location identity。

不要重新退回只靠标题字符串匹配。

### 4.2 收藏 + 待提交已完全合并

PR #100：`Unify saved and pending into one candidate list`

merge commit：

`6fd8a7e89f400393195a1db51b6495f2cf163a7e`

当前产品语义：

- 原“收藏”导航改为“候选”。
- 星标保存的岗位 + `status=准备材料` 的 Application 放在同一候选列表。
- 不再有“收藏 / 待提交申请”两个状态或两个 tab。
- 同一 logical job 两边都有时只显示一次；application record 优先。
- 从星标岗位建立 application record 后，仍留在同一候选列表，只是升级为更完整的 application card。
- 已申请 / 面试 / Offer / 拒绝进入“申请”页。

## 5. UX / 性能：已合并 Fast UI v1

PR #99 已合并，核心原则：

- 页面数据按 tab 懒加载，不再首页一次性请求所有页面的数据。
- Scan polling 只在相关页面运行。
- 去掉全站每秒重 render；扫描时钟/状态降低更新频率。
- Data quality automation 只在核验页运行。
- Jobs / Companies / Applications 使用分页，避免一次 render 全部记录。
- Application save 使用 optimistic close/update；后台再 durable write / reconcile，失败才 rollback。
- 删除申请、完成任务等高频操作也走 optimistic UI。
- Applications API duplicate detection 不再每次保存都扫描整张表，而是先缩小候选集。
- 静态 seed 写入做 warm-worker cache，减少重复无意义写操作。

## 6. 当前最重要的未完成工作：Fast Simple v2 PR #101

PR：

`https://github.com/XinyuIvy/ivy-job-radar/pull/101`

branch：

`ux/fast-simple-v2`

本次 handoff 写入时记录的 head：

`56c5ed943e48726360f3587ff3553f99fd752a18`

**状态：OPEN + DRAFT + NOT MERGED + NOT DEPLOYED。**

新 Chat 接手必须重新读取 PR 最新 head/CI，不要只相信上述 SHA。**在 PR #101 全部核心 CI 通过并合并前，不要让用户同步 Site 到这个 branch，也不要声称这些优化已经上线。**

### 6.1 Fast Simple v2 的 UX 目标

产品最终希望给其他人使用，所以第一次打开也要能理解。

主路径收敛为：

`今日 -> 候选 -> 定制 CV / 投递 -> 申请`

高级维护功能不再占主导航。

PR #101 当前实现方向：

- 主导航改成 5 个：**今日 / 候选 / 申请 / 工具 / 我的**。
- 公司研究、岗位核验、Autofill、Chrome 保存岗位、CV Knowledge、Screening Learning、忽略名单收进“工具”。
- 首页显式展示：`1 找岗位 -> 2 ☆ 保存到候选 -> 3 定制 CV 后投递`。
- 搜索框常驻。
- 地区简化成 `全部 / 美国 / 中国` chips。
- 高级“筛选”才展开方向和排序。
- 内部 track 用用户友好标签显示，例如 Technology -> 数据 / AI；Pharma -> 医药 / 生物统计。
- 默认排序文案改成“最适合我”。
- 支持一键清除筛选。
- Scan 详情默认折叠；只有用户展开“更新岗位”时才轮询 scan status。
- Application analytics / tasks / calendar 默认折叠为“统计与日程”。
- 移动端底部导航同步改为 5 slots。

### 6.2 Fast Simple v2 的性能目标和当前实现

#### 前端

- `useDeferredValue(jobQuery)`：避免每输入一个字符就同步重算大列表。
- Jobs 使用短期 session stale-while-revalidate：先显示最近缓存，后台再拿最新数据，降低白屏等待。
- Candidate fact-fit 改为 `IntersectionObserver`：只有卡片接近 viewport 才启动昂贵 CV analysis，不再候选页一打开就同时评分所有卡片。
- Fact-fit DOM enhancement 做 debounce。
- `ApplicationCvActions` 直接读取 React 输出的 `data-application-row-id`，不再额外全量 GET `/api/applications` 只为了注入“定制 CV”。
- Navigation state persistence 移除全页面 MutationObserver，改为 click/change/input/pageshow/popstate + debounce。
- `PendingApplicationLiveSync` 只负责跨标签页消息 / focus 通知，dispatch `ivy-job-radar:pending-refresh`；候选页 JobRadar 自己 debounce 后读取 applications。
- Hard requirement ignore 改成本地 optimistic remove + event，不再 `window.location.reload()`。
- Verification enhancement 只应在 verify view 可见时运行，并 debounce。

#### 后端 / D1

- `/api/jobs` 返回 `saved` flag，避免初次打开再单独 GET saved-jobs。
- ignored / saved / tracked applications / jobs 查询并行。
- tracked application identity 使用 stable-ID / role candidate maps，避免每个 job 对全部 applications 做 `.some()`。
- display dedupe 从 O(n²) `findIndex` 改为 map-based O(n) 路径。
- **不同 stable requisition ID 必须继续视为不同岗位**，不能为了 O(n) 去重把多个真实职位合并。
- visible jobs 有很短的 warm-worker cache；POST/PUT/DELETE 后必须正确失效。
- `getDb()` 加 `app_meta.schema_version` fast path，避免每个新 worker isolate 都重新跑几十次 CREATE/PRAGMA。
- 同一个 table 的 `PRAGMA table_info` 在一次 migration/init 中只读取一次。
- 为 applications/jobs/saved/ignored 热路径增加 indexes。

### 6.3 PR #101 当前阻塞项

最近已观察到：

- app build 可以通过；
- app lint 可以通过；
- China platform smoke 可以通过；
- Python regression tests 仍有失败。

这些失败大部分是**旧测试锁死旧实现**，不是要求把新性能架构退回去。

已知 stale test contracts 包括：

- 强制保存后 `await loadApplications()`；
- 强制 `ApplicationCvActions` 先全量 GET applications；
- 强制 layout 继续存在旧 floating CV Knowledge / Autofill / Bookmark shortcuts；
- 强制 hard-requirement ignore `window.location.reload()`；
- 强制 NavigationStatePersistence 使用全 DOM MutationObserver；
- 强制 Pending Live Sync 自己 DOM 插卡并全量读 applications；
- 强制旧“收藏与待提交”文案 / 旧候选标题；
- 强制旧 6-slot mobile nav；
- 强制旧 jobs seed / old O(n²) identity implementation 字符串。

**下一步：读取最新 Python failure log，逐个把这些测试升级成验证新权威路径。不要为了让旧测试变绿重新加回全表 refetch、全页 reload、5 秒轮询或多层 MutationObserver。所有核心 CI 全绿后再把 PR #101 ready + merge。**

## 7. 面向外部用户的产品原则

后续所有 UX / performance 改动按以下原则判断：

- 第一次使用的人只需要理解：**今日 -> 候选 -> 投递 -> 申请进度**。
- 高频点击必须先给本地即时反馈；durable write / reconcile 在后台完成，失败再 rollback。
- 保存后不要为了“确认”就全页 refresh 或全表 refetch。
- 不在当前 view 的 API 请求、定时轮询、observer 必须尽量停止。
- 大列表使用 pagination / deferred compute / viewport-triggered work；不要一次 render / score 所有内容。
- 筛选用用户语言，不暴露内部 schema / track / source implementation details。
- 高级筛选和运维/数据质量信息使用 progressive disclosure，不默认铺满首页。
- UI 普通 refresh 和真正“重新扫描招聘网站”是两个概念：前者应该快且可缓存，后者是显式后台任务。
- 不要用动画掩盖慢请求；优先减少请求、减少数据库 round trip、减少全量重算和全 DOM observer。

## 8. 部署 / 本地更新规则

务必区分：

- **代码 merge != Site 已部署。** 只有用户明确让 `@Sites` 同步最新 `main` 后才算 Site 已更新。
- **Site-only change**：只需要同步 Site；不需要本地 git pull / extension Reload。
- **browser-extension change**：本地 `git pull origin main` + `chrome://extensions` -> Reload；如果 Site 后端没改，不需要 Site sync。
- **Site + extension change**：两边都做。
- **archive-only change**：既不需要 Site sync，也不需要 extension Reload。
- Bookmarklet 是浏览器里本地保存的一段 JS；bookmarklet 代码改变时需要重新安装/拖拽，Site 更新不会自动替换旧 bookmark。

## 9. RAG / Canonical Knowledge：当前决策

### 9.1 现在的 CV tailoring 不重新启动 RAG 训练/调参

当前使用方案已经从“RAG 决定事实”调整为：

1. 模型读取完整 JD；
2. 模型读取当前 CV；
3. 模型读取完整 frozen fact master / canonical indexes；
4. 模型独立做 Direct / Transferable / Adjacent / Unsupported；
5. 只有具体数字、贡献边界、证据争议时，才按 evidence ID 回查原材料。

因此：

- 不重新生成 embeddings；
- 不用 retrieval score 判断事实等级；
- 不因为旧 RAG benchmark 不完美就阻断正常 CV 定制；
- 旧 RAG / v2 / held-out 结果继续保留为 prototype / baseline / interview-prep evidence。

### 9.2 Stage 1 / Stage 2 已完成

Stage 1：15 个 major research / internship / software projects 全部 Ready for bounded Stage 2。

Stage 2 canonical graph：

- 15 Project Cards
- 37 Fact Cards
- 14 Capability Cards
- 18 Concepts
- 84 unified retrieval entries
- 118 relations

Canonical authority files：

- `STAGE1_COMPLETION_MANIFEST.yaml`
- `STAGE2_CANONICAL_MANIFEST.yaml`
- `STAGE2_SCHEMA.yaml`
- `STAGE2_PROJECT_CARDS.yaml`
- `STAGE2_FACT_CARDS.yaml`
- `STAGE2_CAPABILITY_CARDS.yaml`
- `STAGE2_ONTOLOGY.yaml`
- `STAGE2_COMPILED_MODEL_CONTEXT.yaml`
- `CANONICAL_PROJECT_INDEX.jsonl`
- `CANONICAL_FACT_INDEX.jsonl`
- `CANONICAL_CAPABILITY_INDEX.jsonl`
- `CANONICAL_CONCEPT_INDEX.jsonl`
- `CANONICAL_RELATION_INDEX.jsonl`
- `CANONICAL_RETRIEVAL_INDEX.jsonl`

Guardrails 必须保留：stable IDs、project linkage、status、ownership、exact sources、allowed expression、prohibited expansion。`evidence_strength.ranking_semantics = none`。

## 10. Retrieval evaluation 历史（面试准备重要，保留）

### 10.1 Frozen legacy baseline

Evaluation dataset：42 queries。

- English 37 / Chinese 5
- deterministic boundary 27
- subjective human-review-required 15

Frozen legacy runtime anchor：

`b857b472fb774d6df337a37072201f188dfc3824`

Legacy implementation：

- local subword hash，384 dimensions
- BM25 `k1=1.5`, `b=0.75`
- graph / candidate union / weighted scoring / classification
- legacy inputs：`FACT_INDEX.jsonl`, `FACT_INDEX_STATUS_ADDENDUM.jsonl`, `CONCEPT_EDGES.jsonl`

Frozen baseline metrics：

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
Unsupported hard-negative accuracy = 0.250000
must-not-be-Direct false-positive rate = 0.230769
```

主要问题不是单纯 embedding，而是：

- project retrieval 比 fact identity alignment 好很多；
- unsupported / overclaim boundary 很弱；
- legacy indexes 与 canonical fact IDs 不对齐；
- retrieval 与 factual adjudication 混在一起。

### 10.2 Human-reviewed gold

15 个 subjective cases 已由用户全部确认：

- Direct = 4
- Transferable = 6
- Adjacent = 5
- Unsupported = 0
- Pending = 0

IDs：

- Direct：EVAL-020, 021, 022, 024
- Transferable：EVAL-025–030
- Adjacent：EVAL-031–035

Post-review legacy classification：

- subjective 15：`7/15 = 0.466667`
- 全部 42：`25/42 = 0.595238`
- frozen deterministic-only accuracy 仍然保留 `0.666667`

这些数字用途不同，不能互相覆盖。

## 11. Offline canonical RAG v2 历史

CV repo PR #17：`Build and evaluate offline canonical RAG v2`

merge commit：

`8b4f32f91edf63e913dc6c6a097ea182d6e4efe2`

核心架构：

- canonical Stage 2 indexes 为唯一 evidence input；
- candidate retrieval 与 evidence adjudication 分离；
- retrieval：positive canonical fields、field-aware BM25、bounded bilingual aliases、deterministic char n-gram、canonical linkage；
- adjudication：单独读取 status / ownership / allowed expression / prohibited expansion；
- runtime 不读取 eval query IDs、gold labels 或 legacy outputs 作推断；
- 未调用外部 embedding/model/API；
- 未用 42-query gold supervised fitting。

Ablation 后选中 `without_canonical_graph` 的准确含义：关闭 graph rank propagation，但仍保留 canonical relations 作为 fact-capability-concept linkage 和 guardrail inheritance；不是删除 ontology。

Selected v2 vs legacy：

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

重要解释：exact fact-ID recall denominator 不完全相同。V2 覆盖 39 个有 canonical fact references 的 query；legacy 只有 33 个 canonical-compatible cases。因此这是重要 diagnostic，但不是完全同 denominator 的严格实验对比。

去掉 structured guardrail adjudication 后：

- full accuracy `0.690476`
- Unsupported hard-negative `0.0`
- must-not-be-Direct FPR `1.0`

这说明最关键的改进来自 canonical alignment + explicit evidence adjudication，而不是简单“换 embedding”。

## 12. Held-out real-JD validation 历史

CV repo PR #19：`Validate RAG v2 on held-out real JDs`

merge commit：

`ce2998317bde5ddba56741edf3fb69e99e06280f`

设计：

- 5 个 v2 完成后才选的真实 Job Radar JD snapshots
- 20 条 core requirements
- 4 条 adversarial overclaim
- 4 条中文 paraphrases
- 3 条 general skill/coursework coverage gaps
- 24 条 scored labels 在 predictions 前由用户确认

Label distribution：Direct 10、Transferable 2、Adjacent 6、Unsupported 6。

Held-out 结果：

```text
Metric                                      Legacy       V2
Project Recall@8                            0.378788     0.810606
Exact canonical fact-ID Recall@8            0.037879     0.435606
Full reviewed-gold classification accuracy  0.375000     0.583333
Unsupported accuracy                        0.000000     0.333333
Must-not-be-Direct false-positive rate       0.000000     0.250000
Chinese paraphrase label consistency         0.000000     0.000000
```

V2 明显改善 project retrieval 和总体 classification，但只通过预声明 gates 中的 Project Recall@8。主要 failure taxonomy：

- project recall 已明显提高，但 exact fact alignment 仍弱；
- unsupported guardrails 对 wet-lab molecular、neuromodulation/electrophysiology、platform ownership、trading deployment 等仍不可靠；
- implicit target-domain transfer 检测不足；
- Chinese-to-English sparse retrieval 失败；
- related-context retrieval 对 client communication 等仍不足。

因此当时的结论是：**不允许 production consumer migration，不进入 shadow mode。**

该 held-out set 已经被查看并用于 error analysis，不能再称为 untouched validation。

现在也不要重启所谓 RAG v2.1 / 第二套验证，除非用户以后明确要继续该研究方向。当前求职 CV workflow 已采用“完整事实读取 + evidence-specific RAG 回查”的新方案。

## 13. 必须保持的事实边界

- Direct ≠ Transferable ≠ Adjacent。
- Transferable 不能写成真实目标行业经验。
- Adjacent 不能自动升级 Direct。
- planned / proposal ≠ completed。
- project-level method ≠ personal contribution。
- retrieval score / embedding similarity / BM25 / graph distance ≠ factual truth。
- FACT_MASTER、旧 CV bullet、legacy Stage 2–7 不能创建新的 canonical truth。

关键项目边界：

- NeuroStat / multi-agent：planned/design-only 的部分不得写成 completed RL training / completed multi-agent results；事实母版后续有明确更新时以最新 canonical facts 为准。
- Markov-switching Matrix AR：`collaborator_project_level_only` 的方法不能自动全部归到个人贡献。
- Lumbosacral 两项目：primary statistical-analysis role 是 user-confirmed provenance，不伪装成 manuscript CRediT。
- MAPA：coauthor + preprint/project-level context，不升级 lead-method ownership 或 peer-reviewed status。
- Pfizer：可写真实 NB recurrent-event/AER、Monte Carlo/sensitivity、composite endpoint evaluation；不能凭空写 copula/regulatory authority。后续 factual additions 必须来自最新 fact master。
- Readmission：temporal validation ≠ prospective deployment / another-institution external validation。
- RESI：`up to about 50x` 保留 benchmark context。
- Model Reliance：model reliance ≠ causal feature importance / SHAP；research analysis ≠ production deployment。

## 14. 不要重新做 / 不要误做

- 不要重启旧 RAG v2.1、shadow validation、embedding 重建，除非用户明确改变方向。
- 不要用 retrieval score 判 Direct / Transferable / Adjacent。
- 不要 bulk migrate / delete 历史 applications，除非用户明确要求。
- 不要覆盖 final/submitted APP archive 历史版本。
- 不要把 private JD 或 private archive 写进 public repo。
- 不要让 Job Radar 静默决定 CV mother template；用户选择才是权威。
- 不要因为某个招聘网站字段识别失败，就把 Global Profile 拆成该公司专属 profile；先修通用 DOM/context recognition。
- 不要为了通过旧测试，把 PR #101 已移除的全表 refetch、全页 reload、5 秒轮询或全 DOM MutationObserver 加回来。
- 不要宣称 PR #101 已部署，直到它真正 merge 到 `main` 且用户明确完成 Site sync。

## 15. 新 Chat 接手顺序

1. 读取 `XinyuIvy/ivy-job-radar@main` 最新状态与本 `PROJECT_HANDOFF.md`。
2. 读取开放 PR，尤其 PR #101 的最新 head、changed files、CI。
3. 如用户继续“速度 / 简化”任务：先解决 PR #101 最新 Python regression failures，全部核心 CI 绿后再 merge。
4. merge 后只告诉用户是否需要 Site sync / extension update，明确区分两者。
5. 如用户继续 CV 定制：按真实 APP-ID 读取 archive 的冻结文件，不根据聊天记忆猜岗位、母版或语言。
6. 如用户继续 Autofill：Global Profile + APP final packet + site-specific override 三层边界不变。
7. 如用户问 RAG 历史或面试准备，使用第 9–13 节；不要因此启动新的 RAG 实验。
