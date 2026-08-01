# Ivy Job Radar 项目交接与持续进度记录

> 最后更新：2026-08-01 14:42（America/New_York）  
> 仓库：`XinyuIvy/ivy-job-radar`（private）  
> 生产分支：`main`  
> 当前开发分支：无；`agent/china-multisource` 已通过 PR #2 合并  
> 最近完成：[PR #2 - Add multi-source China job collection](https://github.com/XinyuIvy/ivy-job-radar/pull/2)，squash merge commit `7443f4fe7b45785638aed8baff8a6fd42bf796be`

## 0. 给下一位 Chat 的最短说明

这是一个面向用户本人求职的 **US + China 多来源职位发现、核验、去重、追踪和申请管理系统**。它不是一个已经成熟、覆盖所有招聘平台的产品；覆盖率和稳定性仍在开发中。

当前最重要的状态是：

1. `main` 上已经有完整网站、D1 持久化、申请管理、公司研究、质量监控、导出和每日 GitHub Actions 扫描框架。
2. 美国公开招聘源、公开 ATS、公司官网、聚合数据源已进入生产流水线，但公司官网成功率仍低，最近一次健康状态为 `warning`。
3. 中国公开索引在最近一次生产扫描中命中 0 条，主要缺口是 BOSS、猎聘、智联、51job、拉勾等受保护平台无法稳定进行云端无人值守采集。
4. PR #2 已于 2026-08-01 squash merge 到 `main`，merge commit 为 `7443f4fe7b45785638aed8baff8a6fd42bf796be`；生产 run `30711130632` 已验证全部采集、合并、health、artifact 和 snapshot push，但网站 `/api/jobs/import` 对约 9.4 MB 单次 payload 连续返回 HTTP 500，因此网站职位尚未完成本轮回写。
5. BOSS 真实页面链路已验证：能保存职位名、公司、地点、独立详情 URL；最初 JD 正文截断问题已修复。测试岗位“高级生物统计师（上海）”被排除是正确行为，因为系统面向应届/早期职业岗位并排除“高级”。
6. 本地书签保存的 JSON 不会自动上传 GitHub。它只有经过隐私检查、复制到 `data/imports/china/` 并提交后，GitHub Actions 才能看到。
7. 第二次生产 run `30712239542` 已验证固定 40 条分批：前 3 批共 120 条成功，第 4 批失败。根因是 Figma 一条记录的 `application_id` 正则误捕获约 1.35 MB 嵌入式岗位 JSON，并重复进入 `evidence`，令单条记录约 3.2 MB、第 4 批约 4.6 MB。下一步是修正 ID 提取并增加按字节切批/超大单条防护，再新开 run 验证。

任何新 Chat 开始工作前，应先读取本文件、`docs/INTEGRATION_LOG.md`、`docs/job-collection.md`、PR #2 描述以及最新 `data/scans/*summary*.json`，再核对 GitHub 当前状态。本文件中的数字是时间截面，不可替代实时核对。

---

## 1. 用户目标和硬性筛选边界

### 1.1 搜索范围

| 地区 | 领域 | 主要岗位 |
|---|---|---|
| 美国 | Tech | Data Scientist / Machine Learning；排除以 GenAI、LLM、NLP 为核心的岗位 |
| 美国 | Finance | Quantitative Researcher / Quantitative Analyst |
| 美国 | Pharma | Biostatistician / Statistical Scientist，以及相关 RWE、流行病学、HEOR 岗位 |
| 美国 | Consulting | Healthcare / Life Sciences Consulting |
| 中国 | Tech | 数据科学家、机器学习科学家、应用科学家等；排除大模型/NLP 为核心岗位 |
| 中国 | Finance | 量化研究、定量研究、量化分析 |
| 中国 | Pharma | 生物统计、医学统计、临床统计、统计科学、RWE、流行病学、卫生经济 |
| 中国 | Consulting | 医疗咨询、医药咨询、生命科学咨询 |

### 1.2 候选人阶段

- 用户是 Biostatistics PhD candidate / fresh PhD 目标人群。
- 优先：明确 new graduate、campus、博士通道、无毕业后最低经验要求的岗位。
- Stretch：允许 0–3 年经验岗位，但必须单独标记，不可与真正 entry-level 混为一谈。
- 排除：intern、postdoc、senior、staff、principal、lead、manager、director、head、总监、经理、负责人、专家、架构师、高级、资深等明显不属于应届范围的标题。
- 美国岗位：明确不支持 sponsorship 的岗位不能进入可申请列表；支持情况不明确时必须标为待核验，不能擅自当作支持。
- 中国岗位：sponsorship 不适用，但仍需核验学历和经验要求。

### 1.3 数据真实性规则

- 每条记录必须尽量指向 **具体职位页面或带日期的可信职位存档**，不能只放 role-family 页面或泛招聘首页。
- 必须尽量保存完整 JD 原文，而不是只保存拆分后的关键词。
- 关键词数据库允许纳入近三年已经 filled/closed/expired 的真实具体 JD，用于 CV/ATS 关键词研究。
- Live Job Radar 只应展示当前开放或待官网核验的职位。
- leads、graduate program 页面、员工 profile、公司人才库页面可以作为线索，但不能计入 verified JD 数量。
- 去重优先使用 requisition/application ID 和 canonical URL；仅凭相似标题不能贸然合并。
- 数据源失败必须显式记录，不能把“请求失败”伪装成“成功扫描 0 条”。

---

## 2. 项目架构和两套自动化

项目中存在两套不同的“每日 6 点”机制，之前容易被混淆：

1. **ChatGPT Automation**：负责在 ChatGPT 内执行每日岗位搜索/提醒。2026-08-01 纽约时间约 06:05 有运行证据。
2. **GitHub Actions**：负责实际运行仓库中的扫描脚本、生成快照、回写网站并提交最新扫描文件。工作流计划在纽约时间约 06:07 运行，通过两个 UTC cron 加纽约时区 guard 处理夏令时。

ChatGPT 任务运行成功，不代表网站已经更新。网站刷新必须依赖 GitHub Actions 完成采集、合并和 API import。

### 2.1 网站和持久化

- 前端/服务端：React/Vinext，部署在 ChatGPT Sites。
- 线上地址：`https://ivy-job-radar.rourou1199.chatgpt.site`
- 持久化：Cloudflare D1。
- 网站导入 API：`/api/jobs/import`。
- 状态 API：`/api/scan-status`。
- 网站手动 refresh 会先扫描部分官方 ATS，再尝试通过 `GITHUB_WORKFLOW_TOKEN` dispatch GitHub Actions。
- GitHub Actions 回写网站依赖：
  - `IVY_JOB_RADAR_SYNC_TOKEN`
  - `SITES_SIWC_BYPASS_TOKEN`
- 目前无法从仓库内容证明这两个 secrets 已正确配置；PR #2 合并后必须通过手动 workflow dispatch 实测。

### 2.2 每日全局流水线

PR #2 中的目标顺序：

1. 检查是否为纽约时间 06:00 或手动触发。
2. 标记网站扫描为 running（若凭据可用）。
3. checkout、安装 Python 依赖。
4. Python syntax validation。
5. 运行全部 Python fixture/unit tests。
6. 美国 JobSpy 来源采集。
7. 美国候选职位公司官网核验。
8. 中国公开索引采集。
9. 导入已提交的中国浏览器快照。
10. 可选运行智联 Apify 付费源。
11. 合并所有中国来源。
12. 运行 credential-free cloud sources。
13. 运行 Job Board Aggregator。
14. 在官方 ATS 页面核验 Aggregator 候选。
15. 扫描 company pool 中所有公司官网/ATS。
16. 全局 canonicalize、去重、保留暂时消失职位、清理 stale、写 run receipt。
17. 写 scan health 和异常历史。
18. 通过 API 回写网站。
19. 发布 completed 状态。
20. 上传扫描 artifact，并把生成快照 rebase/push 回 `main`。

PR #2 已把“缺少网站同步凭据时静默跳过并显示成功”改为显式失败。

---

## 3. `main` 上已经完成的功能

### 3.1 已进入生产流水线的公开来源

- JobSpy：LinkedIn、Indeed、Google Jobs、Glassdoor、ZipRecruiter。
- Credential-free sources：RemoteOK、Remotive、Jobicy、Himalayas、Arbeitnow、We Work Remotely。
- The Muse public jobs API。
- Feashliaa Job Board Aggregator 的日更 ATS 数据集；保留 CC BY-NC attribution。
- 动态 company-pool 官网/ATS scanner。
- Common Crawl：仅作为有界的公司官网/ATS 发现 fallback，不做无限抓取。

### 3.2 已实现的 ATS/公司招聘系统适配

已集成：

- Greenhouse、Lever、Ashby、BambooHR、Workday
- SmartRecruiters、Workable、Teamtailor、Recruitee
- Breezy、Rippling、Pinpoint、Personio、JibeApply
- Oracle Recruiting Cloud
- iCIMS、Paylocity、Jobvite
- JazzHR、Gem
- 通用 schema.org `JobPosting` / JSON-LD / 有界职位链接解析

部分集成、仍需更多生产证据或 tenant 配置：

- Comeet
- Taleo、SAP SuccessFactors
- Dayforce、UKG/UltiPro、ADP Recruiting

### 3.3 数据工程和质量控制

- 多来源统一 normalization。
- canonical URL + application/requisition ID 去重。
- 对相同岗位优先保留完整 JD 和更高质量来源。
- 保存来源 provenance。
- stale-job policy：暂时消失的岗位先保留，默认 14 天后才清理。
- ghost/repost/legitimacy 辅助检测。
- required vs preferred skill extraction。
- 缺失学历、经验、sponsorship、技能、地点证据时扣分或标记不确定性。
- end-to-end run receipt：fetched、verified/open、rejected、deduplicated、imported、new、retained、stale-pruned、failed sources。
- scan health、异常历史、来源失败原因监控。
- 网站打开后会启动后台数据质量 remediation；只有真正无法自动解决的记录才进入人工例外队列。

### 3.4 网站端已完成的求职管理功能

- Job Radar 搜索、过滤、排序和渐进式 20 条加载。
- Saved / ignored jobs。
- Application Progress 和申请状态历史。
- 申请 funnel analytics、按来源的面试率/offer 率。
- Application deadlines、planned application date、tasks、reminders。
- Interview round、时间、形式、联系人、notes、outcome、thank-you 和 follow-up。
- Company Research：职位、申请、面试、联系人、公司官网/招聘页、研究笔记和面经。
- Recruiter、hiring manager、alumni、referral、interviewer 联系人管理；已并入具体 application，不再单独做 Contacts 顶级页面。
- Interview Preparation；已并入 Company Research。
- Calendar；已并入 Application Progress。
- Job Verification + Data Quality 合并界面。
- Browser notification center，保留最近 20 条扫描完成/失败通知。
- 完整导出：CSV ZIP、Excel、JSON、SQLite；CV 文件字节不导出。

### 3.5 已明确不做或不再做

- 地图、热力图和完整地理标准化已于 2026-07-31 明确移出范围。
- 非 US/China、freelance-first、UK-only、其他国家和 internship-first 来源不算当前未完成项，例如 Upwork、Reed、Naukri、BDJobs、Bayt、Internshala。
- CareerJet 需要 affiliate 关系，因此不作为当前免费来源。

---

## 4. 最近一次生产扫描基线（run 30711130632，2026-08-01）

本轮扫描与快照生成成功，但网站导入失败；因此以下是仓库快照基线，不代表网站已完成回写。数据来自 `data/scans/run_receipt_latest.json`、`scan_health_latest.json` 和 `company_portal_summary.json`：

| 指标 | 数值 |
|---|---:|
| fetched | 346 |
| verified/open | 118 |
| rejected | 10 |
| deduplicated | 16 |
| imported（待网站回写） | 336 |
| new | 72 |
| updated/unchanged | 248 |
| temporarily retained | 16 |
| stale pruned | 0 |
| failed sources | 174 |
| company pool | 350 |
| company portals attempted | 350 |
| company portals succeeded | 176 |
| company success rate | 50.3% |
| company portal jobs scanned | 12,925 |
| company portal jobs matched | 82 |
| China indexed jobs matched | 0 |

健康状态仍为 `warning`。美国公司门户成功 148/176；中国公司门户仅成功 28/171，且中国公开索引命中 0，仍是主要覆盖缺口。公司池从此前 176 扩至 350，整体成功数和职位命中显著增加，但 `attempted 350/350` 仍不能表述为全部成功覆盖。

本轮来源计数：

- `us_jobs_verified_latest.json`: 14
- `china_jobs_latest.json`: 0
- `cloud_sources_jobs_latest.json`: 0
- `aggregator_jobs_verified_latest.json`: 250
- `company_portal_jobs_latest.json`: 82

生产 run `30711130632` 的唯一失败步骤是 `Sync jobs to Ivy Job Radar`。两个同步 secrets 均存在且有效：workflow 成功把网站状态改为 `running`，失败后也成功改为 `failed`。失败请求把约 9.4 MB 的 `all_jobs_latest.json` 一次性 POST 到 `/api/jobs/import`；站点约 39 秒后返回 HTTP 500，curl 三次重试仍失败。artifact `global-jobscan-30711130632`（ID `8822107906`）已保留，扫描快照已安全 rebase/push 到 `main` commit `6b95f49...`。

---

## 5. 中国平台采集：已完成、验证结果和准确边界

### 5.1 为什么不能只用一个爬虫

- BOSS 对内部搜索 API 返回 `code 37`，CDP/自动控制浏览器会被退回城市首页或触发环境校验。
- 猎聘、智联、51job、拉勾等平台也存在登录、风控、动态页面或正文不可公开获取的问题。
- 搜索引擎公开索引可用于发现 URL，但通常拿不到完整 JD；2026-07-31 的标题过滤也导致 70 条公开索引结果全部不匹配。
- 因此采用多路线：云端公开来源 + 用户当前可见页面书签 + 浏览器扩展快照 + 可选付费 API。

### 5.2 PR #2 已实现的中国多来源框架

- 通用快照 importer：JSON、JSONL、NDJSON、CSV、TSV。
- 兼容常见字段：`jobName`、`jobTitle`、`companyName`、`jobUrl`、`jobDescription`、`cityName`，以及 `jobs/items/records/results/data/list` 嵌套容器。
- 本地 JD inbox：默认监听 `127.0.0.1:8787`。
- 一键书签：读取当前可见职位页面的职位名、公司、地点、正文、URL、host 和时间。
- BOSS 专用 selector：只读取右侧当前选中的 `.job-detail-box`，从当前卡片补齐稳定 `/job_detail/...` URL。
- 拒绝书签安装页、BOSS 搜索页 URL、无完整详情、明显截断正文。
- 导入汇总提供明确排除原因，例如 `excluded_title:高级`。
- 中国来源合并器：按 canonical URL/identity 去重，优先保留更完整 JD，合并 sources 和 skills。
- 可选智联 Apify adapter；默认严格关闭。
- 每日 workflow 中已加入 committed snapshots 导入、可选 Apify 和中国来源 merge。

### 5.3 已完成的真实 BOSS 测试

用户在 Mac 普通 Chrome 中测试了：

- 岗位：`高级生物统计师（上海） (MJ013354)`
- 公司：`恒瑞医药`
- 地点：`上海·浦东新区·张江`
- 独立 URL：`https://www.zhipin.com/job_detail/61ae7765cc0e1fec03N629W5FlpZ.html`

结果：

- Bookmarklet → localhost inbox → JSON 保存成功。
- title、company、location、稳定 job URL 提取正确。
- 用户保存了两次，同一岗位产生两份 JSON；导入器按 canonical URL 去重逻辑已有测试。
- `matched_jobs: 0` 是正确结果，因为 `EXCLUDED_TITLE` 包含“高级”，不符合 fresh-PhD/entry-level 范围。
- 初版 JD 截断在“规划和”；已修复为读取全部详情段落，并增加截断拒绝测试。
- 合格 fixture“生物统计师”已在 CI 中断言 `matched_jobs: 1`，因此不需要用户继续在 BOSS 碰运气找普通职位做单元验证。

### 5.4 本地书签的安全和操作边界

- 书签只读取当前可见页面，不应读取 cookie、消息、简历或登录凭据。
- Inbox 在用户 Mac 本地；GitHub Actions 无法读取 `~/.ivy-job-radar/inbox` 或 `/tmp/...`。
- 要进入云端：先检查 JSON 不含 cookie、账号 ID、招聘者聊天、简历和其他个人信息，再复制到 `data/imports/china/` 并 commit/push。
- 目前没有“Mac 自动上传 inbox 到 GitHub”的安全自动化；这是明确未完成项。

---

## 6. 各中国平台/工具当前状态

| 来源/平台 | 当前路线 | 状态 | 尚缺什么 |
|---|---|---|---|
| 中国公司官网、公开 ATS、Moka、飞书招聘 | Cloud automatic | 已在生产主路线 | 继续提高 tenant 识别和成功率；大量中国公司当前返回 HTTP 202 或无公开结构 |
| BOSS直聘 | 用户在可见详情页点击 bookmarklet | PR #2 中 production fallback；真实传输已验证 | 合并后验证完整 JD 的生产导入；本地 JSON 仍需人工提交 |
| 猎聘 | 公开索引 + bookmarklet | Fallback 已写，未做真实页面字段验收 | 每个平台至少取 1 条真实 JD 验证 selector/正文完整性 |
| 智联招聘 | 公开索引 + bookmarklet | Fallback 已写，未做真实页面字段验收 | 同上 |
| 前程无忧 51job | 公开索引 + bookmarklet | Fallback 已写，未做真实页面字段验收 | 同上 |
| 拉勾 | 公开索引 + bookmarklet | Fallback 已写，未做真实页面字段验收 | 同上 |
| 就业在线 | bookmarklet | Fallback 已写，未做真实页面字段验收 | 同上 |
| 牛客、国聘、应届生 | 公开索引发现 | 只有 URL discovery | 若需要完整 JD，需增加专用公开 adapter 或可见页面捕获 |
| 职位猎人 `lastsunday/job-hunting` | 浏览器扩展 export → importer | Importer 已兼容常见 JSON/CSV 结构，`ready-for-user-test` | 在用户 Mac 安装/导出一次真实备份，核对实际 schema 和是否包含敏感字段 |
| `mcp-jobs` 1.4.0 | 本地 Playwright 实验 | `limited`，不能当五平台采集器 | 发布包只有猎聘和移动版 BOSS 规则；拉勾/智联/51job 只有 URL 条目、没有解析配置 |
| Apify Zhaopin Actor | Cloud paid API | Adapter 已写，默认禁用 | 只有用户明确批准费用并设置 spending cap、`APIFY_ZHAOPIN_ENABLED=true`、`APIFY_TOKEN` 后才启用；workflow 单次上限 25 |
| 搜索引擎公开索引 | Cloud | 已接入发现流程 | 结果标题/正文质量不稳定；不能当完整 JD 主来源 |

---

## 7. GitHub 分支和 PR 状态

### 7.1 `main`

- PR #2 merge commit：`7443f4fe7b45785638aed8baff8a6fd42bf796be`；生产扫描快照已由 run `30711130632` push 到 commit `6b95f49...`（本次 handoff 更新后 HEAD 会继续变化）。
- 包含网站、生产扫描框架、2026-07-31 快照，以及 PR #2 的中国多来源采集代码。
- 下一状态门槛：将约 9.4 MB 的网站导入拆成小批次，重新验证 `/api/jobs/import`、completed 状态和网站实际数据。

### 7.2 PR #1：失败/停止路线

- URL：https://github.com/XinyuIvy/ivy-job-radar/pull/1
- 分支：`agent/boss-rendered-page`
- 状态：Open Draft，未合并。
- 尝试通过 dedicated Chrome + CDP 读取 rendered BOSS 页面。
- 实际受 BOSS 风控/重定向影响，未完成用户验收。
- **不要合并、不要安装旧 schedule、不要继续运行旧 BOSS 自动爬虫**，除非未来有明确理由重新开启实验。

### 7.3 PR #2：当前主线

- URL：https://github.com/XinyuIvy/ivy-job-radar/pull/2
- 分支：`agent/china-multisource`
- 最终 HEAD：`81b47e9392d9e7a7e0b47c529a3b9be7390fbad0`。
- 状态：Merged；2026-08-01 squash merge 到 `main`，merge commit `7443f4fe7b45785638aed8baff8a6fd42bf796be`。
- 最终 CI：`PR Python tests` run `30710568256` 成功；依赖安装、Python syntax validation、全部 unit tests 均为 success。
- 合并前 diff 复核未发现阻塞问题；付费 Apify 保持默认关闭，PR #1 的失败路线未混入。
- 主要提交节点：
  - `f6bd073`：BOSS bookmarklet selector 和无效页面拒绝。
  - `72566583...`：完整 JD/截断检查和排除原因统计。
  - `0517e80...`：增加 PR CI，并将 PR 推进到 Ready for review。
- PR #2 不依赖 PR #1，也未携带 PR #1 的旧 BOSS rendered-page 改动。

---

## 8. 还没有完成的工作：按优先级排序

### P0：使 PR #2 真正进入生产

当前进度：第 1–4、7 项已完成；第 6 项完成仓库侧核对；第 5 项仍在修复验证。run `30712239542` 从 `main` commit `de8ad77...` 启动，所有采集、核验、公司池、canonicalize、health、artifact 和 snapshot push 均成功。网站同步前 3 批共 120 条成功，第 4 批约 4.6 MB 连续 HTTP 500。artifact ID `8822434861`；扫描快照 commit `0694474...`。失败批次包含一条约 3.2 MB 的异常 Figma 记录：`application_id` 正则误捕获了约 1.35 MB 的嵌入式岗位 JSON，并再次拼入 `evidence`。

1. [x] 复核 PR #2 当前 diff 和 CI 后合并到 `main`。Merge commit：`7443f4fe7b45785638aed8baff8a6fd42bf796be`。
2. [x] 从 `main` 手动 dispatch `.github/workflows/daily-us-jobscan.yml`。run：`30711130632`。
3. [x] 观察每一步，包括中国快照导入、来源 merge、公司池扫描、canonicalize 和 health；这些步骤全部成功。
4. [x] 验证 `IVY_JOB_RADAR_SYNC_TOKEN` 与 `SITES_SIWC_BYPASS_TOKEN`；两个 secret 均存在且能写入 scan status。
5. [fix in progress] `/api/jobs/import` 首轮 9.4 MB 单次导入失败；第二轮固定 40 条分批时前 3 批成功、第 4 批因异常超大 Figma 记录失败。需要修正 application ID 提取，并把批次限制从仅记录数升级为“记录数 + JSON 字节数”。
6. [partial] artifact、receipt、health、中国 summary 和仓库快照已核对；网站职位仍需在修复后核对。
7. [x] 两轮生成快照均安全 rebase/push 回 `main`；最新 commit `0694474...`，最新 artifact ID `8822434861` 保留至 2026-08-31。

下一步执行顺序：

1. [x] 修改 daily workflow，把职位数组切成每批 40 条后逐批 POST；每批保持可重试、失败即停止。
2. [x] 新增 3 个分批测试，并完成 Python 编译、单元测试和 YAML 解析。
3. [x] 修复已直接提交到 `main`：脚本 `1b634902...`、测试 `3782d461...`、workflow `8a455438...`。
4. [x] 新开 production run `30712239542`；固定条数分批得到真实验证，前 3 批成功，第 4 批失败。
5. [next] 修正 `extract_application_id` 的无界捕获，增加按字节切批与异常单条测试。
6. 从修复后的最新 `main` 再新开 production workflow；不要 rerun旧 run。
7. 核对网站 scan status 为 `completed`、created/updated/skipped 和网站岗位总数，再关闭 P0。

### P1：中国来源实际覆盖

1. 用猎聘、智联、51job、拉勾、就业在线各 1 条真实可见职位测试 bookmarklet 字段和完整 JD。
2. 安装/运行一次“职位猎人”扩展导出，核对真实 JSON/CSV schema。
3. 设计安全的本地 inbox → 仓库导入流程；在没有明确隐私/提交策略前不要自动上传。
4. 改善中国公司官网/ATS 对 HTTP 202、动态 JS、Moka/飞书 tenant 的识别和日志。
5. 公开索引继续只做 discovery，不要把搜索结果页正文当完整 JD。

### P1：生产可靠性

1. [x] 2026-08-01 已跑 350-company 生产扫描：整体成功 176/350；美国 148/176，中国 28/171。alias/seeds 确实扩大命中，但中国成功率仍低。
2. 对 HTTP 202、timeout、403、404、unidentified 做分类 remediation，不要把全部失败简单重试。
3. [x] run `30711130632` 已取得完整日志：约 9.4 MB 单次 POST 到 `/api/jobs/import`，约 39 秒后连续 HTTP 500；不是 secrets 缺失。
4. 确认 ChatGPT Automation 和 GitHub schedule 都按预期运行，并在用户界面上清楚区分。

### P2：尚未接入的外部来源/平台能力

- API-key 来源：Adzuna、Jooble、USAJobs、Exa。当前 blocked，需先确认相关性和配置 secrets。
- Wellfound：登录保护，当前不属于云端自动采集。
- Comeet：仅在公开 company UID/token 可得时走 API，否则为公共页面 fallback；缺生产证据。
- Taleo、SuccessFactors、Dayforce、UKG、ADP：可检测公共 portal，但官方结构化 API 通常需要 tenant 配置或认证。
- 自动外部联系人发现：planned。
- Email reply classification：planned。
- Email、Telegram 或 ChatGPT 扫描完成通知：planned；需先选渠道并授权/配置凭据。
- 自动持续抓取面经：partial；现有 15 条 source-linked 摘要来自 Glassdoor、Reddit、一亩三分地、牛客，仍需自动刷新策略。

### P2：文档/产品清理

- 根 `README.md` 仍主要是 vinext starter 文档，没有准确介绍 Ivy Job Radar，应重写。
- 本交接文件应在每次重要变更后更新日期、PR/commit、生产基线、平台状态和下一步。
- 项目可在 Tech CV 的 Engineering Projects 中描述为个人 build，但不要写成正式 research 或成熟生产产品；应保留“coverage and reliability remain under active development”的边界。

---

## 9. 关键文件索引

### 生产和架构

- `.github/workflows/daily-us-jobscan.yml`：每日全局扫描和网站同步。
- `app/api/jobs/route.ts`：网站职位 API、部分官方 ATS refresh、GitHub workflow dispatch。
- `app/api/jobs/import/route.ts`：GitHub Actions 合并结果导入网站。
- `app/api/scan-status/route.ts`：扫描状态。
- `app/job-radar.tsx`：主要 UI。
- `db/schema.ts`：D1 schema。

### 扫描与合并

- `scripts/jobspy_scan.py`
- `scripts/verify_company_jobs.py`
- `scripts/china_scan.py`
- `scripts/cloud_sources_scan.py`
- `scripts/aggregator_scan.py`
- `scripts/verify_aggregator_jobs.py`
- `scripts/company_portal_scan.py`
- `scripts/merge_scan_results.py`
- `scripts/scan_health.py`

### PR #2 新增

- `docs/china-multisource-collection.md`
- `config/china_source_routes.json`
- `local-collector/bookmarklets.html`
- `local-collector/jd_inbox_server.py`
- `scripts/china_snapshot_import.py`
- `scripts/merge_china_sources.py`
- `scripts/apify_zhaopin_scan.py`
- `data/imports/china/README.md`
- `.github/workflows/pr-python-tests.yml`
- `tests/test_china_snapshot_import.py`
- `tests/test_jd_inbox_server.py`
- `tests/test_merge_china_sources.py`

### 审计和运行结果

- `docs/INTEGRATION_LOG.md`：最完整的来源/能力接入审计。
- `docs/job-collection.md`：采集流水线说明。
- `data/scans/run_receipt_latest.json`
- `data/scans/scan_health_latest.json`
- `data/scans/company_portal_summary.json`
- `data/scans/china_scan_summary.json`
- `data/scans/*_latest.json`：各来源最新快照。

---

## 10. 常用操作命令

### 在用户 Mac 更新 PR #2 分支

```bash
cd /Users/ivyzhang/Documents/Development_Projects/ivy-job-radar
git status --short
git fetch origin
git switch agent/china-multisource
git pull --ff-only
git log -1 --oneline
```

### 启动本地 JD inbox

```bash
python3 local-collector/jd_inbox_server.py
```

或指定测试目录：

```bash
mkdir -p /tmp/ivy-jd-test
python3 local-collector/jd_inbox_server.py --inbox /tmp/ivy-jd-test
```

### 打开书签安装页

```bash
open local-collector/bookmarklets.html
```

更新代码后，旧 Chrome 书签不会自动更新；需要删除旧书签并重新拖入“保存当前 JD”。

### 导入和检查本地快照

```bash
python3 scripts/china_snapshot_import.py /tmp/ivy-jd-test
python3 -m json.tool data/scans/china_local_import_summary.json
python3 scripts/merge_china_sources.py
```

### 查看本地 JSON

```bash
for file in /tmp/ivy-jd-test/*.json; do
  echo "FILE: $file"
  python3 -m json.tool "$file"
done
```

### 付费智联路线

不要默认运行。只有用户明确批准费用后：

```bash
export APIFY_ZHAOPIN_ENABLED=true
export APIFY_TOKEN='your-token'
python3 scripts/apify_zhaopin_scan.py --max-results 25
```

---

## 11. 已踩过的坑和不应重复的错误

- 不要把 `matched_jobs: 0` 自动判断为采集失败；必须查看 `raw_rows`、`excluded_reasons` 和具体字段。
- 不要为了让测试变成 1 而放宽 fresh-PhD 排除规则。“高级生物统计师”应当排除。
- 不要在 bookmarklet 安装页点击“保存当前 JD”；新版已拒绝此类页面。
- 不要保存 BOSS 左侧列表/整个搜索结果页；应捕获右侧当前详情和稳定 job detail URL。
- 不要仅用 20 字长度判断 JD 完整；已增加明显截断检测，但仍应继续测试不同平台。
- 不要声称 BOSS 已全自动接入。它当前是用户触发的 manual fallback。
- 不要声称 PR #2 已完整上线。采集与快照已进入生产，但只有网站分批回写成功后才算端到端生产接入。
- 不要把 ChatGPT 每日任务成功等同于 GitHub Actions/网站同步成功。
- 不要把 `mcp-jobs` 说成五平台采集器；1.4.0 发布内容不支持这个结论。
- 不要未经用户批准启用 Apify 付费源。
- 不要提交包含 cookies、账号标识、招聘者聊天、简历或其他个人数据的浏览器快照。
- 不要把 `attempted` 当作 `succeeded`；公司官网最近只成功 66/176。
- 不要合并 PR #1 或运行旧 BOSS rendered-page 自动爬虫。

---

## 12. 下一位 Chat 的建议开场动作

按下面顺序执行并向用户汇报真实状态：

1. 读取本文件。
2. 在 GitHub 核对 `main`、PR #1、PR #2、最新 workflow run 和最新 commit；不要假定本文状态仍最新。
3. 如果 PR #2 仍未合并：检查 changed files、CI、mergeability，确认无新冲突，然后推进合并。
4. 合并后立刻从 `main` 手动 dispatch daily workflow。
5. 追踪到 terminal state；如果失败，读取具体 job step/log，不要只看红叉。
6. 检查 website sync secrets、API import、run receipt、health 和网站数据是否一致。
7. 将结果和新的 commit/run/PR 状态更新回本文件。

### 交接文件维护规则

每次更新至少修改：

- 顶部“最后更新”日期。
- 当前 `main` SHA、开发分支 SHA、PR 状态。
- 最近一次生产 run 的核心数字。
- 已完成/未完成边界。
- 新接入或被否决的平台/能力。
- 下一步优先级。

不要只追加流水账；如果旧状态已经失效，应同步修改相关章节，保持本文能直接代表当前事实。
