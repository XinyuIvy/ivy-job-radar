# Ivy Job Radar

Ivy Job Radar 是一个面向个人求职者的端到端求职工作台。它把岗位采集、官网核验、去重与筛选、CV 母版选择、岗位定制 CV、申请表自动填写、申请状态追踪和面试跟进放在同一套流程里。

这个项目目前按单用户、私有数据和人工最终确认设计。它不是招聘平台，也不是无需配置即可直接使用的 SaaS。要完整运行，使用者需要部署自己的站点，并准备自己的 CV 仓库、私有申请档案仓库和访问凭据。

## 核心流程

```text
岗位采集
  -> 官网与完整 JD 核验
  -> 去重、硬条件筛选和匹配排序
  -> 收藏
  -> 选择语言与 CV 母版
  -> 待申请并生成岗位定制 CV
  -> Chrome 扩展填写申请表并上传 CV
  -> 人工检查和提交
  -> 申请、面试、Offer 或拒绝状态追踪
```

## 当前功能

### 1. 多来源岗位采集

- 美国岗位通过 GitHub Actions 定时运行，整合 JobSpy、公开招聘聚合页、目标公司官网和 ATS。
- 公司官网扫描器支持 Greenhouse、Lever、Ashby、Workday、BambooHR、iCIMS、Paylocity 及部分结构化招聘页面。
- 中国岗位支持 BOSS 本地采集器、公开招聘索引、公司官网及手动导入。
- Chrome 保存岗位工具可以从当前 JD 页面提取公司、职位、地点、完整 JD 和申请链接。
- 采集任务保留各来源的成功、受限和失败状态，不会把来源异常误报成“没有岗位”。

### 2. 岗位核验、去重与筛选

- 优先保留仍可从官方申请页确认开放且具有完整 JD 的岗位。
- 按 canonical URL、招聘 requisition ID、公司和职位身份进行去重。
- 识别经验年限、职级、工作授权、Sponsorship、地点、学历和核心技能等硬条件。
- 匹配分用于排序，不会单独把可申请岗位挡掉。
- 被永久排除的岗位进入“不再推荐”，以后扫描不会重复出现，并且可以手动恢复。
- 人工收藏、申请和排除行为可形成候选筛选规则，规则必须人工批准后才会影响后续评分。

### 3. 收藏、待申请与 CV 自动生成

- 收藏只保存岗位，不调用生成 API。
- 从收藏进入待申请时，先选择中文或英文以及具体 CV 母版。
- CV 母版清单每次从 `XinyuIvy/CV` 的 `master/template-cv/` 目录读取，不需要在 Job Radar 中手动维护文件名列表。
- 系统冻结完整 JD、事实母版、结构化事实索引、所选 CV 母版及其 Git commit，确保之后可以复现当时的申请材料。
- 每个岗位拥有独立 CV 工作区，可查看 PDF、TeX、纯文本、审校记录和后续对话修改历史。
- 待申请 CV 可以按最新 Prompt 批量重新排队，但已经提交的申请继续使用对应申请档案中的冻结材料。

### 4. 申请档案与状态追踪

- 每份正式申请使用稳定的内部 `APP-ID`，与招聘网站自己的 requisition ID 分开保存。
- 申请档案记录公司、职位、链接、状态、投递日期、截止日期、下一步行动、CV 母版和备注。
- 支持准备材料、已申请、各轮面试、Offer、撤回和拒绝状态。
- 拒绝岗位从“我的申请”主列表移出，单独保留在拒绝记录中。
- 支持任务、联系人、面试时间、感谢信和后续跟进日历。
- 已申请岗位可以修改公司名、职位名和绑定的 CV 母版，同时保留原 APP-ID 与 JD。

### 5. Chrome 申请表自动填写

当前扩展版本为 `0.6.9`，完整说明见 [browser-extension/README.md](browser-extension/README.md)。

- 可选择某个已申请岗位的冻结资料，也可直接选择 GitHub 上的实时 CV 母版。
- 填写姓名、联系方式、地址、教育、工作经历、项目、论文、获奖、语言、链接和 Skills 等字段。
- 支持普通输入框、原生选择框、ARIA combobox 及动态重复区块。
- 页面没有 Project Experience 时，可自动把 CV 项目逐条填写到 Work Experience，并标记为 Part-time 或兼职；也可以在扩展中手动指定填写位置。
- 只填写空白字段，不覆盖用户已经输入的内容。
- 仅向 Resume/CV 上传控件上传 PDF，不会把 CV 填入求职信、成绩单或作品集控件。
- 最终 Submit 永远由用户点击。验证码、登录、法律声明、无法确认的问题和敏感字段会留给人工处理。

### 6. 美国岗位批量辅助申请

- 每批最多选择 10 个符合硬条件和最低匹配分的美国岗位，不会用低质量岗位强行补满。
- 用户先查看完整 JD 并确认整批，之后才生成 CV 和进入浏览器填写队列。
- Chrome 扩展最多使用两个 worker 处理申请页，完成后保留全部页面供人工检查。
- 系统不会自动进行最终提交。用户确认实际提交后，才会把任务标记为已投递。

### 7. 数据与隐私边界

- D1 保存岗位、申请、状态历史、任务、面试、联系人、筛选反馈和自动化状态。
- R2 保存生成过程中的 CV 工件和决策文件。
- `XinyuIvy/CV` 或使用者自己的 CV 仓库保存事实母版、CV 母版和固定申请资料。
- 私有申请档案仓库保存每个 APP-ID 的冻结 JD、冻结事实、母版快照、定制 CV 和实际提交 CV。
- 浏览器扩展只保存站点连接、语言选择和本地回退资料，不保存 GitHub token。
- SSN、密码、金融凭据和证件号码不会被保存或自动填写。

## 技术架构

| 层 | 技术与职责 |
|---|---|
| Web 应用 | Next.js 16、React 19、TypeScript、Vinext |
| 部署运行时 | Cloudflare Workers，通过 OpenAI Sites 管理 |
| 持久化 | Cloudflare D1 和 R2 |
| 数据访问 | Drizzle ORM |
| 岗位采集 | Python、GitHub Actions、本地 macOS 采集器 |
| CV 生成 | OpenAI API、私有 GitHub CV 与申请档案仓库 |
| 浏览器自动填写 | Chrome Manifest V3 扩展 |
| 身份验证 | Sign in with ChatGPT 和 Sites 访问控制 |

## 仓库结构

```text
app/                       Web 页面、API 和业务逻辑
browser-extension/         Chrome 自动填写扩展
config/                    美国和中国搜索关键词与来源配置
db/                        D1/Drizzle schema 与运行时初始化
docs/                      采集、CV、申请档案与数据契约
drizzle/                   数据库迁移
local-collector/           macOS 中国岗位本地采集器
scripts/                   岗位采集、官网核验、合并和构建脚本
tests/                     TypeScript/JavaScript 与 Python 测试
.github/workflows/         定时扫描和 CI
.openai/hosting.json       Sites 的 D1 与 R2 绑定声明
```

## 准备自己的数据仓库

完整功能依赖两个外部仓库。Fork 本项目时应替换代码中的作者仓库名，并配置对应 token。

### CV 仓库

至少需要以下结构：

```text
master/
├── FACT_MASTER.md
├── template-cv/
│   ├── CV_General_EN.tex
│   ├── CV_General_EN.pdf
│   └── ...
├── application-forms/
└── project-evidence/
```

母版选择器会实时扫描 `master/template-cv/` 下的 `.tex` 文件。自动上传需要同名 `.pdf`。文件名中的 `EN`、`中文`、行业关键词和岗位关键词会用于语言与方向识别。

### 私有申请档案仓库

每份申请使用下面的目录：

```text
applications/<year>/<APP-ID>/
```

其中保存冻结 JD、事实快照、`cv_base.tex`、岗位定制 CV、实际提交 CV 和 Autofill packet。详细契约见 [docs/APPLICATION_ARCHIVE_CONTRACT.md](docs/APPLICATION_ARCHIVE_CONTRACT.md)。这个仓库必须保持私有。

## 本地开发

### 环境要求

- Node.js `>=22.13.0`
- Python `>=3.11`，仅在运行采集器和 Python 测试时需要
- Linux 或 WSL，仓库的受控安装和构建脚本依赖 `flock`、`curl` 和 GNU `timeout`

### 启动 Web 应用

```bash
git clone https://github.com/XinyuIvy/ivy-job-radar.git
cd ivy-job-radar
npm run install:ci
npm run dev
```

`.openai/hosting.json` 声明 `DB` 和 `BUCKET` 绑定。完整功能需要在 Sites 或兼容的 Cloudflare Workers 环境中提供真实 D1 和 R2 资源。本地空环境可以查看界面，但依赖数据库或外部仓库的功能不会工作。

## 运行时配置

不要把 token 写进 Git 或前端代码。以下变量应放在部署平台的加密环境变量中。

| 变量 | 用途 |
|---|---|
| `IVY_JOB_RADAR_SYNC_TOKEN` | 保护岗位导入、扫描状态、本地采集器和扩展桥接接口 |
| `OPENAI_API_KEY` | 岗位定制 CV 和受控语义问题处理 |
| `CV_GITHUB_TOKEN` | 读取 CV 母版、事实库和固定申请资料 |
| `APPLICATION_ARCHIVE_GITHUB_TOKEN` | 读写私有申请档案仓库 |
| `APPLICATION_ARCHIVE_GITHUB_REPO` | 私有申请档案仓库名，例如 `owner/job-application-archive` |
| `CV_MAINTENANCE_TOKEN` | 保护可信的 CV 维护和后台回调接口 |
| `GITHUB_WORKFLOW_TOKEN` | 可选，从网站触发 GitHub Actions 扫描 |
| `IVY_JOB_RADAR_SITES_BYPASS_TOKEN` | 可选，向本地采集器下发 Sites 访问凭据 |

定时 GitHub Actions 还需要仓库 Secrets：

- `IVY_JOB_RADAR_SYNC_TOKEN`
- `SITES_SIWC_BYPASS_TOKEN`

## 岗位采集

美国岗位扫描工作流位于 `.github/workflows/daily-us-jobscan.yml`。搜索范围由 `config/us_search_queries.json` 控制，目标公司和官网入口由 `app/company-pool.json`、`app/company-pool-additions.json` 与 `app/company-source-additions.json` 控制。

手动运行：

1. 打开 GitHub 仓库的 Actions。
2. 选择 `Daily US job scan and application preparation`。
3. 点击 `Run workflow`。
4. 在网站“岗位更新”面板查看分阶段进度和结果。

中国岗位本地采集器的安装与安全边界见 [local-collector/README.md](local-collector/README.md)。

## 安装 Chrome 扩展

1. 打开 `chrome://extensions`。
2. 开启 Developer mode。
3. 点击 Load unpacked。
4. 选择仓库中的 `browser-extension/` 文件夹。
5. 打开已部署站点的 `/autofill` 页面，保存资料。
6. 打开扩展，点击“从当前 Job Radar 页面导入连接”。
7. 在岗位申请页选择岗位冻结资料或实时 CV 母版，然后开始填写。

更新代码后，在 `chrome://extensions` 找到 Ivy Job Radar Autofill 并点击 Reload。

## 测试

```bash
npm test
npm run lint
python -m unittest discover -s tests -p 'test_*.py'
```

## 已知边界

- 这是单用户私有工作流，尚未抽象成通用多租户产品。
- 多个仓库名、目标公司和筛选规则仍带有作者个人配置，其他使用者需要替换。
- 受登录、验证码或反自动化保护的网站可能无法自动采集或填写。
- 招聘网站 DOM 经常变化，扩展会优先留空低置信度字段，而不是猜测。
- 岗位生成的定制 CV 不会出现在“实时 CV 母版”分组中，它属于对应 APP-ID 的申请冻结资料。
- 扩展不会点击最终 Submit，所有提交结果都需要用户确认。

## 相关文档

- [Chrome Autofill 使用说明](browser-extension/README.md)
- [美国岗位采集流程](docs/job-collection.md)
- [中国多来源采集](docs/china-multisource-collection.md)
- [申请档案契约](docs/APPLICATION_ARCHIVE_CONTRACT.md)
- [CV 知识库结构](docs/CV_KNOWLEDGE_SCHEMA.md)
- [CV 母版语言规则](docs/CV_TEMPLATE_LANGUAGE_AUTHORITY.md)

## License

本仓库目前没有单独的开源许可证。公开可见不等于自动授权复制、分发或商业使用。如需复用，请先联系仓库所有者。
