<!-- LATEST-HANDOFF-2026-08-08 -->

# Ivy Job Radar / CV Knowledge Base 项目交接

最后更新：2026-08-08

> 这是当前项目的唯一权威 handoff。若本文件中的 2026-08-08 状态与 Git 历史、旧聊天或更早 handoff 冲突，以本节为准。旧的 2026-08-01/02 handoff 已被本版本吸收，不应继续把那些已经完成的事项当成未完成任务。

## 1. 项目是什么

当前工作的主线已经从单纯“招聘信息聚合网站”发展为两部分：

1. **Ivy Job Radar**：岗位扫描、收藏、待提交、申请进度、核验、公司研究、个人资料等求职工作流。
2. **CV Knowledge Base / Hybrid RAG**：把用户真实 research / internship / software evidence 结构化成 atomic facts、capability ontology、industry translation，并在未来把 JD 与这些事实做严格的 fact-grounded 匹配。

主要仓库：

- Job Radar：`XinyuIvy/ivy-job-radar`
- CV / evidence：`XinyuIvy/CV`
- Job Radar 当前为 **public repo**。
- `XinyuIvy/CV` 保持 private。
- Live Site：`https://ivy-job-radar.rourou1199.chatgpt.site`
- Site slug：`ivy-job-radar`
- Site 不会因为 GitHub merge 自动部署。每次功能性 main commit 合并后，用户通常在另一个 ChatGPT Site 编辑 chat 中手动同步 commit SHA。
- Site 已配置 `CV_GITHUB_TOKEN`，用于服务端读取 private CV repo。绝对不要让用户在聊天中粘贴 token，也不要把 token 值写进源码、README、PR、日志或 public repo。

2026-08-08 当前功能基线：

- CV Knowledge Base 功能 commit：`4e55da0b59fbae4a29af68efa16b625a595f9f16`
- 上一轮 handoff 文档误加到了 `docs/JOB_RADAR_HANDOFF.md`，这是错误位置。本次修复后应只维护根目录的 `PROJECT_HANDOFF.md`。

---

## 2. 用户对交互体验的核心要求

用户不希望 Job Radar 像一个每次操作都等待完整数据库/API返回、然后刷新整个网页的慢后台。

正确方向是：**Optimistic UI + progressive enrichment**。

标准交互应该是：

```text
用户点击动作
-> UI 立即变化
-> 后台保存数据库
-> JD / 核验信息 / 公司信息等慢字段随后补齐
-> 如果保存失败，再自动回滚或提示失败
```

典型例子：

- 今日岗位点“收藏”后，卡片立刻消失，后面的岗位直接往上移动。
- 收藏页可以先出现“公司 + 岗位名”，完整 JD 等稍后补齐。
- Chrome 手动保存后，岗位立刻成为“我的待提交申请”第一条。
- 人工核验通过后，核验卡立即消失，今日岗位可以先出现轻量 placeholder，完整字段后台补。
- 申请状态改变后，卡片应立即在 pending / submitted / interview / offer / rejected bucket 之间移动。

用户曾询问是否给每页增加“刷新本页”。技术上可以，但现在优先级降低。用户更偏好上面的 optimistic/shared-state 架构，而不是靠更多刷新按钮弥补状态同步。

避免在正常工作流中继续使用 `window.location.reload()`。

---

## 3. 当前主要页面与状态语义

主页面包括：

- 今日岗位
- 收藏与待提交
- 申请进度
- 公司研究与面经
- 岗位核验
- 个人资料
- 不再推荐

申请状态包括：

- 准备材料
- 已申请
- 一面
- 二面/技术面
- 终面
- Offer
- 撤回
- 拒绝

“待提交申请”对应数据库 application status：`准备材料`。

岗位核验页面只有一个用户可见核验队列。内部虽然有普通岗位核验记录与 data-quality issue，但不要把 UI 描述成“手动队列 vs 自动队列”。

需复核记录的目标动作：

- 人工通过
- 重新核验
- 不再推荐
- 仅删除记录

---

## 4. 筛选与偏好规则，已经更新过的旧状态

### 4.1 工资筛选：已取消

旧 handoff 曾把“删除工资门槛”列为未完成 P0。这个状态已经过期。

当前规则：

- **工资不再作为自动排除条件。**
- 低工资、日薪、月薪缺失、补贴表达等不能单独造成岗位被排除。
- 薪资字段可以保留用于展示或待核验。

不要恢复旧的 20K 门槛逻辑。

### 4.2 用户目标岗位

用户目前主要考虑：

- Biostatistics / Statistics
- Data Science / ML Scientist / Research Scientist
- Applied AI / Healthcare AI / Medical Device
- Quantitative Research
- Healthcare / Life Sciences Consulting

明确不以以下方向为目标：

- 软件工程
- 前端 / 后端
- 算法工程
- 纯 GenAI / LLM / NLP 开发

但不能因为 JD 中出现 `deep learning`、`reinforcement learning`、`deployment`、`LLM` 等单词就机械排除；要判断岗位核心职责。

### 4.3 hard requirement 与偏好学习必须分开

PR #44 已完成 hard-requirement exclusion 语义。

Commit：`5f295d7cd0adb9a78e0db5d86195f6bd2e620502`

三类重要语义：

- 岗位已关闭或链接失效：事实性关闭
- 岗位方向不感兴趣：真正偏好拒绝，可以作为 negative preference learning
- 硬性要求不符合：只排除当前岗位，**不能**根据岗位关键词形成负偏好学习

hard mismatch 子原因包括：

- 经验年限或职级不符合
- 学历或专业要求不符合
- 工作授权或 sponsorship 不符合
- 地点或工作方式不符合
- 必备技能、证书或语言不符合
- 其他硬性条件不符合

提交语义包含：

```text
exclusionType = hard_requirement_mismatch
learningEligible = false
```

---

## 5. 2026-08-08 前后已经完成的交互与性能工作

以下内容过去曾是 bug / 未完成项，现在已经完成，不要在新 chat 中重新当 TODO。

### 5.1 Navigation state persistence：完成

PR #45

Commit：`8be36a4c350c518f0dd059974fc91dfbb9810f2a`

保留：

- 当前 view
- selects / filters
- search
- scroll

避免用户每次导航都丢失当前位置。

### 5.2 Job cache 第一版：完成

PR #46

Commit：`6cc3391c0e49018aa98703f56e8565f1fa8a07a4`

实现短期 `/api/jobs` session cache，减少部分重复加载。

注意：这只是第一版，并没有完全解决 cold full-page refresh 十几秒的问题。因此后续主要转向 optimistic UI，而不是继续堆整页 cache hack。

### 5.3 Chrome 手动保存直接进入待提交：完成

PR #47

Commit：`c21f28d54f7923184a7d085065c2956e8c18d446`

当前正确行为：

- Chrome bookmark save 不进入核验队列。
- 直接创建 application，status=`准备材料`。
- 每次保存使用独立 popup 名称，快速连续保存不会互相覆盖。

注意：Chrome bookmarklet 会把 JavaScript 固化在书签里。如果某台设备仍使用 PR #47 之前安装的旧 bookmarklet，可能需要重新安装新版书签。

### 5.4 新保存岗位实时进入待提交列表：完成

PR #48：首次加入 live insertion

Commit：`fa0ad50f4a431dd354efd09a8c8ebed2c65ebfd5`

PR #49：增强可靠性

Commit：`99065222c29ea4faaa1f2cc4c317f8a4f0c69d7c`

加入：

- BroadcastChannel
- localStorage storage-event fallback
- `/api/applications` server reconciliation
- focus reconciliation
- visibility reconciliation
- 不再强制 scroll
- 不再整页 reload

### 5.5 新岗位插错位置 bug：完成

问题：

手动保存后，新岗位一开始被插到了“收藏与待提交”页面顶部的摘要卡区域，而不是下面真正的“我的待提交申请”列表。

根因：

旧 live-sync 逻辑通过页面中任意 `待提交申请` 文本向上找最近的 `section/div`。顶部 summary button 也包含 `待提交申请`，于是 selector 错把 summary 区域当成目标容器。

修复：PR #50

Commit：`91d3fbfb4f238e7f8b1ec6efe35cef8550cfdb45`

现在严格要求：

- hero 标题必须为 `收藏与待提交`
- `.stats-two button.active` 必须是待提交 bucket
- 插入目标只能是可见的 `section.application-list`

当前正确结果：

- 顶部摘要卡不再接收岗位卡
- 新保存岗位作为下面正式待提交 list 的第一条
- 原有记录依次下移
- 不强制滚动

### 5.6 待提交摘要数字不即时更新 bug：完成

问题：

手动保存后，下面 list 已经立刻出现新岗位，但顶部“待提交申请”摘要数字仍保持旧值，要等后续刷新或数据重新加载。

修复：PR #51

Commit：`581a7c17d5d8fa52f5927b0d86a38dd5f661ebe3`

现在：

- 新保存事件先 optimistic +1
- 随后请求 `/api/applications` 做 server reconcile
- 避免 BroadcastChannel / storage 重复事件永久把数字加多

### 5.7 收藏后今日岗位仍停留 / 整页刷新慢：第一阶段完成

用户明确希望：

```text
今日岗位点收藏
-> 当前卡立即消失
-> 后面岗位立刻补位
-> 收藏页立即知道这条岗位
-> 详细信息慢慢同步
```

PR #52 完成第一阶段 optimistic dashboard actions。

Commit：`c98e3c46e690c7bc018dfedecd7662a3346d3afa`

最终 CI：

- Python tests success
- app lint success
- app build success

当前实现：

- 今日岗位点收藏后卡片立即隐藏，后续岗位上移。
- React saved state 同时更新，所以切到收藏页无需等 full reload。
- 后台保存失败时可以恢复卡片。
- 普通“不再推荐”可以先隐藏，再后台校准。
- 人工核验通过不再强制 full-page reload。
- 核验卡即时消失。
- 人工通过岗位可以先在今日岗位出现轻量 placeholder，详细信息后台同步。

这是后续所有 workflow transition 应继续采用的模式。

---

## 6. 本轮遇到的重要问题、原因与最终解决方式

这一节用于防止下一个 chat 重复踩坑。

### 6.1 BroadcastChannel 单独不够可靠

问题：

bookmark capture popup 很快关闭时，单独依赖 BroadcastChannel 可能导致主 Job Radar tab 错过创建事件。

改进路线：

1. 最初只 post BroadcastChannel。
2. 后来让 channel 延迟关闭。
3. 再加入 localStorage 持久化最后一次事件。
4. 主 tab 监听 `storage` event。
5. 页面重新获得 focus / visibility 时主动与 `/api/applications` 对账。

最终状态：PR #49 的多重 fallback 比单独 BroadcastChannel 稳定。

不要退回只靠 BroadcastChannel 的实现。

### 6.2 DOM 注入只是过渡方案，React state 才是最终方向

手动保存实时卡片最初通过独立组件向 DOM 直接 `prepend` 卡片，这是为了快速解决跨 popup 实时显示问题。

问题：

- React rerender 可能删除手动 DOM 节点。
- 顶部 summary count 与 DOM 注入卡之间容易状态不一致。
- injected card 的按钮/字段可能与正式 React-rendered application card 不完全一致。

当前策略：

- 现有 live-sync 保留作为已工作的过渡层。
- 新功能尽量直接更新 `JobRadar` 的共享 React state。
- 长期 clean architecture 是让跨窗口事件进入 React state，而不是不断增加 DOM patch。

如果以后出现“新卡先出现又消失”“临时卡按钮与正式卡不一样”等问题，优先修 state integration，不要继续叠 DOM hack。

### 6.3 `window.location.reload()` 是性能问题的重要来源

问题：

一些动作完成后为了简单保证一致性，会直接 full reload。Job Radar 首屏会请求多组数据，因此用户每次操作后可能等待十几到二十秒。

解决思路：

- 保存动作先 optimistic change UI
- 后台 API persist
- 单独 reconcile 受影响的数据
- 不重新初始化整个 dashboard

人工核验通过已按此思路改掉 full reload。收藏也采用 optimistic hide + backend persistence。

### 6.4 “轻量卡先出现，完整信息后同步”是明确产品决定

用户接受甚至偏好渐进式信息：

- 公司名
- 岗位名
- 状态

先出现即可。

JD、地点、来源、核验 evidence、公司研究等慢字段可以稍后补齐。

不要为了等待“完整岗位对象”阻塞主操作。

### 6.5 PR #52 Python tests 一度失败，但不是新功能逻辑坏了

第一次 CI 中 Python unit tests 报 4 个 failure。

根因是旧测试仍在断言已经被产品决定替换的旧行为，例如：

- 旧字段 `factEvidence`
- 旧 CV alias 断言
- 旧 bookmark 提示文案
- 人工通过后必须 `selectedNav: 今日`
- 必须调用 `window.location.reload()`

这些 tests 与当前实现已经不一致。

处理：更新过期测试，使其断言新的结构化 evidence 和“no full-page reload”语义。

最终 PR #52：Python / lint / build 全绿后才 merge。

教训：看到测试红时先判断是 regression 还是 stale test，不要为了让旧测试通过恢复已废弃产品行为。

### 6.6 CV Knowledge Base 第一次 lint 失败

PR #53 第一次运行：

- app build success
- Python tests success
- lint failure

lint 问题：

1. `cv-knowledge-client.tsx` 中 effect 直接触发同步 setState，被 React hook lint 判为 cascading render 风险。
2. 内部导航 `/` 使用 `<a>`，Next.js 要求 `<Link />`。
3. `cv-knowledge.ts` 有未使用变量。

修复后重新跑 CI：

- Python success
- build success
- lint success

再 merge。

### 6.7 错误 handoff 文件位置

本 chat 结束时曾误新建：

```text
docs/JOB_RADAR_HANDOFF.md
```

用户指出正确位置应是已有：

```text
PROJECT_HANDOFF.md
```

正确做法：

- `PROJECT_HANDOFF.md` 是唯一 handoff。
- 错误 `docs/JOB_RADAR_HANDOFF.md` 应删除。
- 后续任何新 chat / agent 应只更新 `PROJECT_HANDOFF.md`，不要再创建第二份 handoff。

---

## 7. CV Tailoring 当前真实实现，不是真正 RAG

用户专门询问过：现在每次拿 JD 和事实母版比较时，到底有没有 RAG？

当前历史 CV analysis 主要是：

```text
JD
-> predefined requirement / alias detection
-> 从 private CV repo 读取整个 FACT_MASTER.md
-> 读取对应行业 template
-> 把 FACT_MASTER 按 project section 切开
-> 关键词 / alias overlap
-> 找候选 fact lines
-> covered / supported_gap / unsupported_gap
```

因此严格来说：**不是标准 embedding/vector RAG**。

它的主要问题是跨行业语义召回。

例如：

学术事实：

```text
confidence sets for model reliance / variable importance
```

可能对应统计概念：

- uncertainty quantification
- simultaneous inference
- variable importance inference
- model dependence

Tech JD 可能写：

- model interpretability
- robust feature importance
- uncertainty-aware model evaluation
- reliability of model explanations

Quant JD 可能写：

- signal robustness
- factor relevance
- model uncertainty
- sensitivity to model specification

这些词并不总是 literal synonym。

因此只继续增加 alias 表不够。

---

## 8. Hybrid RAG + capability ontology 的最终设计方向

用户认可的长期 pipeline：

```text
JD
-> Requirement extraction
-> Exact method / skill matching
   + Semantic embedding retrieval
   + Concept-graph expansion
-> Candidate atomic facts
-> Reranking
-> Factual verification
-> Translation confidence
-> CV recommendation
```

Rerank 至少考虑：

1. exact method overlap
2. statistical concept similarity
3. problem-solved similarity
4. industry functional similarity
5. evidence strength
6. prohibited overclaim constraints

**Embedding similarity 绝对不能单独决定“用户做过什么”。**

建议匹配等级：

- Direct Match
- Strong Transferable Match
- Adjacent Match
- No Evidence

重要语义：

```text
semantic similarity != factual support
transferable capability != industry experience
```

例如统计项目能支持“uncertainty in variable importance / model robustness”，不代表可以写“developed alpha signals”。

---

## 9. 一级证据、atomic facts 与 industry translation 的正确关系

用户另一个 chat 正在从原始 paper / supplement / thesis / proposal / code / project materials 重建 evidence，而不是继续依赖旧 FACT_MASTER 的二次总结。

证据优先级：

一级：

- paper / manuscript
- supplement
- thesis / dissertation materials
- proposal
- internship project documentation
- code / README 能直接证明实施内容的部分

二级：

- slides
- research notes
- project summary
- reviewer response

三级：

- FACT_MASTER
- CV bullet
- 过去聊天总结

三级资料可以帮助定位，但不能在一级/二级证据缺失时凭空创造新的 transferable capability。

最终每条 atomic fact 应拆成不同层：

```text
verified fact
exact methods/tools
statistical concepts
problems solved
transferable capabilities
industry translations
prohibited overclaims
source evidence
evidence strength
```

不要把这些压成一个“同义词列表”。

Concept graph 应区分：

- exact synonym
- statistical parent concept
- statistical child concept
- functional equivalent
- transferable industry interpretation
- adjacent concept

---

## 10. CV Knowledge Base 网站基础设施：第一版已完成

PR #53

Commit：`4e55da0b59fbae4a29af68efa16b625a595f9f16`

最终 CI：

- Python tests success
- app build success
- app lint success

网站新增 CV Knowledge Base 页面与 backend retrieval interface。

它约定从 private `XinyuIvy/CV` repo 读取：

```text
knowledge/FACT_INDEX.json
knowledge/CAPABILITY_ONTOLOGY.json
knowledge/INDUSTRY_TRANSLATION_MAP.json
```

Job Radar repo 中新增 schema 文档：

```text
docs/CV_KNOWLEDGE_SCHEMA.md
```

知识库页面目前可以显示：

- 结构化文件是否存在
- atomic fact count
- project count
- concept count
- transferable capability count
- 各行业 translation 数量
- 同步/ready 状态

并可以粘贴 JD 做 evidence retrieval 测试。

当前检索层会考虑：

- exact_methods
- statistical_concepts
- problems_solved
- transferable_capabilities
- domains
- industry_translation
- verified_fact
- evidence_strength
- prohibited_overclaims

重要：**真正 embedding/vector semantic RAG 还没实现。**

现在只是把 schema、UI、private repo reader、structured retrieval 先搭好。这样一级证据完成后可以接 semantic retrieval，不需要重新做页面。

如果三个 structured knowledge 文件还不存在，页面应 graceful fallback，不影响现有 FACT_MASTER CV 分析。

---

## 11. Evidence project 当前阶段

用户最后确认的状态：

- Stage 1 的盘点已经完成。
- GitHub evidence archive 主体已经完成。
- **Stage 1 归档完整性检查与补漏尚未完成。**
- **Stage 2 逐项目 Evidence Map 尚未开始。**

因此现在 evidence 工作的下一步不是 industry translation，也不是立刻开始 Stage 2。

应先真正完成 Stage 1 closure：

对每个 project 建 Stage 1 completion manifest，至少记录：

```text
Project
Primary evidence present?
Missing evidence?
Authoritative source(s)
Ready for Stage 2?
```

还要审计：

- paper
- supplement
- thesis
- proposal
- project documentation
- code evidence
- duplicate
- old version
- source unclear

补齐可以访问到的缺失材料，并明确 authoritative source。

只有 Ready for Stage 2 的项目才开始 Evidence Map。

推荐 Stage 2 顺序：

1. Semiparametric Confidence Sets
2. RESI Asymptotic Inference
3. Model Reliance / Variable Importance Confidence Sets
4. Pfizer internship
5. Multimodal / distance inference
6. EHR Readmission
7. 其他 collaborative / software projects

原因：如果 Evidence Map 在来源不完整时先做，后面发现 supplement / revision / proposal 后会导致 facts、capability ontology 和 industry translation 全部返工。

---

## 12. 还真正没有完成的工作

### P0 / 近期

1. **完成 evidence Stage 1 completeness audit + gap filling + completion manifest。**
2. Stage 2 逐项目建立 Evidence Map。
3. 从 Evidence Map 生成真正的 atomic facts。
4. 生成 private CV repo 中的：
   - `knowledge/FACT_INDEX.json`
   - `knowledge/CAPABILITY_ONTOLOGY.json`
   - `knowledge/INDUSTRY_TRANSLATION_MAP.json`
5. 用户人工审核关键事实和 prohibited overclaim。

### Job Radar / CV matching

6. 在现有 CV Knowledge Base 上加入真正的 semantic embedding/vector retrieval。
7. 加 concept-graph expansion。
8. 加 reranking。
9. 加 final factual verification / translation confidence。
10. 将 CV tailoring workflow 正式切换为 Hybrid RAG 优先，FACT_MASTER fallback。

### Optimistic workflow 第二阶段

11. 正常岗位“加入申请追踪”即时转 pending。
12. pending -> submitted 即时移动。
13. submitted -> interview 即时移动。
14. interview -> offer 即时移动。
15. 任意阶段 -> rejected / withdrawn 即时移动。
16. delete / rollback / undo 做一致的 optimistic interaction。

### 数据 / 隐私

17. public repo 的完整隐私审计还没有真正完成，尤其 Git history / 旧 PR diff 是否曾出现敏感文件仍需继续查。
18. 已做当前代码搜索：没有发现当前 `.xlsx` / `.csv` 直接存放，但不能把这等同于“历史从未提交过”。
19. Job Radar 实际 job/application 数据主要在 Site/Cloudflare D1，不是自动作为 Excel 或数据库文件存进 GitHub。
20. `CV_GITHUB_TOKEN` 当前是环境变量读取，不是硬编码值。
21. 后续应补强 `.gitignore`，防止 `.xlsx/.csv/.db/.sqlite/.env/cookies/session/credentials/private exports` 被误提交。
22. 如果历史中发现真实 token 或敏感文件，需要 history rewrite + token rotation；`.gitignore` 不能删除已有历史。

### 低优先级

23. “每个页面刷新本页”讨论过，但没有作为主功能实现。只有 optimistic/shared-state 后仍存在明确 stale-data 问题时再做。

---

## 13. 中国招聘平台与扫描系统的当前原则

旧 handoff 中有大量 BOSS / 中国多平台历史开发细节。下一 chat 需要知道的当前原则：

- 中国与美国扫描入口分开。
- 中国平台仍包含 BOSS、猎聘、牛客、公司官网等多源路线。
- BOSS 会出现环境限制 / `code: 37`，不能称为完全稳定的 API 接入。
- 已经实现部分结果保留，不应因为后续某个批次失败把前面成功结果全部丢掉。
- incomplete source 不应做 missing/expired reconciliation，避免误判历史岗位过期。
- 不尝试绕过验证码或平台安全限制。
- 工资过滤已经取消。
- 中国平台“0 条”可能是真 0，也可能是 source unavailable / rate limit / 页面不公开索引；这几种状态不能混为一谈。
- Job Radar 的当前产品优先级已转向日常求职 workflow + CV evidence matching，不要在没有用户明确要求时把所有时间重新投入 BOSS 抓取。

---

## 14. CV Tailoring 产品边界

当前 CV tailoring 主要用于分析：

- JD requirement
- 当前模板覆盖
- evidence support
- gap
- 推荐项目

不要未经用户要求重新加入：

- 自动改 CV 全文
- 自动 export
- 自动 LaTeX publish
- 自动 GitHub PR

用户之前明确把 tailoring 收缩为 analysis-oriented workflow。

---

## 15. GitHub / CI 工作方式

用户希望 agent 能直接操作 GitHub 时就不要反复让用户打开 Terminal。

标准流程：

```text
从 main 建 branch
-> 修改
-> PR
-> 查看 mergeability
-> 如果 CI 触发，检查 Python / lint / build
-> 失败时读具体 logs
-> 修复
-> 全绿后 merge
-> 告诉用户最终 main commit SHA
```

不要声称 tests/build 跑过，除非实际看到 workflow run。

PR #52 和 #53 最终都实际验证过三组 CI 全绿。

纯文档 PR 有时不会触发 Actions，届时应明确说“没有 workflow run”，不要虚构测试。

---

## 16. 下一 Chat 最建议的起点

下一 chat 应先读本文件：

```text
PROJECT_HANDOFF.md
```

然后根据用户当时目标选择：

### 如果继续 evidence project

第一步：完成 Stage 1 completeness audit + completion manifest，不要提前做 industry translation。

### 如果继续 Job Radar UX

第一步：继续把 application status transitions 改成 shared-state optimistic workflow，不要重新回到 full-page reload。

### 如果 evidence knowledge files 已经生成

第一步：核对它们是否符合 `docs/CV_KNOWLEDGE_SCHEMA.md`，先跑 structured retrieval test，再开始 embedding/vector RAG。

### 如果用户让 Site 同步

使用最新功能 commit SHA；文档-only handoff commit 一般不需要为了页面功能单独同步。

---

## 17. 不要重新打开的已解决问题

除非用户报告 regression，否则不要把以下事项重新列为未完成：

- 工资筛选删除
- hard requirement 不进入偏好学习
- navigation state persistence
- Chrome save 直接进 pending
- rapid saves 独立 popup
- pending live insertion
- pending 正式 list 第一个位置
- pending summary count live update
- 收藏后的即时 card hide 第一阶段
- 人工通过核验后取消 full-page reload
- CV Knowledge Base 页面与 structured retrieval infrastructure

真正未完成的是：证据内容本身、Hybrid semantic RAG、剩余 optimistic workflow，以及 public repo 历史隐私审计。
