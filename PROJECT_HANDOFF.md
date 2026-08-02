<!-- LATEST-HANDOFF-2026-08-02 -->

# Ivy Job Radar 最新交接（2026-08-02，转入下一 Chat）

> 本节记录 2026-08-01 至 2026-08-02 这轮连续开发的最新真实状态。  
> **若本节与下方旧版交接存在冲突，以本节为准。**  
> 仓库：`XinyuIvy/ivy-job-radar`（private）  
> 网站：`https://ivy-job-radar.rourou1199.chatgpt.site`  
> 用户 Mac 仓库：`/Users/ivyzhang/Documents/Development_Projects/ivy-job-radar`  
> 本节写入前的 `main`：`137b176fd04c9fc73aaf492bf0152dfed3f4dbdd`（PR #24）

## A. 下一 Chat 必须先知道的结论

1. 当前工作的唯一优先级是 **中国招聘平台稳定接入**，先解决 BOSS，再完善其他中国平台。用户已经明确：**美国平台暂时不继续扩充**。
2. 用户希望后续由 agent 连续完成 GitHub 修改、Actions 测试、artifact/日志抽查、PR 审查和合并，以及通过网站触发 Mac 实采；不要频繁让用户运行 Terminal。
3. GitHub 权限已经足够，不需要用户提供 GitHub 密码、PAT、验证码或 Mac 管理员密码。
4. Mac 已安装网站控制的中国扫描监听器，并完成最后一次人工升级。安装成功原文为：`Manual website-controlled China scanning is installed and waiting.`
5. PR #21 已让监听器在网站任务真正排队后自动执行安全的 `git pull --ff-only`，加载最新版 `main`；若监听器自身更新，会在领取任务前重启。因此后续常规代码修复合并后，Mac 应在下一次网站任务时自动更新，不再要求用户手工 pull/install。
6. 该本地执行通道是受限的，只运行仓库预定义的更新和中国扫描任务，不开放任意远程 shell。agent 不能随意控制用户整台 Mac Terminal。
7. 用户已在 Cloud Browser 登录 Job Radar，并在 Mac BOSS 会话中重新登录；但新的 Chat/浏览器会话是否仍保留登录态必须以现场页面为准。不要让用户发送密码或验证码。
8. **最新产品决定：取消工资作为自动筛选条件。** 工资字段可以保留、展示和标记待核验，但低于 20K、日薪、月薪缺失或补贴表达都不能再单独导致岗位被排除。
9. 关闭 PR #25 只阻止了新的薪资解析器进入 `main`，但 `main` 早先已经通过 PR #14、#20、#22 写入“20K 工资门槛”和部分日薪低薪过滤。因此“取消工资筛选”**尚未真正实现**，是下一 Chat 的第一个 P0 代码任务。
10. 用户没有取消岗位相关性、具体职位页真实性、陈旧页面、经验年限、核心职业方向等非薪资规则。兼职岗位是否保留应根据岗位类型/用户目标另行判断，不能仅因工资形式是兼职或日薪而排除。
11. 当前系统尚不能宣称 BOSS“稳定接入”：一次真实端到端扫描完成公开平台和 174 家中国公司官网，共新增 7 个岗位，但 BOSS 在第 4 组查询再次返回 `code: 37`。重新登录并未消除此环境/接口限制。
12. PR #24 已把 BOSS 失败从“整源作废”改为“保留前面已完成组的部分结果”：本次已采到约 30 条 BOSS 列表结果可继续筛选/同步；部分批次会标为 incomplete，不执行缺失/过期对账，下次完整重试时仍需重新纳入 seen URL，避免历史岗位误过期。
13. GitHub Actions 可以验证 BOSS 公开索引、fixtures、过滤规则和八平台 smoke scan，但不能验证用户 Mac 的已登录 BOSS 会话。两者必须分开表述。
14. 目前唯一开放 PR 是早期 draft PR #1（rendered BOSS pages）。它基于旧架构、提交很多、已被后续网站控制/部分结果保护路线取代，**不要直接合并**；先比较当前 `main`，确认是否还有可复用代码，再关闭或摘取极小部分。
15. PR #25 已关闭且未合并；PR #23 也已被替代/关闭。不要恢复薪资解析工作。

## B. 本轮已经完成并合并的主要工作

### B1. 区域扫描与网站进度

- 美国和中国扫描入口已拆开，按钮为“更新美国岗位”和“更新中国岗位”。
- 中国扫描状态已统一展示实时阶段、进度、已发现/已保留/待核验/排除数和明确失败原因。
- 旧的 BOSS 自动定时扫描已禁用，避免与网站触发冲突。
- 网站创建中国扫描任务后，Mac 后台监听器领取任务；Mac 关机时任务保留，恢复联网后可继续领取。
- 网站约每 15 秒轮询状态；扫描回写后“今日岗位”会刷新。
- 中国扫描现在包含：
  - Mac BOSS 登录态采集；
  - 八个中国招聘平台公开索引；
  - 中国公司官网/公开 ATS。
- 已新增“仅测试招聘平台”的 GitHub Actions 工作流，可测试 BOSS fixtures 与八个平台，不需要每次重跑 174 家中国公司官网。
- 八个平台测试最多并发 2 个，降低同一 GitHub 出口触发限流的概率。
- 主搜索受限时会尝试备用搜索；429 有有限重试。
- 来源受限不能被备用源的空结果覆盖成“正常 0 条”。

### B2. 平台真实性与质量规则

PR #20 已合并，核心改动：

- 每个平台必须匹配正确域名和平台特定的具体职位 URL 形态。
- 不再把搜索 query 本身当作岗位相关性的证据。
- 宽召回统计、生物统计、数据分析、数据科学、AI、医疗、生物信息和量化岗位。
- 排除通用招聘首页、公司招聘列表、职业百科/岗位职责说明页、新闻编辑等无关页面、明确旧年份职位和混合无关岗位页。
- 明确区分：
  - 可访问且确实没有合格岗位；
  - 搜索源 429/验证码/访问错误；
  - 平台不公开索引具体职位页。
- 所有 smoke scan 检查域名、职位页形态、过滤统计和计数守恒，不允许伪造岗位。
- 任一来源本轮有受限查询时，只新增/更新实际找到的岗位，不做该来源的缺失/过期判断。

PR #22 已合并，进一步清理：

- BOSS “什么是生物统计师/岗位职责”一类说明页；
- 前程无忧公司列表、2020 等陈旧岗位、“数据新闻编辑”等；
- 牛客远程兼职、前程无忧低日薪以及应届生混合岗位页。

注意：PR #22 中“低日薪”删除属于旧工资门槛逻辑，现已被用户最新决定推翻；下一 Chat 要删除“因为工资低/日薪而排除”的部分，同时保留真正的页面真实性和相关性过滤。

### B3. Mac 自动更新链路

PR #21 已合并，`main` commit 为 `f65ca1bfd8071ae3463a4a5d8623b0b9ecc668e9`：

- 监听器仅在网站确实排队扫描时访问 GitHub。
- 执行 `git pull --ff-only`，不做强制覆盖。
- 如果监听器脚本本身发生更新，会在领取任务前重启，避免任务丢失。
- 单元测试覆盖空闲时不访问 GitHub、任务触发更新和自重启。
- 用户 Mac 已完成 install，后续常规更新应自动完成。

### B4. BOSS 部分结果和过期保护

PR #24 已合并，`main` commit 为 `137b176fd04c9fc73aaf492bf0152dfed3f4dbdd`：

- BOSS 多组查询中，后续某组触发 `code: 37` 时，前面已成功采集的结果不会全部丢弃。
- partial/incomplete 状态贯穿 CLI、网站一键扫描和同步层。
- incomplete 批次只导入已抓到的岗位，不触发 missing/expired reconciliation。
- 部分抓取缓存的岗位不会被错误当作完整成功缓存；下一次完整重试仍可重新纳入 seen URL。
- 对公开搜索源，只有所有查询都受限时才可以用“来源受限”放宽召回门槛；一条 429 不能掩盖其他健康查询的真实零结果。
- 完整 Python CI、八平台测试和最终代码审查均通过后才合并。

## C. 最近一次真实端到端中国扫描

在用户完成 Mac 监听器升级、Cloud Browser 登录和 BOSS 登录后，由网站触发了一次真实扫描：

- Mac 自动更新、任务领取、公开平台采集和网站回写链路正常。
- 公开平台阶段完成 33/33 查询。
- 随后扫描 174 家中国公司官网。
- 整轮约耗时 1 小时以上，速度不合格。
- 最终新增 7 个岗位。
- BOSS 前三组左右成功采到约 30 条列表结果，第 4 组再次出现 `code: 37`。
- 结论：登录态可用不等于接口/自动化环境不受限制；当前 BOSS 是“部分可采 + 会中途受限”，而不是完全稳定。
- 下一步不能尝试绕过验证码或安全验证。应优先：
  - 利用已合并的部分结果保留；
  - 继续公开 BOSS 具体职位页补召回；
  - 评估当前页面可见 DOM/普通 Chrome 路线是否能合法、稳定地替代受限接口；
  - 把公司官网阶段并发化并缩短单站超时，降低 174 站扫描时长。

## D. 八个中国招聘平台的真实状态

| 平台 | 当前可用路线 | 最近验证结果 | 仍未解决 |
|---|---|---|---|
| BOSS直聘 | Mac 登录态采集 + 公开索引 | 公开索引可得到当前生物统计职位；真实 Mac 扫描能先采约 30 条 | 第 4 组可能 `code: 37`；不能称稳定；需继续减少受限影响 |
| 猎聘 | 公开索引 | 一轮返回 2 条，其中 1 条明确接受应届博士；也可能 429 | 需持续验证职位正文完整性和波动 |
| 智联招聘 | 公开索引 | 一轮 3–4 条具体数据科学/大数据/数据分析岗位 | 仍依赖搜索索引，非完整平台 API |
| 前程无忧 51job | 公开索引 | 清理后可留下数据分析师、生物信息工程师；也会出现 10 个具体职位页但 0 个目标岗位 | `main` 的 smoke 门槛可能仍要求至少 1 条，导致随机红灯；PR #25 中将门槛改 0 的提交已关闭，需单独重做 |
| 拉勾 | 公开索引 | 公开搜索目前只暴露活动页/列表页 | 正确状态应为 `job_pages_not_indexed`，不能导入假岗位 |
| 牛客 | 公开索引 | 可得到具体职位页，也会遇到主源 429 | 作为补充来源，应严格验 URL/计数，但不应每轮强制有岗位 |
| 国聘 | 公开索引 | 一轮可有约 5 条；也多次 `rate_limited` | 限流波动；必须保留受限原因并禁止过期对账 |
| 应届生网 | 公开索引 | “数据科学 博士”曾 11 个页面但 0 相关；改用“数据分析师 + 统计学”后一轮留下 5 条 | 可访问但本轮 0 合格岗位是合法结果，不应等同接入失败 |

当前 smoke test 的正确职责：

- BOSS、猎聘、智联等主流来源在健康可访问时可设置业务召回门槛。
- 牛客、国聘、应届生、前程无忧等波动来源应严格验证域名、具体职位页、过滤、计数守恒和限制状态，但不应要求互联网此刻一定存在 1 条目标岗位。
- 只有明确 429、验证码、访问错误或“不公开具体职位页”才可作为受限状态通过。
- 受限状态不是成功采集，也不是 0 岗位；UI/报告必须保留原因。

## E. 用户最新规则与需要立即修正的冲突

### E1. 工资筛选已取消

用户最后明确说：“算了你不要筛选工资了。”

必须落实为：

- 工资字段继续抓取、保存、显示。
- 可把工资缺失、格式异常、低薪、日薪标为信息或待核验，但不能自动排除。
- 删除所有层中的 20K hard floor：
  - `local-collector/boss_radar.py`
  - `scripts/china_scan.py`
  - `scripts/company_portal_scan.py`
  - `app/api/jobs/import/route.ts`
  - 任何前端显示/拒绝原因、统计、测试 fixtures。
- 更新 `tests/test_boss_radar.py`、`tests/test_china_scan.py` 及相关集成测试，断言低于 20K、日薪和工资缺失岗位不会仅因工资被拒绝。
- PR #25 的解析代码不要恢复。
- 删除或改名旧拒绝原因如 `salary_below_20k`；若为了历史报表兼容需要保留字段，也只能作为非排除诊断。
- 执行完整 Python CI、网站 lint/build、八平台 smoke；抽查 artifact，确认低薪记录仍需通过职业相关性、职位真实性、年限等其他规则。

### E2. 非工资规则仍有效

- 目标岗位：生物统计/统计、数据科学/ML、Applied AI/AI in Healthcare、量化研究、医疗/生命科学咨询等。
- 排除以 GenAI/LLM/NLP 为核心的岗位。
- 用户之前要求不要因为 postdoc/senior 字样机械排除所有中国岗位；应结合真实职责、经验和目标适配度。旧交接中“所有高级/资深/postdoc 一律排除”可能已过时，下一 Chat 必须检查当前规则。
- 明显要求多年管理经验、完全不相关职业、非具体职位页、陈旧招聘页仍应排除。
- 完整 JD 原文应尽量保留；只有拆分关键词而不保留 JD 不符合项目目标。
- 评分应主要反映与用户真实技能的重合度；缺失学历/经验字段不能反而获得高分，Biostatistician 不应因通用规则被系统性压低。

## F. 当前 PR/分支状态

- 已合并：
  - PR #20：稳定中国招聘平台公开索引、域名/职位页验证、限流与过期保护。
  - PR #21：Mac 监听器任务触发时自动更新。
  - PR #22：清理职业说明页、兼职/混合/陈旧等伪职位。
  - PR #24：BOSS 部分结果保留、partial 状态与历史岗位过期保护。
- 已关闭、未合并：
  - PR #23：旧薪资解析修复，因与 PR #24 冲突被替代。
  - PR #25：重建后的薪资解析修复；用户取消工资筛选后关闭。
- 当前唯一开放：
  - PR #1：旧的 rendered-page BOSS draft。不要直接合并。
- `main` 写入本节前 HEAD：`137b176fd04c9fc73aaf492bf0152dfed3f4dbdd`。
- 下一 Chat 开始时必须重新核对 `main`、开放 PR 和 Actions，因为本文件写入后 HEAD 会变化。

## G. 仍未完成的功能和平台

### G1. P0：下一 Chat 应连续完成

1. 从所有中国采集/导入/UI 层删除工资 hard filter，并补测试。
2. 运行招聘平台专用 workflow，不要先跑 174 家公司官网。
3. 抽查八个平台 artifact，确认：
   - URL 是平台具体职位页；
   - 没有职业说明、公司列表、旧年份、混合无关页面；
   - 工资不再作为拒绝理由；
   - rate limit/incomplete 状态正确；
   - 计数守恒。
4. 合并后通过网站自动触发一次 Mac 实采；让监听器自动 pull，不再让用户运行 Terminal。
5. 检查 BOSS 是否仍在后续组出现 `code: 37`，确认已抓部分结果确实进入网站且历史岗位没有过期。
6. 单独修复前程无忧 smoke test 的随机“必须 ≥1 岗位”门槛，不要从已关闭 PR #25 恢复薪资代码。
7. 优化 174 家中国公司官网阶段的并发和超时，把 1 小时以上的运行时间降下来。

### G2. P1：中国平台覆盖仍缺

- BOSS 完整、稳定的当前岗位/完整 JD 采集尚未解决。
- 猎聘、智联、51job、牛客、国聘、应届生目前主要依赖公开搜索索引，不能保证完整覆盖或完整 JD。
- 拉勾没有公开索引具体职位页。
- Moka、飞书招聘、就业在线、各公司自建招聘站仍需要更稳定的 tenant/职位页识别。
- 中国公司官网 174 家虽能完整跑完，但成功率、速度和匹配质量仍需逐站统计。
- 职位猎人 `lastsunday/job-hunting` 的真实导出 schema 和敏感字段尚未在用户 Mac 验证。
- Apify 智联 adapter 已存在但默认关闭；只有用户明确批准付费和 spending cap 后才能启用。
- 不能通过绕过登录、验证码、风控或接口保护来“稳定接入”。

### G3. P1/P2：整个 Job Radar 仍需完善

这些来自本项目此前讨论，尚未全部重新验证：

- 评分：修复“学历/年限缺失反而得分高”和 Biostatistician 得分偏低；按用户技能重合度加权。
- Sponsorship：美国职位仍需更强的公司/职位 sponsor 证据（Beacon 等此前列为待办）；但用户当前不要求继续扩美国来源。
- 去重：继续以 canonical URL + requisition/application ID 为主，避免相似标题误合并。
- Career-ops/公司官网链路、JobSpy 全来源覆盖、ATS 全覆盖仍需生产稳定性验证；当前冻结，不作为中国 P0。
- 核对每日 06:00 自动扫描是否仍存在。最近代码把区域 workflow 改成手动触发并显示实时进度，不能仅凭旧文档假设每日计划仍有效。
- 手机 widget/固定入口、扫描提醒和“立即更新”二次确认是否全部达到用户预期，需要重新验收。
- 网站申请漏斗状态已设计为：收藏、待提交、已提交、面试中、Offer、撤回、拒绝；拒绝可隐藏。现有实现需以生产页面为准复核。
- 任何来源失败都必须明确显示；不能把失败写成“成功扫描 0 条”。

## H. 新 Chat 的建议开场与操作顺序

建议用户在新 Chat 直接发送：

> 请先完整读取 `XinyuIvy/ivy-job-radar` 的 `PROJECT_HANDOFF.md`，核对 GitHub 当前 `main`、开放 PR 和 Actions。以最顶部 2026-08-02 最新交接为准。从 P0 开始：彻底移除中国岗位的工资 hard filter，保留工资展示；运行中国招聘平台专用测试并抽查 artifact；通过后合并并自动触发一次 Mac 实采。不要让我运行 Terminal，除非出现新的 BOSS 验证码或登录墙。

下一 Chat 不应先做的事：

- 不要恢复或合并 PR #25。
- 不要直接合并 PR #1。
- 不要先扩美国来源。
- 不要每次平台调试都重跑 174 家中国公司官网。
- 不要把 429、验证码或职位页未索引说成“正常 0 条”。
- 不要声称 BOSS 已稳定。
- 不要要求用户提供密码、Token 或远程 shell。
- 不要因为薪资低、日薪或工资缺失自动删除岗位。

---

## 以下为此前版本交接记录

# Ivy Job Radar 项目交接与持续进度记录

> 最后更新：2026-08-01 21:17（America/New_York）  
> 仓库：`XinyuIvy/ivy-job-radar`（private）  
> 生产分支：`main`  
> 当前功能基线：`573469b426a5555a5a64ef0943a6f3ed98dae885`  
> 最近完成：[PR #10](https://github.com/XinyuIvy/ivy-job-radar/pull/10) 网站触发中国扫描；[PR #11](https://github.com/XinyuIvy/ivy-job-radar/pull/11) BOSS 两阶段扫描优化，均已合并。

## 0. 给下一位 Chat 的最短说明

这是一个面向用户本人求职的 **US + China 多来源职位发现、核验、去重、追踪和申请管理系统**。它不是一个已经成熟、覆盖所有招聘平台的产品；覆盖率和稳定性仍在开发中。

当前最重要的状态是：

1. `main` 上已经有完整网站、D1 持久化、申请管理、公司研究、质量监控、导出和每日 GitHub Actions 扫描框架。
2. 美国公开招聘源、公开 ATS、公司官网、聚合数据源已进入生产流水线，但公司官网成功率仍低，最近一次健康状态为 `warning`。
3. 中国岗位扫描已形成两条互补链路：BOSS 使用 Mac 本地登录态采集；猎聘、智联、51job、拉勾、牛客、国聘、应届生和中国公司官网使用公开索引发现。受保护平台仍不能由云端稳定抓取完整登录态页面。
4. PR #2 已于 2026-08-01 squash merge 到 `main`，merge commit 为 `7443f4fe7b45785638aed8baff8a6fd42bf796be`；生产 run `30713268976` 已完成端到端验证，25 个步骤全部成功，网站按字节分批导入、completed 状态、artifact 和 snapshot push 均已通过。
5. BOSS 真实页面链路已验证：能保存职位名、公司、地点、独立详情 URL；最初 JD 正文截断问题已修复。测试岗位“高级生物统计师（上海）”被排除是正确行为，因为系统面向应届/早期职业岗位并排除“高级”。
6. PR #3 已打通 BOSS 可见详情页 → Mac 本地隐私过滤 → 网站实时导入；不再需要复制 JSON、提交 GitHub 或运行 20 分钟全量 workflow。原始捕获仍保留在本地，远端只接收规范化字段。
7. 第二次生产 run `30712239542` 已验证固定 40 条分批：前 3 批共 120 条成功，第 4 批失败。根因是 Figma 一条记录的 `application_id` 正则误捕获约 1.35 MB 嵌入式岗位 JSON，并重复进入 `evidence`，令单条记录约 3.2 MB、第 4 批约 4.6 MB。修复已提交：ID 提取限制格式/长度，批次同时限制 40 条和 1,000,000 字节，异常超大单条会在上传前失败。8 个相关测试、YAML 解析和真实 artifact 回放均通过；回放为 10 批，最大 999,796 字节。
8. 已新增 `.github/workflows/sync-latest-job-snapshot.yml`（commit `7d68ca1...`）：网站同步失败后无需重新跑约 20 分钟的全量采集，可直接从 `main` 最新扫描快照重试分批导入。该 workflow 与全量扫描共用 concurrency group，避免两条导入链路并发写入。
9. 生产 run `30713268976` 将 338 条职位拆成 10 个合规批次并全部导入成功：created 0、updated 210、skipped 128；网站最终 `totalJobs: 361`，P0 已完成。
10. 2026-08-01 用户真实测试“生物统计师 · 基绪康生物科技”时，本地服务和远端导入均成功，但今日页未显示。根因是捕获器发送状态 `已捕获完整JD`，而 `GET /api/jobs` 只读取 `开放` / `待官网核验`。
11. 网站“今日岗位”已有独立的“开始中国岗位扫描”按钮。按钮创建排队任务，Mac 后台 `china_scan_agent.py` 登录后自动领取；Mac 关机时任务保留，BOSS 登录失效或验证码会在网站显示需要处理。岗位和分来源汇总会自动回写，页面约 15 秒轮询刷新。
12. PR #11 已将 BOSS 改为两阶段采集：先快速抓 8 组列表并按岗位 ID 跨关键词去重、标题初筛和历史缓存过滤，再仅为新且可能合格的岗位打开详情。完整 CI 通过。

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

项目中存在三类触发机制，之前容易被混淆：

1. **ChatGPT Automation**：负责在 ChatGPT 内执行每日岗位搜索/提醒。2026-08-01 纽约时间约 06:05 有运行证据。
2. **GitHub Actions**：负责实际运行仓库中的扫描脚本、生成快照、回写网站并提交最新扫描文件。工作流计划在纽约时间约 06:07 运行，通过两个 UTC cron 加纽约时区 guard 处理夏令时。
3. **网站触发的 Mac 中国扫描**：网站按钮只创建任务；Mac 后台代理领取后运行 BOSS 登录态采集和中国公开索引。它不要求固定 6 点开机，但执行时 Mac 必须开机联网。

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

## 4. 最近一次生产扫描基线（run 30713268976，2026-08-01）

本轮端到端运行成功，仓库快照、网站导入和 scan status 已一致完成。数据来自 `data/scans/run_receipt_latest.json`、`scan_health_latest.json`、`company_portal_summary.json` 和 Actions 日志：

| 指标 | 数值 |
|---|---:|
| fetched | 346 |
| verified/open | 118 |
| rejected | 10 |
| deduplicated | 16 |
| imported | 338 |
| new | 1 |
| updated/unchanged | 319 |
| temporarily retained | 18 |
| stale pruned | 0 |
| failed sources | 175 |
| company pool | 350 |
| company portals attempted | 350 |
| company portals succeeded | 175 |
| company success rate | 50.0% |
| company portal jobs scanned | 12,909 |
| company portal jobs matched | 82 |
| China indexed jobs matched | 0 |

健康状态仍为 `warning`。美国公司门户成功 148/176；中国公司门户仅成功 27/169，且中国公开索引命中 0，仍是主要覆盖缺口。公司池共 350 家，本轮成功识别/采集 175 家，职位命中 82；`attempted 350/350` 不能表述为全部成功覆盖。

本轮来源计数：

- `us_jobs_verified_latest.json`: 14
- `china_jobs_latest.json`: 0
- `cloud_sources_jobs_latest.json`: 0
- `aggregator_jobs_verified_latest.json`: 250
- `company_portal_jobs_latest.json`: 82

生产 run `30713268976` 的 25 个步骤全部成功。338 条职位被拆为 10 批并全部获得 `ok: true`：created 0、updated 210、skipped 128。网站 completed 回执为 `totalJobs: 361`；artifact `global-jobscan-30713268976`（ID `8822726352`）保留至 2026-08-31，扫描快照已安全 rebase/push 到 `main` commit `8cda00d...`。

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

当前进度：P0 已完成。生产 run `30713268976` 从修复后的 `main` 启动，采集、核验、公司池、canonicalize、health、10 批网站导入、completed status、artifact 和 snapshot push 全部成功。网站最终回执为 `totalJobs: 361`；artifact ID `8822726352`，扫描快照 commit `8cda00d...`。

1. [x] 复核 PR #2 当前 diff 和 CI 后合并到 `main`。Merge commit：`7443f4fe7b45785638aed8baff8a6fd42bf796be`。
2. [x] 从 `main` 手动 dispatch `.github/workflows/daily-us-jobscan.yml`。run：`30711130632`。
3. [x] 观察每一步，包括中国快照导入、来源 merge、公司池扫描、canonicalize 和 health；这些步骤全部成功。
4. [x] 验证 `IVY_JOB_RADAR_SYNC_TOKEN` 与 `SITES_SIWC_BYPASS_TOKEN`；两个 secret 均存在且能写入 scan status。
5. [x] `/api/jobs/import` 生产验证通过：run `30713268976` 将 338 条拆为 10 批，全部返回 `ok: true`；created 0、updated 210、skipped 128。
6. [x] artifact、receipt、health、中国 summary、仓库快照和网站 completed 回执均已核对；网站 `totalJobs: 361`。
7. [x] 最新快照已安全 rebase/push 回 `main`；commit `8cda00d...`，artifact ID `8822726352` 保留至 2026-08-31。

下一步执行顺序：

1. [x] 修改 daily workflow，把职位数组切成每批 40 条后逐批 POST；每批保持可重试、失败即停止。
2. [x] 新增 3 个分批测试，并完成 Python 编译、单元测试和 YAML 解析。
3. [x] 修复已直接提交到 `main`：脚本 `1b634902...`、测试 `3782d461...`、workflow `8a455438...`。
4. [x] 新开 production run `30712239542`；固定条数分批得到真实验证，前 3 批成功，第 4 批失败。
5. [x] 修正 `extract_application_id` 的无界捕获，增加按字节切批与异常单条测试。关键 commits：`aaa810e...`、`ccf1edb...`、`92c3401...`、`9087e86...`、`a782238...`、`f4e63fd...`。
6. [x] 8 个相关单元测试、Python 编译、YAML 解析和 run `30712239542` artifact 回放通过；337 条修正后数据拆成 10 批，最大 999,796 字节、每批最多 40 条。
7. [x] 已从修复后的最新 `main` 完成 production run `30713268976`；25 个步骤全部成功。
8. [x] 新增独立快速重试 workflow `.github/workflows/sync-latest-job-snapshot.yml`。若全量扫描的网站同步失败，直接运行它，不再重新采集全部来源。
9. [x] 网站 scan status 为 `completed`；created 0、updated 210、skipped 128、网站岗位总数 361。P0 关闭。

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
- `.github/workflows/sync-latest-job-snapshot.yml`：从 `main` 最新扫描快照快速重试网站同步，不重新抓取职位。
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
- 不要声称 BOSS 能在云端无人值守运行。入口已在网站，执行仍依赖用户 Mac、专用 Chrome 登录态以及人工处理验证码。
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


## 16. 网站触发的中国多来源扫描（2026-08-01）

正式入口已从桌面迁入 Ivy Job Radar 网站：

- “今日岗位”页面提供独立的“开始中国岗位扫描”按钮；
- `/api/china-scan-control` 保存 queued / running / completed / attention_required 状态；
- `local-collector/china_scan_agent.py` 作为 macOS LaunchAgent 常驻轮询，领取任务后运行 `china_one_click.py`；
- Mac 关机时任务不会丢失，下次登录后领取；
- BOSS 依赖专用 Chrome profile 的登录态；遇到登录失效或验证码会暂停，不绕过验证；
- BOSS 失败不阻止中国公开索引继续，反之亦然；
- 合格岗位自动导入“今日岗位”，分来源报告自动上传并展示；网页打开时约 15 秒轮询刷新；
- 安装后台代理时会删除旧桌面 `一键扫描BOSS.command`，桌面文件不再是正式入口。

中国公开索引当前覆盖猎聘、智联、51job、拉勾、牛客、国聘、应届生和中国公司官网。对受保护平台，这仍是公开索引发现，不等于登录态完整 JD 抓取。

BOSS 搜索计划为 7 城市 × 8 关键词，共 56 组合；每次网站请求运行 8 个组合并按 cursor 断点轮换。城市为上海、北京、深圳、杭州、广州、南京、成都，苏州已移除。

## 17. BOSS 两阶段详情采集优化（PR #11，2026-08-01）

旧实现对每一个关键词的每一条结果立即打开详情，因此相同岗位会被重复读取，明显无关的统计员、高年资岗位也会消耗 10–25 秒的限速等待，单批可能持续数小时。

PR #11 已合并，当前流程为：

1. 对本批 8 个“关键词 × 城市”组合只抓列表，调用第三方采集器时显式使用 `--no-detail`。
2. 合并全部列表并按 BOSS 岗位 ID 跨关键词去重。
3. 在打开详情前排除实习、兼职、博士后、统计员、经理/主管、负责人、高级、资深、首席、专家、架构师及英文高年资标题。
4. 保留生物统计、临床/医学统计、数据科学、应用/研究科学家、量化、医疗咨询、RWE/HEOR、医学影像及科学算法相关岗位。
5. 对已成功同步且列表指纹未变化的岗位使用 `~/.ivy-job-radar/boss-detail-cache.json` 跳过详情。
6. 只把剩余的新候选合并为一个详情任务，每个岗位 ID 最多打开一次详情页。
7. 网站导入成功后才写缓存；若网站同步失败，cursor 回滚且不会写缓存，下一次安全重试。
8. 若列表搜索或详情采集遇到登录/验证失败，cursor 保持在本批，不会把未完成批次当成完成。
9. 报告新增发现数、唯一岗位数、列表重复数、详情前排除数、缓存跳过数和实际详情候选数。

第三方详情页仍保留必要限速，不应删除或暴力提速。性能提升来自减少需要打开的详情数量。

首次运行新版时缓存为空，仍需为所有通过初筛的候选读取一次详情；后续重复扫描才会显著加快。列表中的标题、公司、薪资、地点、标签、技能、福利或行业变化会改变指纹并触发重新读取。

验证状态：

- 9 项 BOSS 定向单元测试通过；
- Python syntax check 通过；
- GitHub Actions `PR Python tests` run `30726764936` 通过；
- PR #11 squash merge SHA：`573469b426a5555a5a64ef0943a6f3ed98dae885`；
- 尚需用户 Mac 在真实 BOSS 登录态下运行一次新版生产扫描，核对实际详情候选数与耗时。

## 18. 当前下一步

1. 用户 Mac 执行 `git pull --ff-only`，无需重新安装网站后台代理，因为 LaunchAgent 运行仓库中的 `china_one_click.py` 和 BOSS 采集代码。
2. 在网站点击一次“开始中国岗位扫描”，观察状态从等待 Mac 到完成/需要处理。
3. 核对网站报告中的 `jobs_duplicate_listings`、`jobs_filtered_before_detail`、`jobs_skipped_cached` 和 `jobs_detail_candidates`。
4. 第一次新版扫描用于建立缓存；第二次扫描才是缓存性能验收。
5. 继续补齐 fresh-PhD 的 JD 经验与学历精细判断，不能只依赖标题白名单。


## 19. 中国工资缺失、排除原因与登录恢复（PR #17，2026-08-01）

PR #17 已合并，merge commit 为 `7f59d4b11591193a3eed532d5b03fe26e62e0387`，PR Python tests run `30731119449` 成功。

当前规则：

- 中国岗位明确解析出的月薪下限低于 20K 时排除；
- 工资缺失或“面议”不再排除，保留为工资待核验；
- 实习、高年资、工程类、大模型/NLP/LLM、超过 3 年经验及明显无关岗位仍按既定规则排除；
- 不按匹配评分删除中国岗位；
- BOSS、公开索引、公司官网和网站导入边界使用一致的工资规则；
- 实时进度和最终来源汇总分别显示硬排除原因与“工资待核验”数量；
- BOSS 中断区分登录失效、验证码/安全验证、网络错误和普通来源错误；
- 登录或验证码中断不会被当作完整扫描，不会触发该来源的岗位过期判断；处理后再次点击“更新中国岗位”会从未完成批次继续；
- 网站版本 59 已部署。

仍未完成：

- GitHub 原生 Actions 通知邮箱属于 GitHub 账户级 Notifications 设置，不在仓库 workflow 内。目标邮箱是 `ivyzzzhang@gmail.com`；本次云浏览器无法连接 GitHub 设置页，因此尚未替用户完成账户级切换。若该邮箱未在 GitHub 验证，必须先完成 GitHub 发出的验证邮件。


## 20. 中国招聘平台独立测试工作流（PR #19，2026-08-02）

PR #19 已 squash merge，merge commit 为 `dbc3b1e57d085b09cd4b77422ae6b67021381fc2`，PR Python tests run `30732860656` 成功。

- 新增手动 GitHub Actions 工作流 `Test China recruitment platforms`。
- 该工作流只编译和测试 BOSS/中国平台采集代码，并运行中国公开招聘平台索引 smoke scan；不会运行 `company_portal_scan.py`。
- 测试结果只作为 7 天 artifact 保存，不回写生产网站，也不提交岗位快照。
- BOSS 在 GitHub Actions 中只运行真实页面 fixture、解析和筛选回归测试；实时 BOSS 页面仍依赖用户 Mac 的登录态，不能在 GitHub 云端绕过登录或验证码。
- 网站继续只保留一个“更新中国岗位”入口，正常使用时仍运行完整中国来源。
- 已修复公开索引的重复关键词门槛：通过明确目标查询召回的截断摘要，不再被要求重复出现相同关键词；完整 JD 不足时保留待核验，明确排除条件仍继续生效。
