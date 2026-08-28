# Job Application / CV Knowledge Base 项目交接

最后更新：2026-08-28（America/New_York）

## 2026-08-28 最高优先级交接：手动测试新版 CV Prompt，事实快照自动刷新尚未实现

> 本节覆盖下方所有仍把完整 JD 泛化为“最高事实权威”、把 canonical indexes 当作主要生成输入、强制每个项目完全不可跨页、固定每个项目两条 bullet，或默认旧 APP 会随 `XinyuIvy/CV` 自动更新的旧说明。当前顺序是：先完成一份手动 Prompt 测试，用户确认质量后再修改网站 Prompt 和事实快照刷新机制。自动 CV 定制仍保持全局暂停，不得提前恢复或批量重生成。

### 1. 本轮已经确认的权威边界

- `fact_master_snapshot.md` 不是另一套简化的 Fact Master。它是 `XinyuIvy/CV@<application_record.source_versions.cv_commit>:master/FACT_MASTER.md` 在建立申请包时复制出的完整冻结副本。在某个 APP 的生成任务中，它就是该版本的完整事实模板。
- 对“候选人做过什么、本人贡献、方法、工具、数据、结果、数字、年月、作者身份和论文状态”等所有候选人事实，完整事实模板是第一最高权威。每条 Summary、Skill 和 bullet 都必须能回到完整事实模板定位依据。
- `jd_snapshot.md` 只对“雇主需要什么、硬性资格、核心职责、强优先能力、预期交付和岗位关键词”具有最高权威。JD 不能证明候选人做过任何事情，也不能覆盖事实模板。
- `cv_base.tex` 和 `cv_display_rules_snapshot.yaml` 负责同语种固定教育背景、联系方式、已确认展示措辞、章节外层顺序和版式。它们不能新增事实。
- `jd_requirements.json`、`match_packet.json`、canonical project/fact/capability/concept/relation/retrieval indexes 及旧 Direct/Transferable/Adjacent/Unsupported 标签都是二级辅助材料，只用于召回、证据定位和边界核验。任何召回内容必须回到完整事实模板确认。
- 以后 Prompt 不再写一个含糊的总排序“完整 JD 是第一权威”。必须分别写清：候选人事实以完整事实模板为最高权威，岗位需求以完整冻结 JD 为最高权威，展示规则以同语种 Reference CV 为权威。

### 2. 最新手动测试 Prompt 已经解决的内容

- 开头明确角色为熟悉目标 JD 所属行业、岗位职能和招聘标准的资深招聘评估者与简历编辑。
- 强制完整读取 `fact_master_snapshot.md` 和 `jd_snapshot.md` 到 EOF，不允许只读结构化摘要或检索命中片段。
- 先从完整 JD 提炼不超过八项招聘信号，再直接与完整事实模板独立比较，重新判断 Direct、Transferable、Adjacent 和 Unsupported；canonical indexes 只在第二轮使用。
- Summary、Skills、岗位相关 section 名称和第一页前三条核心 bullet 必须形成同一个候选人定位，并通过 10 秒招聘官扫描测试。
- 外层顺序固定为“个人简介 -> 教育背景 -> 专业技能 -> 岗位相关主体 -> 论文/会议/荣誉”；专业技能不得移动到教育背景之前。
- 正式工作或实习独立呈现。其他项目按当前 JD 的职责、方法或交付类型分组并命名，不再机械套用“研究项目 / 应用项目 / 算法研究”。统计或科学研究不得仅因使用编程而写成算法研究。
- 每个项目只出现一次。核心项目可写 2 至 3 条 bullet，次要项目可写 1 至 2 条；每条必须增加新的招聘证据，不再固定所有项目恰好两条。
- 项目 bullet 不写投稿、在审、返修、大修或接收状态，论文状态统一放到论文或学术成果 section。
- 中文语义审校新增语境翻译规则。Pfizer 项目中的 effect retention/preservation 应写成“短期复合终点对长期治疗效应的保留程度”或等价自然中文，禁止“恢复分析”“效应恢复分析”“恢复治疗效应”等字面翻译。
- 中文术语继续执行已确认边界，包括“脑区皮层厚度”“个体级 Bootstrap”“变量重要性（Model Reliance）”、FDR/FWER 规范全称和 SQL 只写 SQL；不得加入 TypeScript 或 React。
- 页面长度只能通过高相关事实控制，所有同级 section、教育和项目间距必须统一。禁止拉大教育间距、局部 `\\vspace`、增大行距或添加空白凑两页。
- 目标仍是正好两个物理页面，第二页实质正文超过可用正文高度的一半，并尽量接近但不挤满两页。第一页不得因分页控制留下明显大块空白。
- 新分页优先级覆盖下方 v12 的绝对 `cvblock/minipage` 规则：section 标题与第一项同页，项目标题与第一条 bullet 同页，单条 bullet 不拆分；项目优先保持完整，但若整块不可拆分会造成上一页明显空白，允许在两条完整 bullet 之间分页。不得为整个多 bullet 项目机械套用不可拆分 `minipage` 或过大的 `Needspace`。
- 使用 LuaLaTeX 编译两次，并用 `pdfinfo`、`pdftotext`、`pdffonts` 和逐页渲染验证页数、Unicode 映射、文本提取、页面密度、项目分页、异常断行、溢出和中文可见/可选/可复制。
- 本轮人工测试不得写回 GitHub、不得修改申请状态、不得重启 PRECV、不得调用旧 CV 自动生成任务。第一版应直接返回临时 PDF 和 `cv_review.md`。

### 3. 当前正在测试的状态

- 用户已经在独立 Chat 中用 `APP-2026-OPP-0053` 启动最新版 Prompt 测试。测试结果尚未在本交接中确认，下一 Agent 不得把“已经启动”误报为“测试通过”。
- 当前目标只验证四件事：岗位画像是否精确；内容是否真正来自完整事实模板；中文是否自然且没有错误直译；PDF 是否达到两页密度与正常分页要求。
- 最新 Prompt 目前只存在于 Chat 测试中，尚未写入 `app/lib/application-archive.ts`、`app/lib/cv-prebuild-bundle.ts` 或现有 APP 的 `chat_prompt.txt`，也尚未同步到网站 Prompt 生成器。
- 在用户明确确认这份测试通过前，不得重新打开 `CV_PREBUILD_AUTOMATION_PAUSED`，不得重生成待申请列表中的旧 CV，也不得把测试 Prompt 直接批量写入所有 APP。

### 4. 已确认但尚未解决的事实快照刷新缺口

- 正式 APP 创建时，`app/api/cv-tailor/archive/route.ts` 会从 `XinyuIvy/CV` 当前 `main` commit 同时复制完整事实模板、展示规则、六类 canonical indexes 和选定母版，并在 `application_record.yaml` 记录 `source_versions.cv_commit`。
- `jd_snapshot.md`、岗位公司/名称/链接和 Application ID 应永久保持创建时版本，不能随招聘页面或事实库变化被覆盖。
- 现有同语言、同母版 APP 再次打开时，当前代码只读取旧 `jd_snapshot.md` 并在 API 响应中动态返回当前 Prompt；它不会比较最新 CV commit，也不会刷新 `fact_master_snapshot.md`、展示规则、canonical indexes、`cv_base.tex` 或 `match_packet.json`，也不会把动态返回的新 Prompt持久化回 `chat_prompt.txt`。
- 当前只有用户显式切换语言或母版，并且目录中尚无 finalized customized/submitted CV 时，archive route 才会整包 re-freeze。已经存在最终 CV 时会拒绝覆盖并要求明确 revision。
- PRECV generation key 已包含 `cvCommit` 和 `factMasterSha`，所以新事实可以产生新的 PRECV generation；但正式 APP 不会因此自动导入最新事实。这两套刷新行为目前不一致。

### 5. Prompt 测试通过后的待实现方案

1. 在每次尚未定稿的 APP 开始手动定制或新生成 CV 前，比较 `application_record.source_versions.cv_commit` 与 `XinyuIvy/CV@main`。
2. 如果 CV commit 未变化，复用现有事实快照，不产生多余写入或模型调用。
3. 如果 CV commit 已变化且申请尚无 `cv_customized_<APP-ID>.tex/.pdf` 或 `cv_submitted_<APP-ID>.pdf`，只刷新事实相关输入：`fact_master_snapshot.md`、`cv_display_rules_snapshot.yaml`、全部 canonical indexes 和当前选定的 `cv_base.tex`；同时更新 `application_record.yaml` 的 CV commit、事实 SHA、刷新时间和来源版本。
4. 完整 JD 和申请身份保持不变。刷新事实后重新计算会受事实变化影响的 `match_packet.json`，不得重新抓取或覆盖冻结 JD。
5. 刷新动作必须是确定性的资料同步，不调用 OpenAI，不生成 PDF，也不修改申请状态。
6. 如果已经存在最终或实际投递 CV，不得原地覆盖。应建立明确 revision，保留原事实快照、原 PDF、原 source commit 和实际投递历史。
7. 修复同语言、同母版 existing APP 路径，使生成器在资料未过期时也能把最新已确认 Prompt 合同持久化到 `chat_prompt.txt`，而不是只在 HTTP 响应中临时返回。
8. 增加回归测试：未定稿 APP 事实更新后刷新；JD 不变；无变化时幂等；finalized APP 拒绝覆盖；revision 保留历史；Prompt 文件与运行时返回一致；刷新过程零模型调用。
9. 完成代码、测试和部署后，再对一个未定稿 APP 做真实刷新验证。只有用户确认 Prompt 测试和刷新结果都通过，才能讨论恢复自动 CV 生成。

### 6. 下一位 Agent 的严格执行顺序

1. 先读取用户对 `APP-2026-OPP-0053` 测试结果的反馈，不要重新生成第二份付费 CV。
2. 根据测试中真实出现的问题修改唯一 Prompt 文本，并再次只测试一份。
3. 用户确认 Prompt 后，把正式 APP Prompt 和 PRECV Prompt 合并为同一个共享合同，禁止继续维护两套逐渐分叉的长 Prompt。
4. 再实现上述未定稿 APP 自动刷新事实快照机制；刷新本身不得调用模型。
5. 最后再决定何时解除全局暂停。没有用户明确授权，不得恢复自动生成、自动重试或批量重做。

## 2026-08-28 最高优先级交接：正式 APP 归档与 PRECV 生成记录分离

- 用户确认页面需要显示的是 `APP-...` 正式申请文件夹编号，不是雇主 ATS 的 requisition/application ID。旧实现把两者混在 `applications.application_id`，导致多数已生成过 CV 的待申请岗位仍显示“未提供”。
- 新数据模型新增 `applications.archive_id`。`application_id` 只保留公司职位编号，允许为空；`archive_id` 保存稳定的内部归档编号，必须用于 `applications/<year>/<APP-ID>/`、最终 CV 文件名和 autofill 读取。
- schema v7 会把旧 `application_id` 中符合 `APP-...` 的值迁到 `archive_id` 并清空被误占用的公司职位编号字段。CV archive route 和 autofill routes 已改读独立 `archive_id`，不再把 APP ID 写回 jobs 的外部职位编号。
- 当前生产待申请岗位均有 PRECV 生成记录，绝大多数有真实 PDF/TEX artifact key。资料没有丢失，但旧架构只建立了 `prebuilds/<year>/<PRECV-ID>/`，没有自动建立对应的正式 APP 文件夹。
- `/api/application-archive/ensure` 不调用 OpenAI。它优先复用已经保存的 PRECV 完整 JD、事实母版、canonical indexes 和 `cv_base.tex`，建立正式 APP 文件夹，并写入 `prebuild_links.json` 关联历次 PRECV 与 R2 artifact key。不存在 PRECV 时才从冻结 CV repo 输入建立归档。
- 进入待申请时必须先建立 APP 归档；打开现有待申请列表时会逐份、串行补齐缺失归档，避免 GitHub ref 冲突。列表直接显示 APP ID 和 CV 状态，右侧“已申请 / 移除”始终可见，不需要进入详情页。
- 回收旧 PRECV 时不得把坏的历史 PDF 冒充 `cv_customized_<APP-ID>.pdf`。只记录 artifact link，保留原文件；用户确认新版 Prompt 和最终 CV 后再创建正式 customized/submitted 文件。

## 2026-08-28 待申请岗位可直接移动状态

- 待申请列表的每个岗位现在都有“已申请”和“移除”按钮，岗位详情页也提供“标记已申请”和“移出待申请”。
- “已申请”会写入当天申请日期并进入“已提交申请”；“移除”会安全回到收藏，不删除岗位、申请历史或已生成的 CV 文件。
- 两种操作都会取消该岗位尚未完成的 CV 队列状态，但不会取消或删除 `ready` 产物。
- 服务端入口是 `/api/applications/pending-action`，只接受当前状态为“准备材料”的记录，重复提交按目标状态幂等处理。

## 2026-08-28 最高优先级交接：待申请 CV 自动定制全局暂停

- 用户确认待申请列表中的 CV 都已经生成过，但质量不合格。当前要求是保留岗位和现有 PDF，不再自动重生成、自动修复或自动重试，避免继续调用生成 API。
- `CV_PREBUILD_AUTOMATION_PAUSED = true` 是当前最高优先级运行开关。前端打开待申请列表、进入待申请、确认自动申请批次、维护心跳、扩展心跳和任务轮询均不得启动新 CV。
- `/api/cv-prebuild/queue`、`prepare`、`chat` 和 `regenerate-pending` 在暂停期间返回 `CV_AUTOMATION_PAUSED`。任务与维护接口会把仍处于 active/retry 状态的旧任务标记为 `cancelled`，但不删除 `ready` 稿件或其现有 artifacts。
- 待申请页面只保留岗位、现有 CV 预览和下载。批量重生成按钮已移除，CV Chat 的新生成和修改输入已禁用。收藏仍可进入待申请，但不会创建 CV 任务。
- 用户正在用独立 Chat 手动测试新版 Prompt。在用户确认测试通过前，不得将自动定制重新打开，也不得用任何维护或恢复逻辑绕过暂停开关。

## 2026-08-28 最高优先级交接：CV v12 JD 职责分组、两页内容下限与真实排版验收

> 本节覆盖下方 v9 仍把“最多两页”和十轮 review 当成模型自述的规则。生产成功标准从本版起以五件套内容和最终 TeX / PDF 结构验收为准，不能再凭 `cv_review.md` 写了“通过”就进入 `ready`。

### 1. 用户确认的固定版式合同

- 中文和英文都必须恰好两个物理页面，第二页真实正文必须越过可用正文区域的高度中线，整份 CV 实质超过一页半，并在不过度拥挤的前提下尽量接近完整两页。运行时要求第二页非空白文本量至少达到第一页的 55%；一页、三页、第二页未过半或两页严重失衡都不合格。不得用弱相关内容、重复 bullet、放大字号或大段空白凑页。
- 外层顺序固定：中文为“个人简介 → 教育背景 → 专业技能 → 岗位相关主体章节 → 论文与荣誉”，英文为“Summary → Education → Professional Skills → role-specific experience/project sections → Publications and Honors”。前 3 个和最后 1 个章节是硬顺序。
- 主体章节不得机械套用“行业经历 / 研究型项目 / 应用型项目”。每份 CV 必须先从当前完整 JD 提取 2 至 5 个高权重职责簇、能力主题和岗位原词，再用事实支持且自然的招聘语言命名、分组和排序。每项经历或项目只进入最能证明其岗位价值的一个章节；不得跨章节重复，也不得用 Unsupported 关键词改变项目真实性质。
- 三个学位必须分别成块；学位、学校和日期在首行，论文题目另起一行。下一学位不得与上一条论文粘在同一行。
- 每一条教育、行业经历、项目和论文必须独立包在 `cvblock` 中。`cvblock` 使用不可分页的 `minipage`，结束时固定保留 `0.45\baselineskip` 间距；标题、日期、正文和 bullet 不得拆到两页。所有章节通过 `cvsection` 加 `Needspace` 防止孤立标题。禁止用 `newpage`、`pagebreak` 或 `clearpage` 人工切页。
- 保持冻结母版的单栏 ATS 结构；禁止图标、文本框、侧栏或改变阅读顺序的复杂表格。正文不得小于母版字号，母版无法判定时下限为 9.5pt；页边距、行距和项目间距不得低于母版。PDF 提取文本顺序必须与视觉阅读顺序一致。
- 每次编译两遍后必须运行 `pdfinfo`、`pdftotext` 和 `pdftoppm`。两页分别渲染并检查教育粘连、项目间距、跨页条目、异常断行、溢出和页面密度；结果逐项写入十轮 `cv_review.md`。

### 2. v12 运行时硬门禁

- Prompt 版本为 `cv-prebuilder-v12-jd-aligned-sections`。JD 职责分组和固定排版合同独立于用户可编辑规则，fresh 生成和 Reference 改写都不能删除或缩短。
- `cv-artifact-validation.ts` 在任何任务进入 `ready` 前下载并验证全部五件套：PDF、TEX、PDF 提取文本、十轮 review 和申请判断 JSON。缺少任一文件直接失败。
- 验收器检查 PDF 头、恰好两个带换页符的文本页面、第二页至少达到第一页 55% 的文本内容下限、最低页面内容量、55% 密度平衡、固定章节顺序、三个教育块、至少三个项目或经历块、每个中间主体 section 至少一个 `cvblock`、块数量平衡、禁止手工分页、十轮 review 标记和 decision JSON 结构。
- 未通过时记录 `CV_ARTIFACT_VALIDATION_FAILED`，不保存为可用成果、不建立 Reference、不进入浏览器填表；自动恢复链会重新生成，最多仍服从现有 7 次上限。

### 3. 已有稿件与当前申请边界

- 用户决定现有中文 CV 自行在 TeX 中手动调整。旧稿自动重排已关闭，避免额外模型费用；英文稿、中文旧稿和当前申请表均不会被维护心跳触发重新生成。
- v12 的 JD 职责分组、两页内容下限、固定外层顺序、项目间距、教育分块、ATS 顺序和禁止条目跨页验收只约束以后新生成或用户明确要求重做的 CV。
- 这次修复针对用户截图中的真实问题：专业技能跑在教育前、教育条目粘连、项目之间没有留白、项目标题或 bullet 跨页、第二页大面积空白。上述任一问题今后都不能显示“初稿可用”。
- Teza Technologies 的岗位专属英文 PDF 已生成并在 Ashby 页面通过顶部 Autofill 上传，文件名为 `Teza_Quantitative_Researcher_Xinyu_Zhang.pdf`；用户随后切换到 CV 质量修复。Teza 页面尚未提交，邮箱和电话仍需在恢复表单任务后核对。其他五个真实申请表保持在最终 Submit 前。

## 2026-08-27 最高优先级交接：Autofill 0.6.1、十岗确认批次、跨地点岗位去重与 CV 队列自愈

> 本节是当前最高权威，覆盖下方仍写着 Autofill `0.5.0`、旧 CV Prompt、失败后回到“等待启动”、页面必须保持打开或旧批次交互的内容。下方历史章节只用于追溯，不得据此回退。

### 1. 当前生产与代码锚点

- 生产 Site：`https://ivy-job-radar.rourou1199.chatgpt.site`。多地点岗位去重修复已进入当前代码；生产版本号应以 Sites 部署记录为准。
- GitHub `XinyuIvy/ivy-job-radar@main` 当前代码锚点为 `43de45f`（`Run CV recovery from extension heartbeat`）。
- Chrome 扩展已经升级到 `0.6.1`，`browser-extension/manifest.json` 已核实为 `0.6.1`。用户 Mac 上原仓库因缺失 Git objects 无法正常 pull，已通过浅克隆干净副本并替换原目录完成修复；用户已经在 Chrome Reload 并确认 0.6.1 正常。旧目录备份仍保留为 `ivy-job-radar-backup-20260827`，暂时不要删除。
- 用户固定扩展路径保持 `/Users/ivyzhang/Documents/Development_Projects/ivy-job-radar/browser-extension`。扩展最多同时处理两个获批申请页面，所有页面保留给用户检查，任何情况下都不点击最终 Submit。

### 2. 十个岗位待确认批次

- 自动筛选先给出最多 10 个 `awaiting_user_approval` 岗位；用户统一确认前不创建 CV、不填申请表。
- 每张卡片已有红色描边按钮“永久排除并补一个”。点击后卡片应立即消失，后面的岗位即时上移；服务端把岗位写入永久排除记录，并把下一个满足同样硬门槛的岗位补到最后一位。补不到合格岗位时显示实际数量，不降低标准凑数。
- 用户可以连续排除不想要的岗位；只有最终保留的整批岗位才统一确认并生成 CV。
- JD 展示与 CV 输入都必须经过 `extractCoreJobDescription`：解码重复 HTML entities、删除 HTML 标签并整理空白，禁止把 `&lt;h3&gt;`、`&quot;`、`&#39;`、`&nbsp;` 等乱码送入页面或 CV Prompt。
- 已收藏、待申请、已申请或历史申请过的同公司同岗位不得重新进入批次。当前保护同时使用精确岗位身份和 `sameCompanyRole`，CV prepare 前还会再次阻止重复申请历史。

### 3. Twitch 多地点重复岗位：已核验为同一岗位，只申请一次

- 2026-08-27 核对 Twitch 官方 Greenhouse 后确认，下面三个页面虽然 URL 和页面顶部地点不同，但属于同一个内部职位：
  - San Francisco：`https://job-boards.greenhouse.io/twitch/jobs/8623477002`
  - New York City：`https://job-boards.greenhouse.io/twitch/jobs/8625665002`
  - Seattle：`https://job-boards.greenhouse.io/twitch/jobs/8625664002`
- 三个页面的雇主内部 Job ID 都是 `TW9226`，均为 Monetization 团队的 Data Scientist；About the Role、职责、资格、Bonus、三地薪资和申请问题完全一致。正文明确写着可在 San Francisco、New York 或 Seattle 工作。
- 结论：只能保留一个候选卡片并提交一份申请；地点在同一申请表内选择，不得为三个 Greenhouse posting ID 分别生成三份 CV 或重复申请。
- 原因已确认：旧 `extractStableJobId` 只读取 Greenhouse URL path，因此把 `8623477002`、`8625665002`、`8625664002` 当成三个不同岗位。
- 修复已实现：`extractEmployerJobId` 会从解码后的完整 JD 读取雇主内部 Job ID / Requisition ID，并在 URL posting ID 之前作为强身份。本例三页都解析为 `employer:tw9226`。解析使用完整规范化 JD，不会因为 `Equal Opportunity` 尾部裁剪而漏掉紧随其后的 Job ID。
- `sameLogicalJob` 现在会在同公司内部编号相同时合并不同 URL 和不同地点；内部编号不同则保持为不同岗位。内部编号缺失时，只有“公司 + 标准化标题一致、清洗后完整 JD 精确一致、正文明确为多地点”三项同时成立才合并，避免仅凭相同通用标题误杀不同 requisition。
- 自动批次 `POST /api/application-automation` 会先按上述逻辑对候选池去重，再保留最多 10 个；旧批次中的重复 task 会取消并由下一个合格岗位补位。`approve_batch` 另有第二道批内去重门禁，即使旧数据绕过候选去重，也只能创建一份 application/CV。
- 回归测试覆盖 Twitch 三个 Greenhouse 页面、不同内部 Job ID 不合并、缺失内部 ID 的保守多地点 fallback，以及候选批次与确认批次双重门禁。

### 4. 新版 CV Prompt 与全部待申请 CV 重生成

- `2f32e04` 已把 CV 规则拆为共同招聘规则、中文专属规则和英文专属规则。生成中文时只注入中文写作合同；生成英文时只注入英文写作合同，禁止两套语言规则互相污染。
- 新 Prompt 增加：硬门槛/核心职责/强优先项/普通关键词分级；行业资深 HR 差距审查；二次调用事实母版与 canonical indexes；模拟三个最可能拒绝理由；Summary、Skills、前三条核心 bullet 的 10 秒扫描；资格、证据、岗位定位、语言、PDF 五项门禁；PDF 有合理空余时补最相关且状态准确的论文；严格禁止编造经历、数字、影响、生产部署或论文状态。
- `852ce58` / `d0948b6` 已加入“重新生成全部待申请 CV”能力。只处理状态为“准备材料”的现有申请，沿用每份原语言和原模板，旧自动初稿重新入队；不得触碰已定稿或已投递版本。
- 本轮最初有 9 份待申请 CV；Ōura Research Scientist 因已有申请历史应被移出，所以真实待继续生成的数量为 8。运行时数量是易变状态，下一 Chat 必须读取真实 D1 记录与 R2 artifact 后再报告，不得照抄旧数量。

### 5. CV 失败状态机与真实后台边界

- 原 Bug：`failed_retryable` 被普通 queue 接口无条件改回 `queued`，导致页面把失败伪装成“等待启动”；同时每 5 秒对每份 CV 分别诊断，制造重复请求和 TPM 限流。该问题已由 `294c4b6` 修复。
- 当前合法语义：失败必须保留错误码、失败阶段、attempts 和更新时间；只有任务被真正 claim 并开始恢复时才改变运行状态。达到 7 次自动尝试后进入 `failed_terminal`，显示“失败，需处理”，不得再回到“等待启动”。
- 恢复为严格串行：只在没有 `preparing_bundle` / `agent_queued` / `agent_running` 活跃任务时领取最早的一份；限流至少退避 60 秒，服务器拥堵至少 30 秒，其余指数退避；第 6 次以后切回高容量恢复配置。90 秒未完成的 fallback claim 会释放；OpenAI response 超过 2 小时会按僵死任务诊断。
- `43de45f` 已把 `recoverTransientCvJobs` 接到扩展的自动投递 heartbeat。0.6.1 扩展每 5 分钟调用一次队列接口，因此 Job Radar 网页关闭后仍可推进，但前提是用户的 Chrome 正在运行且扩展没有被停用。
- 重要纠正：仓库中已验证的持续推进机制是 Chrome 扩展的 5 分钟 heartbeat；本次未发现独立于 Chrome 的服务端小时级 cron/监控实现。后续不得再笼统承诺“我会一直监控”或“独立每小时巡检”，除非先核实对应 automation/cron 真实存在并能读取生产任务状态。
- 最近一次对话内观察曾显示 Deloitte CV 已生成，Precision AQ 因 TPM 限流进入第 3 次恢复，其余顺序排队；这不是最终完成证明。成功标准必须是每个目标 application 的 `cv_prebuild_jobs.status = ready`，并且对应 PDF、TEX、文本与 review artifact 在 R2 中真实存在、可读取。只看到 `agent_running` 或状态变化不算成功。

### 6. 下一位 Agent 的执行顺序

1. 先查询生产 D1 与 R2，逐份列出当前 8 份目标 CV 的 application/job、状态、attempts、最后错误、response age 和 PDF/TEX artifact 是否真实存在；不要先看汇总数字。
2. 对仍失败的任务按具体错误修复，确认一份 artifact 完整后再推进下一份；不得用 `failed -> queued` 隐藏错误。
3. Twitch `TW9226` 跨地点聚合与 approve 前二次去重已完成；后续不得回退到仅按 Greenhouse URL posting ID 去重。
4. 只有全部目标 CV 的 PDF/TEX 均真实可用，或出现必须由用户处理的权限/配置/事实缺失，才能向用户报告最终状态。仍然禁止自动点击 Submit。

### 7. 2026-08-27 十份新批次 CV 同时失败：共同根因与修复

- 生产 D1 核验显示，新确认批次的 application rows `60–69` 对应 10 份 CV。9 份停在 `failed_retryable / CV_FALLBACK_START_FAILED`，1 份曾进入 `agent_running`；同一时刻生产日志记录 10 个 `POST /api/cv-prebuild/prepare` 全部返回 500。它们没有进入 PDF 编译或文件保存阶段。
- 共同根因不是 10 个岗位各自内容有问题，而是 `approveApplicationAutomationBatch` 使用 `Promise.allSettled` 同时启动整批。10 个请求并发向 `XinyuIvy/job-application-archive` 的 `main` 写入 PRECV bundle，GitHub 对陈旧 parent 的非快进 ref 更新产生冲突；未成功写入 bundle 的任务随后被 fallback 恢复器读取，因归档文件不存在再次失败，最终只留下笼统的 `CV_FALLBACK_START_FAILED`。
- 修复后的整批流程只启动第一份 CV，其余保持 `queued` 并严格串行。网页的 10 秒 CV task 轮询和扩展的 5 分钟 heartbeat 都会在没有真实活跃任务时领取下一份；`failed_retryable` 不再被误算成运行锁。
- 私有归档写入改为 optimistic retry：blob 只创建一次，ref 更新遇到 GitHub 409/422 时重新读取最新 `main`、基于最新 tree 重建 commit，指数退避并最多尝试 8 次。并发请求即使发生，也不应再让整批材料包丢失。
- `/api/cv-prebuild/prepare` 增加并发幂等门禁：同一 generation 已在 `preparing_bundle` / `agent_queued` / `agent_running` / `ready` 时直接复用，不得再启动第二个 Responses run；启动失败会保留 OpenAI 或 GitHub 冲突阶段，而不是统一覆盖成一个无信息错误。
- “按最新 Prompt 重新生成全部 CV”现在会重新排队失败任务；仍在生成或已经 ready 的同 Prompt 任务不会被覆盖。部署后必须先调用该动作修复本批遗留的缺失 bundle，再确认系统只启动一份并逐份推进。
- 回归门禁新增：整批前端不得再出现 `Promise.allSettled(queuedJobIds.map(...prepare...))`；task polling 必须调用 `getNextPendingCvStart`；归档 ref 冲突必须有重试。当前本地验收：75 个 Node 测试、265 个 Python 测试、ESLint 和 production build 全部通过。

### 8. 2026-08-27 重复与相似岗位 CV 复用

- CV prepare 现在先查询同语言、同 track、同模板且已有完整五件套 artifact 的历史成功版本，再决定是直接复用、以旧稿为底稿修改，还是完整新生成。不得跨语言、跨模板或跨岗位方向硬套。
- 精确复用只允许在标准化公司名和岗位名相同，并且 JD SHA、事实母版 SHA、Prompt version 全部相同时发生。系统会再次核实 TEX、PDF、纯文本、review 和 application decision 五个 R2 对象都真实存在；任一缺失就不能把任务标成成功。满足条件时五件套直接复用，不启动新的模型生成，也不产生模型 token。
- 精确复用会为新岗位建立独立 conversation，避免后续 CV Chat 修改串到旧岗位；artifact 可以安全引用历史不可变对象。新任务仍有自己的 generation、状态和审计记录。
- 非精确但岗位标题高度相似时，系统只把上一份 TEX 和 review 当作 revision seed。当前 JD 与冻结事实仍是最高权威，模型必须逐段重新判断、删除无关内容、重写岗位定位与首批核心 bullets，并重新生成 review、application decision、TEX、PDF 和纯文本，不能只替换公司或岗位名。
- 相似底稿不按“最近完成”选择。候选先限制为同语言、同 track、同模板，再按标题岗位族 `55%`、清洗后完整 JD 的职责/技能词集合 `30%`、职级兼容 `10%`、事实母版与 Prompt 兼容 `5%` 计算总分。标题相似至少 `0.60`、职级相似至少 `0.25`、JD 相似至少 `0.18`（标题几乎一致时可豁免）且总分至少 `0.60` 才能作为 seed。
- 排序严格以总分、标题、JD、职级为先；同公司只在完全同分时破同分，完成时间不参与选择。仍完全同分时用稳定的历史 row ID，确保相同输入始终指向同一份底稿，而不是每次因“最近一份”变化。
- Reference library 按语言、track、模板和岗位族分别维护 6 个稳定槽位：产品/实验 Data Science、ML/Research Scientist、Pharma/Biostatistics、Clinical/Neuro research、Quant research、Consulting/Analytics。纯软件工程本来就不属于自动申请目标，不为它建立 Reference；一般 Analytics 归入产品/实验 Data Science。
- 每个槽位第一份五件套完整的高匹配历史 CV 会被晋升为 Reference；如果没有合格历史 CV，则该岗位完整生成成功后晋升。槽位一旦建立，后续同族岗位只从该稳定 Reference 起稿，不因新增一份更近的历史 CV 自动漂移。Reference 只负责结构和已核验表达，当前 JD 与事实母版仍是最终权威。
- 现有完整 CV 会自动初始化空的 Reference 槽位：优先 ready、当前待申请、生成尝试较少且输出完整的稿件，再以稳定行号打破并列。网页轮询、扩展自动化心跳和维护心跳均执行同一幂等初始化。
- CV 语言严格以完整 JD 为主：中文 JD 用中文母版，英文 JD 用英文母版。region 完全不参与语言判断；岗位标题只在 JD 缺失或过短时备用，自动化默认语言只在正文和标题均无法判断时回退，用户明确手选语言仍可覆盖。心跳会自动取消语言错误的 Reference，将仍在待申请的错误稿标为 stale，并用正确语言重新排队。
- Reference 只提供起稿结构。Seeded revision 必须读取 `prebuild_prompt.txt`，按顺序执行其中每一轮检查，并在 `cv_review.md` 逐轮记录发现与修改或无需修改的决定；缺少任一轮或任一五件套产物都视为未完成。只有完全相同 JD、事实版本和 Prompt 版本的 exact duplicate 可直接复用已核验五件套。
- 本批遗留的裸 `CV_FALLBACK_START_FAILED` 且没有 OpenAI response ID，代表 PRECV bundle 从未成功保存。它现在不再重复走必然失败的 fallback 读取，而是由串行队列重新调用 `/api/cv-prebuild/prepare`，先补齐 bundle，再进入上述复用或生成判断。
- 批量重建可能遗留一个无 generation key 的 queued 占位行。如果同一 job 已有当前 Prompt 且五件套完整的 `ready` generation，串行领取器必须跳过该占位行，防止已成功岗位被反复挑中并挡住后面的任务。
- Prepare 幂等门禁只能短路 `preparing_bundle`、`agent_queued`、`agent_running` 和 `ready`。失败 generation 即使保留旧 response ID，也必须允许显式重建；不得仅凭 response ID 存在就把失败任务误判为仍在运行。
- 当前本地验收：85 个 Node 测试、265 个 Python 测试、ESLint 与 production build 全部通过。回归覆盖精确复用、相似岗位 seed、不同岗位 fresh、稳定岗位族 Reference、旧 artifact 缺失安全回退、缺失 bundle 重新进入 prepare、成功任务遗留占位行不阻塞队列，以及失败 generation 可重新启动。

### 9. 2026-08-27 十岗批次只有一次确认，CV 完成后直接自动填表

- 用户确认的权威流程是：先逐个筛选并整批确认最多 10 个岗位；随后生成全部 CV；CV 五件套完成后直接进入 Chrome 扩展自动填表；扩展填完并上传对应 PDF 后把页面保留在最终 Submit 前，由用户浏览并手动提交。整批确认是唯一的申请授权，CV 完成后不得再增加 AI 审核或第二次确认。
- 旧错误把 `application_decision.json` 当成第二道申请门禁。它会把 CV 已完成的任务转成 `ai_review_required / needs_review` 或 `ai_hard_filter / screened_out`，并把后者的 application 从“准备材料”退回“收藏”。因此生产 application rows `60–69` 的 10 份英文 CV 虽然五件套全部完成，页面却只显示 4 至 5 条待处理记录。
- 修复后，结构化 decision 只作为审计信息保存，不能改变用户已经确认的批次授权。任何已确认任务只要 ready 且 TEX、PDF、正文、review、decision 五项完整，就直接进入 `ready_for_browser / cv_ready_for_autofill`；既有 `ai_decision_missing`、`ai_decision_approved`、`ai_review_required`、`ai_hard_filter` 记录会自动恢复，application 回到“准备材料”，不会重新生成已完成的英文 CV。
- `needs_review` 只允许表示浏览器已经真实填写表单并停在最终提交前，界面文案改为“表单已填，待你提交”。它不得再表示 CV 的 AI decision 需要第二次批准。
- 已有当前 Prompt 完整 ready generation 时，遗留的无 generation key queued 占位行会标为 stale，并记录 `SUPERSEDED_BY_READY_CV`，防止成功岗位继续显示“待生成”或被重复生成。
- 硬筛、重复申请检查和批内去重必须在待确认批次生成及用户确认动作中完成。用户确认后不再重新运行候选硬筛，也不得因 CV 内容保守或事实不足擅自把岗位退回收藏。最终 Submit 始终由用户手动完成。
- 已确认任务提供“取消并不再推荐”。取消后 automation task 进入 `cancelled / user_cancelled_after_approval`，application 进入“撤回”，岗位写入永久排除并从保存队列移出；既有 CV 五件套保留用于审计，不删除、不重生成。该动作适用于用户确认后才发现地点或岗位不合适的情况。

## 最高优先级交接：Autofill 0.5.0 受控自动投递已接入，CV Prebuilder 输出结构化申请决策

> 本节是 2026-08-26 当前最高权威，覆盖下方所有仍写着“Workspace Agent”“API channel”“conversation_url”“下一阶段接入 Agent”“尚未自动生成 CV”“不自动投递”或其他旧 next step 的章节。旧内容只用于追溯，不得回退到 Workspace Agent 方案，也不得重新建立另一套自动填表、CV 定制或投递流程。

### 自动投递当前权威架构

- 每日美国岗位扫描完成后，`POST /api/application-automation` 使用确定性硬门槛筛选候选：只接收已开放、完整 JD、初筛达到阈值、岗位标题明确属于已确认目标方向且 ATS 位于 Greenhouse/Lever/Ashby 白名单的美国岗位；明确超过 3 年经验、拒绝 sponsorship、要求美国公民/U.S. Person/ITAR/Security Clearance、标题含糊、ATS 不支持、排除职级或排除方向的岗位直接记录为 `screened_out`，不调用 CV API。
- 自动筛选改为固定 10 个一批。符合硬门槛的岗位先以 `awaiting_user_approval` 展示公司、岗位、匹配理由和数据库中保存的完整 JD；用户确认整批前不创建申请记录、不调用 CV API，也不打开浏览器表单。不足 10 个合格岗位时显示实际数量，不用低质量岗位补齐。
- 用户点击“确认这批并开始投递”后，本批才创建或激活申请记录，并行启动对应岗位英文 CV。Responses API 同时产出 `application_decision.json`；只有 `eligible=true`、`recommended_action=apply`、置信度至少 `0.8` 且 `hard_blockers` 为空时，任务才进入浏览器队列。
- D1 `application_automation_config` 保存开关、pilot/automatic 模式、固定批量 10、最低分、默认语言、ATS 白名单和最终提交开关；`application_automation_tasks` 保存批次待确认、CV、浏览器 claim、异常、提交回执与重试状态。任务状态在 `/` 底部“自动”页统一查看；该总览本身会轮询 Responses 状态、解析结构化决策并推进最多 200 条任务，不再依赖扩展先启动才更新，也不得把推进范围缩小到列表显示范围以下。
- Chrome 扩展已升级到 `0.5.0`。后台每 5 分钟领取一个已批准任务，打开精确岗位链接、填写空白字段、添加权威重复记录并上传该岗位的预生成 PDF。验证码、登录、敏感必答题、开放题、缺失必填项、非 CV 附件和不唯一提交按钮全部转入 `needs_review`，不猜答案、不绕过限制。
- 前 5 份强制使用受控试运行：扩展完成填写和上传后停在最终提交前，由用户检查真实表单并提交，再在总览确认。服务端在不足 5 份已确认样本时拒绝开启 automatic/final submit。之后也只允许 Greenhouse、Lever、Ashby 白名单页面在所有页面级检查通过且能识别成功回执时自动提交。
- 扩展私有桥接继续使用由 `IVY_JOB_RADAR_SYNC_TOKEN` 派生的 Autofill key；不向浏览器发送 OpenAI key、GitHub token 或 R2 key。失败 claim 30 分钟后自动释放；自动提交只有检测到成功确认页才记录为“已申请”。
- GitHub workflow `daily-us-jobscan.yml` 已恢复每日 `10:00 UTC` 调度，并在岗位回写后准备下一批待确认岗位；它不会在用户确认前调用 CV prepare。网站“生成下一批 10 个”触发相同幂等流程。
- 当前验收：60 个 Node 测试、261 个 Python 测试、ESLint、production build、扩展 JavaScript syntax、workflow YAML 和 Drizzle 无漂移检查全部通过。扩展备用包为 `/ivy-job-autofill-0.5.0.zip`。

### 最新申请固定资料架构

- 原“个人资料”页已改为“申请固定资料”，删除目标岗位、目标行业、职业概述、技能清单和基础 CV 上传等重复入口。
- D1 `user_profiles.autofill_profile_json` 保存中美电话号码、美国邮寄地址、中文籍贯/出生地/性别、姓名与链接、工作授权、固定选择题、奖项、论文、语言及用户自定义固定问答；`/api/profile` 只允许当前 ChatGPT 登录用户读写。
- Autofill 的 global profile 路由会把 D1 固定资料合并到 CV 仓库的 global application profile。固定资料以网站保存值为准；教育、工作经历、项目、技能和岗位定制描述仍从 CV 事实库及当前 APP 最终 CV 读取。
- Chrome 扩展 `0.5.0` 继续提供“中文资料 / English profile”显式选择并记住上次选择；姓名、电话、邮箱、籍贯、出生地、已确认性别、奖项说明、论文作者顺序与论文说明按所选语言填写。仍只填空白，除已在固定资料中明确确认的出生日期、民族和性别外不填敏感 EEO 字段。最终提交边界以本节“自动投递当前权威架构”为准。
- 当前 owner profile 采用一次性 `dataRevision` 迁移：登录个人资料页或扩展读取 global profile 时，会把中英文姓名与两套电话号码、已确认的籍贯四川成都、出生地辽宁沈阳、性别女、三项奖项、11 项论文/手稿、已发表论文 DOI、双语说明和已核验 JCR 分区写入 D1。中科院/CCF 无可靠依据时保持空白，通用论文等级使用最佳已核验等级。
- 用户固定扩展目录仍为 `/Users/ivyzhang/Documents/Development_Projects/ivy-job-radar/browser-extension`，更新方式仍是 `git pull origin main`、Chrome Reload、刷新申请页。备用下载包为 `/ivy-job-autofill-0.5.0.zip`。

### 0. Phase 3 当前权威架构与费用边界

- 用户确认的最终交互是：新收藏岗位后自动后台生成第一版 CV；每个岗位拥有独立且长期保存的 CV Chat；生成后可直接看 PDF，并继续发送修改要求。
- 实现使用 OpenAI Responses API background mode、durable Conversation、hosted shell 和 R2，不使用 Workspace Agent API channel。D1 保存岗位级 conversation、response、状态、token usage 和完整消息历史；R2 保存每一版 `cv_draft.tex`、`cv_draft.pdf`、`cv_draft.txt` 与 `cv_review.md`。
- 新收藏只自动触发一次。重复收藏或重复请求复用同一 `generation_key`，不得重复产生首版费用。已有历史收藏不批量补跑，只显示“生成 CV 初稿”，由用户手动决定是否调用 API。
- 默认模型为 `gpt-5.6-terra`，优先使用 `service_tier=flex`；若该组合在请求创建前返回 400，仅去掉 Flex 重试，不自动切换到更贵模型。
- 打开页面、读取聊天记录、轮询进度、查看 PDF 和下载文件均不产生模型 token。只有新收藏的首版，以及用户在岗位 CV Chat 中明确点击“发送修改要求”时调用 OpenAI API。
- ChatGPT Work / Codex 中的开发、审查和普通对话使用用户订阅能力，不得调用 Site 的 API key。`OPENAI_API_KEY` 只保存在 Site secret，禁止发送到浏览器、GitHub、日志或接口响应。
- 首版输入文件按静态事实库、canonical indexes、母版、岗位记录、完整 JD、Prompt 的顺序发送，以便复用 prompt caching。完整 JD 仍是岗位要求的主权威，严禁编造事实。
- Hosted shell 只负责本次 TeX/PDF 编译；container 文件必须在容器有效期内下载并写入 R2，后续对话从 R2 读取当前 TeX 和审校记录。
- PRECV 仍是临时预览，不创建 application / APP ID，不自动提交，不写 `cv_customized_<APP-ID>` 或 `cv_submitted_<APP-ID>`。正式定稿与投递边界继续保留人工确认。
- Phase 3 新增路由：`/api/cv-prebuild/status`、`/api/cv-prebuild/chat`、`/api/cv-prebuild/artifact`，以及岗位页面 `/cv-prebuild/<jobId>`。收藏权威入口仍是 `/api/saved-jobs`。
- Phase 3 本地验收为 45 个 Node 测试、252 个 Python 测试、lint、production build 与 Drizzle 再生成无漂移全部通过。Site secret 中已有受保护的 `OPENAI_API_KEY`，客户端代码和接口响应均不包含 key。

### A. 当前版本与验收锚点

- Ivy Job Radar 生产 Site：`https://ivy-job-radar.rourou1199.chatgpt.site`
- Autofill 0.4.11 的历史生产代码锚点是 Site version 137；当前扩展已升级到 0.5.0。
- Chrome 扩展版本：`0.5.0`，弹窗顶部应显示 `AUTOFILL V5.0`。
- GitHub `XinyuIvy/ivy-job-radar@main` 的 0.4.11 同步提交：`28ffa555a475625550bb94add3b4c7534ca4633f`。
- 全局自动填表资料：`XinyuIvy/CV@main:master/application-forms/application-autofill-profile.md`。
- 期刊评级资料写入提交：`1fdc36caa9d9bd8282388c6fa44a50fd07ee7d97`。
- 发布前验收：32 个前端/运行时测试、235 个 Python 测试、lint 与生产 build 全部通过。
- 用户固定扩展目录：`/Users/ivyzhang/Documents/Development_Projects/ivy-job-radar/browser-extension`。以后继续使用 `git pull origin main`、Chrome Reload、刷新申请页，不要求反复下载 ZIP。

#### A.1 2026-08-22 最新站点修复

- CV Prebuilder Phase 2 已完成：新增服务端 `/api/cv-prebuild/prepare`，只允许真实收藏且仍开放、含完整 JD 的 job row 创建私有 PRECV bundle；job record、完整 JD、事实母版、展示规则、六个 canonical indexes 与临时推荐母版全部冻结在同一个精确 CV commit。代码锚点为 Site version 145 / commit `c2e0a96`，GitHub `main` 同步提交为 `a1af0cd056ef78aa0871716a2e62f021658459b9`，私有归档合同提交为 `3c229e1dd974a9628d0acc4fc38c23314e0274a6`。
- Phase 2 使用覆盖稳定岗位身份、JD SHA-256、母版、CV commit、事实母版 SHA 与 Prompt version 的唯一 `generation_key` 保证幂等；D1 允许同一岗位保留多个 generation，旧输入标记 stale，仍只允许一个无 generation key 的占位行。重试可恢复停在 `preparing_bundle` 的同一 generation，API 不返回私有 bundle URL、token 或上游错误正文。
- Phase 2 没有创建 applications 记录或 APP ID，没有写任何 `cv_customized` / `cv_submitted` 文件，没有创建 Agent，也没有调用 Workspace Agent / OpenAI API。下一 Chat 必须从 Phase 3 创建并发布 Workspace Agent 开始，不得重复 Phase 0–2，也不得提前进入 Phase 4 的收藏自动触发。
- Phase 2 验收为 42 个 Node 测试、248 个 Python 测试、lint、production build、Drizzle 再生成无漂移和 Phase 1 到 Phase 2 migration 模拟全部通过。
- CV Prebuilder Phase 1 已完成：新增 `cv_prebuild_jobs` D1 状态表、安全 migration、收藏状态初始化/取消和候选岗位 badge。代码锚点为 Site version 143 / commit `9f37143`，GitHub `main` 同步提交为 `ba0f5614bbab7749b6bfc83e02aa05a676375c1f`。本阶段没有调用 Agent、没有创建 PRECV bundle、没有自动生成或提交 CV，后续只把它作为状态层回归边界。
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

#### Phase 2：已完成，保留为 PRECV bundle 回归边界

- `/api/cv-prebuild/prepare` 从真实收藏的 job row、完整 JD、推荐临时母版与一个精确 CV commit 创建私有 PRECV bundle。
- bundle 固定包含 `job_record.yaml`、完整 `jd_snapshot.md`、事实母版、展示规则、六个 canonical indexes、`cv_base.tex` 与 `prebuild_prompt.txt`，全部 CV 权威文件来自同一冻结 commit。
- 不创建 applications 记录，不分配最终 APP ID，不生成最终 TeX/PDF，不调用 Agent；私有归档仓库的 `docs/PREBUILD_BUNDLE_CONTRACT.md` 是跨仓库合同。
- `generation_key` 唯一约束、generation 历史、stale 切换、重试恢复和私有错误边界均已完成。Phase 3 必须直接复用此 bundle，不得另造一套 Agent 输入格式。

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

任务二：按 Phase 3 继续 CV Prebuilder Agent。Phase 0 的收藏权威持久化、Phase 1 的 `cv_prebuild_jobs` 状态层和 Phase 2 的 PRECV bundle、稳定 `generation_key` 与临时母版选择都已经完成，不要重复实现。下一步只创建并发布 Workspace Agent，继承 H 节硬规则并复用现有 PRECV bundle；只有这一阶段需要用户完成一次 API channel 与 access token 安全设置。Phase 3 先手动验证一个用户确实收藏的真实岗位，仍不接收藏自动触发；trigger 和状态轮询留到 Phase 4。

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
