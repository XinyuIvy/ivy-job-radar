# Ivy Job Radar Application Autofill 0.6.9

Ivy Job Radar Autofill 是一个 Chrome Manifest V3 扩展，用于从 Ivy Job Radar、CV 仓库和私有申请档案中读取已确认资料，填写招聘网站的申请表并上传正确的 CV。

扩展只负责准备表单。它不会点击最终 Submit，也不会绕过验证码、登录或网站的安全验证。

## 它可以填写什么

- 中英文姓名、联系方式、地址和职业链接
- 工作授权、Sponsorship、搬迁意愿和已确认的固定问答
- 教育经历、工作与实习经历、项目经历
- 论文、获奖、语言、作品链接和校园经历
- CV 中的 Skills，既支持整段文本框，也支持需要逐项添加的技能选择控件
- 规则无法识别的非敏感自定义问题，但只有在事实证据充分且置信度达到配置要求时才填写
- 与当前申请对应的 PDF CV

扩展支持常见 input、textarea、select、日期控件、ARIA combobox 和动态重复卡片。它主要面向 Greenhouse、Lever、Ashby、Workday 及具有类似表单结构的自定义 ATS。

## 三类资料来源

| 来源 | 用途 | 更新方式 |
|---|---|---|
| 固定申请资料 | 姓名、地址、联系方式、工作授权、固定问答、论文和获奖等 | 每次填写时从 Job Radar global profile 读取，浏览器本地资料只作为回退 |
| 已申请岗位冻结资料 | 使用对应 APP-ID 的冻结 JD、最终 CV 和 Autofill packet | 选择“已申请岗位”中的岗位；按私有档案中的实际提交 CV、定制 CV、冻结母版顺序读取 |
| 实时 CV 母版 | 不绑定岗位，直接按一份母版填写并上传 CV | 每次重新读取 Job Radar context 时从 GitHub `master/template-cv/` 获取当前版本 |

岗位生成的新 CV 不会出现在“实时 CV 母版”分组中。它属于相应岗位的 APP-ID，需要从“已申请岗位”分组选择该岗位。

## 0.6.9 的当前行为

- CV 来源下拉菜单同时提供已申请岗位和实时 CV 母版。
- 母版列表由 GitHub `master/template-cv/` 自动扫描，不使用写死的文件列表。
- 直接选择母版时，项目、经历、Skills 和 PDF 都读取该母版的当前 GitHub 版本。
- 选择岗位时，优先使用私有申请档案中的 `cv_submitted_<APP-ID>.pdf`，其次是 `cv_customized_<APP-ID>.pdf`，最后才使用保存岗位时冻结的母版 PDF。
- 从 TeX 解析 Skills，并填写普通 Skills 文本框或逐项添加式技能控件。
- 如果页面有 Project Experience，项目按项目填写。
- 如果页面没有 Project Experience，项目会逐条写入 Work Experience，并使用 Part-time 或兼职作为类型。
- “项目填写位置”可以手动选择 Auto、Project Experience 或 Work Experience。
- 中文资料和 English profile 可在每次填写前独立切换。
- 只填写真正空白的控件，不覆盖页面已有内容。
- 重复教育、经历、项目、论文、获奖、语言、链接和技能区块会按已有可靠记录自动添加。
- 多个已申请岗位共用同一 ATS 域名时，不会只按域名猜测。无法唯一匹配时必须手动选择。

## 安装

### 1. 获取代码

```bash
git clone https://github.com/XinyuIvy/ivy-job-radar.git
cd ivy-job-radar
```

如果已经有仓库，并且当前分支没有未提交修改：

```bash
git switch main
git pull --ff-only origin main
```

### 2. 在 Chrome 中加载

1. 打开 `chrome://extensions`。
2. 开启 Developer mode。
3. 点击 Load unpacked。
4. 选择 `ivy-job-radar/browser-extension/` 文件夹。
5. 确认扩展卡片上的版本为 `0.6.9`。

扩展不需要 npm 构建，也不需要打包后再安装。

## 首次连接 Job Radar

1. 打开你部署的 Ivy Job Radar `/autofill` 页面。
2. 保存固定申请资料。
3. 点击 Chrome 工具栏中的 Ivy Job Radar Autofill。
4. 点击“从当前 Job Radar 页面导入连接”。
5. 接受一次站点来源权限。

扩展会保存站点 origin、派生访问 key、默认语言和本地回退资料。GitHub token 只保存在服务端，不会写入扩展。

## 手动填写一个申请

1. 打开公司的具体申请表页面。
2. 打开扩展。
3. 在“填表与 CV 来源”中选择一个已申请岗位，或直接选择 CV 母版。
4. 选择本次固定资料语言。
5. 保持项目位置为“自动判断”，或手动指定 Project Experience / Work Experience。
6. 点击“按照所选来源填写 + 上传 CV”。
7. 检查未填必填项、日期、下拉选项和上传的文件。
8. 使用“复制未填问题”整理扩展有意留空的内容。
9. 人工点击招聘网站的最终 Submit。

## 自动填写队列

- Job Radar 的“自动”页面每批最多准备 10 个美国岗位。
- 用户确认整批后，系统才生成 CV 并把任务交给扩展。
- 扩展每 5 分钟检查一次队列，也可以点击“立即检查队列”。
- 最多两个 worker 同时处理，避免一次打开过多页面。
- 每个处理过的标签页都会保留，等待人工检查和提交。
- 扩展不会根据页面变化自行确认申请已经提交，必须由用户在 Job Radar 中确认。

## CV 与 Autofill packet

岗位冻结资料通常位于私有申请档案仓库：

```text
applications/<year>/<APP-ID>/
├── cv_base.tex
├── cv_customized_<APP-ID>.tex
├── cv_customized_<APP-ID>.pdf
├── cv_submitted_<APP-ID>.pdf
├── application_autofill_<APP-ID>.json
└── application_autofill_refresh_<APP-ID>.json
```

扩展通过 Job Radar 服务端读取这些文件。私有仓库路径、token 和原始文件不会暴露给申请网站。

## 安全边界

- 永远不点击最终 Submit 或 Finish。
- 不绕过 CAPTCHA、登录、短信验证或反自动化控制。
- 不保存或填写 SSN、密码、金融凭据和证件号码。
- EEO、种族、族裔、性别、残障、退伍军人、宗教和出生日期等敏感题不会发送给模型。
- 只有用户明确保存的敏感答案才可以在浏览器本地规则中填写。
- 不会把 Resume/CV 文件上传到 Cover Letter、Transcript、Portfolio 或其他附件控件。
- 证据不足、控件含义不明确或属于法律声明时，扩展会留空。
- 已有页面值优先，自动填写不会覆盖用户输入。

## 更新扩展

```bash
cd /path/to/ivy-job-radar
git switch main
git pull --ff-only origin main
```

之后回到 `chrome://extensions`，在 Ivy Job Radar Autofill 卡片上点击 Reload。已经打开的申请页也需要刷新一次，才能加载新的 content script。

## 常见问题

### 新母版没有出现在下拉菜单

确认文件直接位于 CV 仓库的 `master/template-cv/`，扩展名为 `.tex`，并且已经提交到 `main`。关闭再打开扩展会重新读取列表。上传 PDF 时还需要同名 `.pdf`。

### 岗位生成的新 CV 没有出现在母版分组

这是当前数据模型的正常行为。岗位定制 CV 属于 APP-ID，不属于母版。请在“已申请岗位”分组选择对应岗位。该岗位还必须是“已申请”状态，并拥有有效 APP-ID 和可读取的冻结档案。

### 选择了母版但没有上传 PDF

确认 CV 仓库中存在与 `.tex` 同名的 `.pdf`，并确认服务端配置了 `CV_GITHUB_TOKEN`。只有 `.tex` 时可以解析部分填写资料，但无法上传 PDF。

### 填写成了错误语言

“CV 来源”和“本次固定资料语言”是两个独立选择。前者决定项目、经历、Skills 和 PDF；后者决定姓名、地址、教育和其他固定资料使用中文还是英文。

### 项目没有填写

先查看页面是否存在独立 Project Experience。没有时选择 Work Experience；扩展会把项目逐条作为兼职经历填写。如果网站的 Add 按钮或字段结构无法可靠识别，扩展会停止添加，避免写错区块。

### 点击填写后完全没有变化

1. 在 `chrome://extensions` 确认版本和错误状态。
2. 点击 Reload。
3. 刷新申请页面。
4. 重新从 Job Radar `/autofill` 导入连接。
5. 检查扩展底部的错误信息。

某些招聘网站会在 iframe、封闭 shadow DOM 或登录后的特殊组件中渲染表单。这些页面可能仍需要手动填写。
