import { cvLanguageGenerationRules } from "./cv-generation-rules";

export type ArchiveTrack = "pharma" | "tech" | "quant" | "consulting" | "clinical_neuro";
export type ArchiveLanguage = "en" | "zh";

export const ARCHIVE_REPOSITORY = "XinyuIvy/job-application-archive";

export const templateFiles: Record<ArchiveLanguage, Record<ArchiveTrack, string | null>> = {
  en: {
    pharma: "cv_pharma.tex",
    tech: "cv_tech.tex",
    quant: "cv_quant.tex",
    consulting: "cv_healthcare_consulting.tex",
    clinical_neuro: null,
  },
  zh: {
    pharma: "cv_pharma_cn.tex",
    tech: "cv_tech_cn.tex",
    quant: "cv_quant_cn.tex",
    consulting: "cv_healthcare_consulting_cn.tex",
    clinical_neuro: "cv_clinical_data_neuro_cn.tex",
  },
};

export const canonicalSnapshotFiles = [
  ["master/FACT_MASTER.md", "fact_master_snapshot.md"],
  ["master/project-evidence/CV_DISPLAY_RULES.yaml", "cv_display_rules_snapshot.yaml"],
  ["master/project-evidence/CANONICAL_PROJECT_INDEX.jsonl", "canonical_project_index.jsonl"],
  ["master/project-evidence/CANONICAL_FACT_INDEX.jsonl", "canonical_fact_index.jsonl"],
  ["master/project-evidence/CANONICAL_CAPABILITY_INDEX.jsonl", "canonical_capability_index.jsonl"],
  ["master/project-evidence/CANONICAL_CONCEPT_INDEX.jsonl", "canonical_concept_index.jsonl"],
  ["master/project-evidence/CANONICAL_RELATION_INDEX.jsonl", "canonical_relation_index.jsonl"],
  ["master/project-evidence/CANONICAL_RETRIEVAL_INDEX.jsonl", "canonical_retrieval_index.jsonl"],
] as const;

function shortHash(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36).toUpperCase().slice(0, 3).padEnd(3, "0");
}

export function companyCode(company: string) {
  const words = company.normalize("NFKD").toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  const joined = words.join("").replace(/^(THE|INC|LLC|LTD|CORP)/, "");
  return (joined.slice(0, 3) || shortHash(company)).padEnd(3, "X");
}

export function newYorkYear(date = new Date()) {
  const part = new Intl.DateTimeFormat("en", { timeZone: "America/New_York", year: "numeric" })
    .formatToParts(date)
    .find((item) => item.type === "year")?.value;
  return Number(part) || date.getUTCFullYear();
}

export function stableArchiveId(company: string, jobRadarApplicationId: number, existing = "") {
  const preserved = existing.trim().toUpperCase();
  if (/^APP-\d{4}-[A-Z0-9]{3,12}-\d{3,}$/.test(preserved)) return preserved;
  return `APP-${newYorkYear()}-${companyCode(company)}-${String(jobRadarApplicationId).padStart(4, "0")}`;
}

export function archivePath(archiveId: string) {
  const year = archiveId.match(/^APP-(\d{4})-/)?.[1] ?? String(newYorkYear());
  return `applications/${year}/${archiveId}`;
}

function yamlString(value: unknown) {
  return JSON.stringify(String(value ?? ""));
}

export function buildApplicationRecord(input: {
  archiveId: string;
  applicationRowId: number;
  jobRowId?: number | null;
  company: string;
  title: string;
  region: string;
  location: string;
  track: ArchiveTrack;
  language: ArchiveLanguage;
  jobUrl: string;
  source: string;
  capturedAt: string;
  cvCommit: string;
  templatePath: string;
  archivePath: string;
}) {
  return [
    "schema_version: application-archive-v1",
    `application_id: ${yamlString(input.archiveId)}`,
    `archive_path: ${yamlString(input.archivePath)}`,
    "job_radar_mapping:",
    `  application_row_id: ${input.applicationRowId}`,
    `  job_row_id: ${input.jobRowId ?? "null"}`,
    `company: ${yamlString(input.company)}`,
    `title: ${yamlString(input.title)}`,
    `region: ${yamlString(input.region)}`,
    `location: ${yamlString(input.location)}`,
    `industry_track: ${yamlString(input.track)}`,
    `language: ${yamlString(input.language)}`,
    `job_url: ${yamlString(input.jobUrl)}`,
    `source: ${yamlString(input.source)}`,
    `captured_at: ${yamlString(input.capturedAt)}`,
    "source_versions:",
    "  cv_repository: XinyuIvy/CV",
    `  cv_commit: ${yamlString(input.cvCommit)}`,
    `  cv_template_path: ${yamlString(input.templatePath)}`,
    "matching:",
    "  job_radar_result: preliminary_only",
    "  chat_independent_review_required: true",
    "  human_confirmation_required_for_cv_content: true",
    "  automatic_tex_generation_authorized: false",
    "  automatic_pdf_compilation_authorized: true",
    "  manual_binary_pdf_upload_by_chat_authorized: false",
    "  local_chat_pdf_preview_authorized: true",
    "  local_preview_repository_write_authorized: false",
    "  application_status_mutation_authorized: false",
    "required_initial_inputs:",
    "  - application_record.yaml",
    "  - jd_snapshot.md",
    "  - jd_requirements.json",
    "  - match_packet.json",
    "  - fact_master_snapshot.md",
    "  - cv_display_rules_snapshot.yaml",
    "  - canonical_project_index.jsonl",
    "  - canonical_fact_index.jsonl",
    "  - canonical_capability_index.jsonl",
    "  - canonical_concept_index.jsonl",
    "  - canonical_relation_index.jsonl",
    "  - canonical_retrieval_index.jsonl",
    "  - cv_base.tex",
    "  - chat_prompt.txt",
    "",
  ].join("\n");
}

export function buildChatPrompt(
  archiveId: string,
  path: string,
  fullJd: string,
  language: ArchiveLanguage,
  templateFile: string,
) {
  const customizedTex = `cv_customized_${archiveId}.tex`;
  const customizedPdf = `cv_customized_${archiveId}.pdf`;
  const customizedText = `cv_customized_${archiveId}.txt`;
  const buildManifest = `cv_build_manifest_${archiveId}.json`;
  const submittedPdf = `cv_submitted_${archiveId}.pdf`;
  const confirmedFullJd = fullJd.trim();
  const languageLabel = language === "zh" ? "中文（zh）" : "English（en）";
  const languageReviewRules = cvLanguageGenerationRules(language);
  const languageDirective = language === "zh"
    ? "最终 CV 的 Summary/个人简介、技能、经历、项目、论文/荣誉等自然语言内容必须使用中文。公司名、院校名、论文题目、方法名、软件名及必要技术术语可保留官方英文或中英并列；不得因为 JD 是英文、事实库含英文或旧版 CV 是英文而切回英文简历。"
    : "The final CV must use English for all natural-language sections, bullets and labels. Proper nouns and official titles may retain their official spelling; do not switch to a Chinese CV because the JD or evidence contains Chinese.";

  return `请为申请 \`${archiveId}\` 定制定向 CV。

请从私有仓库 \`${ARCHIVE_REPOSITORY}\` 的 \`main\` 分支读取目录：

\`${path}/\`

## 本次已确认的 CV 语言与母版（一级硬约束）

- **输出语言：${languageLabel}**
- **已确认母版：\`${templateFile}\`**
- \`application_record.yaml\` 中的 \`language\`、\`source_versions.cv_template_path\` 与 \`cv_base.tex\` 必须与上述选择一致。
- ${languageDirective}
- 如果读取后发现 \`application_record.yaml\`、\`cv_base.tex\` 或母版路径与上述语言/母版不一致，立即停止并明确告诉我“冻结母版与本次选择不一致”；不得自行沿用旧母版、不得猜测语言、不得先生成另一种语言的 CV。

## 完整 JD 是本次定制的主输入

下面已经直接内嵌了你在 Job Radar 中确认并冻结的完整 JD 原文。必须把它从头到尾作为一级输入阅读，不能只看 Job Radar 抽取出的几条 requirement / fact。随后再打开 \`jd_snapshot.md\`，从第一行读到文件结尾并核对它与下方完整 JD 是否一致；如果 GitHub/connector 返回内容被截断，继续分段读取直到 EOF。若两者不一致，立即停止并告诉我，不要自行选择其中一版。

----- BEGIN CONFIRMED FULL JD -----
${confirmedFullJd}
----- END CONFIRMED FULL JD -----

完成完整 JD 核对后，再读取以下申请输入：

- \`application_record.yaml\`
- \`jd_snapshot.md\`
- \`jd_requirements.json\`
- \`match_packet.json\`
- \`fact_master_snapshot.md\`
- \`cv_display_rules_snapshot.yaml\`（较新的申请包会包含；历史申请包可能不存在）
- \`canonical_project_index.jsonl\`
- \`canonical_fact_index.jsonl\`
- \`canonical_capability_index.jsonl\`
- \`canonical_concept_index.jsonl\`
- \`canonical_relation_index.jsonl\`
- \`canonical_retrieval_index.jsonl\`
- \`cv_base.tex\`

如果申请 ID、目录或除 \`cv_display_rules_snapshot.yaml\` 之外任何必需文件不存在，立即停止并明确告诉我缺少什么。历史申请包若没有 \`cv_display_rules_snapshot.yaml\`，不要因此停止；继续执行，并严格遵守下面内嵌的全局展示边界。不要根据聊天记忆、岗位名称或相似申请猜测。

### 全局 CV 展示边界

以下规则是用户确认的长期硬规则，即使历史申请包尚未冻结 \`cv_display_rules_snapshot.yaml\` 也必须执行；较新的申请包若包含该文件，还必须读取其中所有与当前语言和 CV 类型匹配的其他规则。不得因为 JD 关键词、\`cv_base.tex\` 的旧措辞、版面压缩或一般写作偏好而覆盖这些规则。

1. **中文个人简介固定身份、隐藏学校且禁止预计毕业日期：** 生成任何中文 CV 时，Summary / 个人简介必须明确写出“博士候选人”，不得用“博士生”等近义表达替代；个人简介中不得出现“范德堡大学”或 Vanderbilt University，学校只保留在教育背景中；同时永远不得出现“预计 2027 年 5 月毕业”、其他预计毕业年月或其英文变体。预计毕业日期只能出现在教育背景的博士条目中。
2. **中文教育背景固定格式：** 生成任何中文 CV 时，教育背景必须严格使用以下内容和顺序，不得自行改写院校/学位措辞、移动毕业日期或增加地点：

\`\`\`latex
\\section*{\\Large 教育背景}

\\noindent\\textbf{生物统计学博士} $\\mid$ 范德堡大学（Vanderbilt University） \\hfill 预计 2027 年 5 月毕业 \\\\
博士论文：\\emph{Reliable Biomedical Data Analysis: Semiparametric Inference for Effect Sizes and Variable Importance, and Human-Supervised Multi-Agent Workflows}

\\noindent\\textbf{生物统计学硕士} $\\mid$ 耶鲁大学（Yale University） \\hfill 2023 年 \\\\
硕士论文：\\emph{Evaluating Treatment Effects under Non-Proportional Hazards in Oncology Clinical Trials}

\\noindent\\textbf{统计学学士} $\\mid$ 西南财经大学 \\hfill 2021 年
\`\`\`

3. **SQL 永远只写 SQL：** 所有中英文 CV 的技能列表中只能写 \`SQL\`。永远禁止写成 \`SQL (...)\`、\`SQL（...）\` 或在 SQL 后用括号列出 queries、joins、aggregation、查询、连接、聚合、熟练度或其他具体项。

4. **中文项目日期精确到月：** 中文 CV 中每个研究、项目、实习、工作和软件系统条目都必须同时包含已核验的开始年月与结束年月，固定写成 \`YYYY 年 M 月 - YYYY 年 M 月\`；仍在进行的条目固定写成 \`YYYY 年 M 月 - 至今\`。例如：\`2026 年 5 月 - 2026 年 8 月\`。禁止使用 \`2026.05\`、\`2026 年 5 月至 8 月\`、\`2026 年\`、双连字符或省略第二个年份。若事实材料无法核验任一月份，必须停止并向我确认，禁止猜测或降级成年份格式。教育背景仍严格遵守第 2 条，不受本条改写。

5. **中文地点按“城市，国家”显示：** 中文 CV 中凡显示地点，一律使用城市在前、国家在后的格式，例如 \`波士顿，美国\`、\`纳什维尔，美国\`；禁止写成 \`美国波士顿\`。不得为了补齐版面而虚构地点。

6. **括号内英文首字母大写：** 中文 CV 中保留的括号内英文，其首个英文单词必须以大写字母开头，例如 \`时间外验证（Temporal validation）\`、\`站点校正（Harmonization）\`。标准全大写缩写以及软件、模型、包、产品和专有名词的官方大小写优先，不得为了套用本条破坏官方写法。

7. **皮层必须明确为脑区皮层：** 中文 CV 中涉及 cortex、cortical thickness 或 cortical surface area 时，必须写成“脑区皮层”“脑区皮层厚度”或“脑区皮层表面积”，不得单独写“皮层”“皮层厚度”或“皮层表面积”。

\`cv_display_rules_snapshot.yaml\` 是用户确认的权威 CV 展示边界。若目录中存在该文件，必须读取并执行其中所有适用规则；它用于补充上面的长期硬规则，而不是削弱它们。

\`jd_snapshot.md\` 与上面内嵌的完整 JD 是岗位要求的主权威来源。\`jd_requirements.json\` 和 \`match_packet.json\` 都只是从完整 JD 派生出的结构化摘要，绝对不能替代完整 JD，也不能把分析范围限制在其中已经抽取的几条要求。不要只根据 \`jd_requirements.json\` 里的几条 fact / requirement 做匹配。必须自行从完整 JD 中识别所有职责、必需条件、优先条件、学历/经验、方法与工具、合作与沟通要求、工作授权/地点/工作方式以及其他会影响 CV 的信息；即使某项没有出现在结构化摘要里，也要纳入审核。

\`match_packet.json\` 只是 Job Radar 的初步分类，不是最终结论。请在完整阅读 JD 后，再结合完整事实母版、canonical indexes 和当前 CV，独立审核每项 JD 要求属于 Direct、Transferable、Adjacent 还是 Unsupported。你可以纠正、补充或推翻 Job Radar 的分类，但必须说明事实依据。

分类处理规则：

1. 如果你的分类与 Job Radar 一致，直接合并进匹配分析，不需要逐项问我。
2. 如果分类不同但该要求不会影响本次 CV 的内容选择、项目顺序或表述，只记录分歧，不要打扰我。
3. 只有分歧可能影响实际写入 CV 的内容时才找我确认，每次最多展示 3 至 5 条最重要的分歧，不要一次给我几十条。
4. RAG 只用于按证据 ID 回查存在争议的具体事实、数字、方法、贡献边界或原始片段。不要一开始通读全部论文、代码和项目目录，也不要只凭检索分数决定分类。

关键词规则：

1. JD 中的关键词优先。只要事实支持，就尽量使用 JD 的原词、自然变体或该岗位常用表达。
2. \`cv_base.tex\` 中已有的行业关键词，只要不与 JD 定位冲突、不造成事实夸大、也不挤占更重要的 JD 内容，就尽量保留。
3. 如果 JD 关键词与行业常用关键词含义兼容，可以在同一句中自然兼容两者；不能堆砌关键词。
4. Direct 关键词可以按真实经历表述；Transferable 和 Adjacent 必须保留迁移或边界语义；Unsupported 关键词不能为了 ATS 强行加入。
5. 内容草稿中请附一份简洁的“JD 关键词覆盖检查”，说明核心关键词将出现在哪里、哪些因缺乏证据不能使用。

## 一次任务内部连续完成的多轮审校协议

不要在完成初步分类或第一版内容后停下来等我逐轮提醒。除非遇到必需文件缺失、冻结输入冲突、会实际改变 CV 的重要事实分歧，或任何条目的月份无法核验，否则请在同一次任务中对同一份工作稿连续执行下面各轮，上一轮发现的问题必须直接改进到下一轮。不要输出多份互相矛盾的草稿，也不需要展示隐藏推理过程；只需在最终交付中给出结论、重要取舍和可核验结果。

每一轮必须记录本轮输入、关键判断、实际修改和通过或未通过，不能只写“已检查”。发现能用冻结事实修复的问题时必须直接修改 CV，不能把修复建议留到下一次对话。最终版本必须同时通过五个门槛：资格门槛无已确认硬伤；所有表述有证据且贡献边界准确；首屏定位与岗位核心职责一致；当前语言自然专业；PDF 不超过两页且版面与文本提取合格。任何一项未通过，都不得交付为接近定稿。

### 第 1 轮：完整 JD、证据与岗位要求审核

完整读取 JD 和申请输入，独立复核 Direct、Transferable、Adjacent、Unsupported，识别所有硬性要求、优先条件、关键词和事实缺口。只有会影响实际写入 CV 的重要分歧才集中向我确认，每次最多 3 至 5 条。

### 第 2 轮：岗位角色画像与学术权重判断

在任何语言专项审校之前，先从完整 JD 提炼“这个岗位真正需要什么样的人”，至少判断：核心任务、预期交付、最看重的方法或能力、业务/科研问题类型、独立推进程度、协作与沟通方式、领域兴趣，以及论文、会议、科研写作或其他学术产出的权重。将岗位归为“研究/学术产出导向”“应用/业务交付导向”或“混合型”，并说明判断依据。

随后让整份 CV 的证据选择、项目顺序、bullet 重心和表达语气与该角色画像一致，但只能调整真实事实的呈现方式，禁止虚构人格特质、工作经历、业务影响或生产落地。

### 第 3 轮：内容重组与论文/学术材料取舍

根据角色画像决定 summary、skills、经历、项目、论文、荣誉和学术传播材料的篇幅与顺序。每个项目优先写“做了什么和贡献”，再写方法、量化结果与解决的问题；强调岗位真正需要的能力，不把医学或学术研究虚构成互联网生产系统。

整份 CV 必须有清晰的内容层级，禁止把所有经历和项目塞进一个“项目经历”或“代表性项目”section，再按一、二、三、四、五、六、七、八平铺罗列。应先根据完整 JD 和岗位角色画像给每项经历确定功能，再进行分组：

1. **行业经历或实习经历必须独立成节。** Pfizer 等企业实习、正式工作或直接行业交付不得与个人项目、学术研究混在同一 section。section 名称可根据 JD 使用“行业经历”“实习经历”“专业经历”或更贴切的自然名称，但语义边界必须清楚。
2. **研究型项目必须单独成节。** 方法创新、统计推断、博士研究、论文驱动研究和学术合作项目归入“研究经历”“方法研究”或符合岗位语言的同类 section。
3. **应用型项目必须单独成节。** 数据分析、真实世界数据、应用建模、软件工具、独立 AI 系统和面向实际流程的项目归入“应用项目”“数据科学项目”“独立系统”或符合岗位语言的同类 section。
4. 在当前事实材料同时包含行业经历、研究型项目和应用型项目时，三类必须分别呈现；至少要把研究型项目与应用型项目分成两个不同的项目 section，行业/实习经历另设独立 section。不得为了节省版面重新合并成一个项目列表。
5. section 的具体名称、先后顺序和每节篇幅必须由 JD 决定：研究导向岗位可将研究经历前置，应用导向岗位可将行业经历和应用项目先展示，混合型岗位按核心职责平衡安排。每个项目只能出现一次，不得跨 section 重复。
6. 论文、荣誉和学术传播是否另设 section，继续按岗位的学术权重决定；它们不能代替研究项目本身，也不能把行业、研究和应用三类重新混成一类。

论文和学术材料不得机械地每份 CV 都放同样数量：

- 如果 JD 明确重视高水平论文、科研能力、论文写作、文献复现、学术影响力或博士研究成果，保留更多与岗位直接相关的代表性论文，并清楚区分已发表、已接收、在审、返修和预印本状态；同时保留审稿、荣誉和学术传播等能支持岗位画像的证据。
- 如果岗位属于混合型，只保留最能证明核心方法能力和领域匹配的论文，避免论文列表挤占更重要的项目、实习和软件系统。
- 如果岗位主要看业务、产品或应用交付，压缩论文部分，仅保留少量最相关的学术成果或将其合并展示，把空间优先给项目贡献、量化结果、独立推进和协作证据。
- 在审、返修或预印本不得写成已发表论文；审稿经历也不得替代正式发表要求。

无论最终列出多少个具体会议名称，只要 CV 包含学术传播或综合成果信息，就必须明确写出：**“以第一作者身份在九个学术会议作报告”**。不得只列 JSM、SMI 等两个会议后让读者误以为总共只有两个，也不得把九个改写成七个或其他数量。

### 第 4 轮：资深行业 HR 差距复核、第二次证据召回与事实审计

先完成整份 CV 初稿，再切换为深度了解该 JD 所属行业、岗位职能和真实筛选标准的资深 HR。把 JD 要求分为硬门槛、核心职责、强优先项和一般关键词，明确候选人与岗位仍有哪些经验、行业、方法、工具、职责范围、交付、协作或影响力差距，并区分真实硬差距、证据位置不醒目、表达不具体和证据尚未被调用。

针对所有可能补强的差距，再次检索完整事实母版与 canonical fact/project/capability/concept/relation/retrieval indexes。发现可靠证据后，必须把它自然补入 summary、skills、经历、项目或论文，不能只在审校记录中提到。事实库没有证据的差距必须保留，不得用相邻经历冒充直接经验。随后模拟招聘官最可能拒绝该候选人的三个理由，能用已核验事实修复的直接修复，不能修复的如实记录。

最后将 summary、skills、每段经历、每个项目、每篇论文、每项荣誉和所有数字逐项对照事实母版与 canonical indexes。检查贡献边界、作者/角色、方法、结果、样本量、日期、地点、论文状态和关键词均有证据支持；删除 Unsupported 内容，Transferable 和 Adjacent 保留真实边界。项目叙述必须抓住该项目在事实母版中的核心贡献，不能为了贴 JD 改成另一个故事。

### 第 5 轮：角色画像对齐后的风格重写

在事实不变的前提下，再把整份 CV 的写作风格调整到与岗位角色画像一致。研究导向岗位突出问题定义、方法创新、严谨验证和学术影响；应用导向岗位突出交付、量化结果、可解释决策、独立推进和跨团队协作；混合型岗位平衡两者。检查行业/实习经历、研究型项目、应用型项目等 section 的命名与顺序，以及每条 bullet 的首要信息是否都服务于同一角色画像。

执行 10 秒招聘官扫描测试：只看 Summary、Skills、第一页前三条核心 bullet 和 section 标题时，必须能立即判断候选人是谁、最匹配哪三项核心要求、有什么可信结果、为什么值得进入面试。若答案不清楚，重新排序和改写首屏。Summary、Skills 与前三条核心 bullet 必须形成同一个候选人定位。每条保留的 bullet 都应提供新的招聘信号，并尽量包含行动或贡献、方法或工具、对象或规模、结果或影响中的至少三项；没有事实数字时不得编造。

### 第 6 轮：当前语言专项审校

只有完成岗位角色画像和风格对齐后，才执行本次冻结语言的专项审校。下面只包含当前 CV 语言对应的规则，必须逐条执行，不得混用另一语言的句法、日期、标点或术语习惯：

${languageReviewRules}

### 第 7 轮：格式、年月与一致性检查

检查个人简介、教育背景、技能、日期、地点、术语、项目角色和母版一致性。对中文 CV 中每一个研究、项目、实习、工作和软件系统逐条建立日期清单，确认全部使用已核验的“开始年+月 - 结束年+月”或“开始年+月 - 至今”；只写年份即视为不合格，必须修正。月份无法核实时集中向我询问，禁止猜测、删除日期或降级成年份。

### 第 8 轮：本地 TeX、PDF 页数与页面密度验证

在同一次任务中，基于最终工作稿和 \`cv_base.tex\` 在 Chat 的临时工作区创建本地工作 TeX，并用 LuaLaTeX 编译预览 PDF；这是已授权的本地预览，不代表内容定稿，也不能写入任何仓库。必须使用 \`pdfinfo\` 或等价工具报告实际 PDF 页数，并渲染或检查每一页的页面密度、分页、异常断行、溢出和文本可提取性，不能仅凭 TeX 源码猜页数。

目标是 **尽量接近但不挤满 2 页，并输出为不超过 2 个物理页面的 PDF**。不要把 1.5 页当成理想目标，也不要刻意把内容停在一页半；第二页应接近完整、有实质内容，同时保留正常的页底留白。如果只有 1 页、第二页只到约一半或内容明显不足，必须再次查看事实母版和论文记录，优先按与 JD 和岗位画像的相关性补入已经核验的代表性论文，再补回其他有事实支持的项目、方法、结果或学术证据。论文必须准确保留已发表、已接收、在审、返修或预印本状态；不得加入弱相关论文或其他弱内容机械凑页数。如果超过 2 页或页面过密，优先删减低相关、重复或次要内容，尤其按岗位学术权重调整论文数量。不得通过明显缩小字体、压缩行距或破坏母版间距强行控制页数。

### 第 9 轮：最终回归审查与一次性交付

最后再次以相关行业资深 HR 视角对照完整 JD、岗位角色画像、招聘信号优先级、事实母版、canonical indexes 和全局展示边界，复查岗位匹配、前三个潜在拒绝理由、10 秒首屏扫描、事实准确、结构分区、中文流畅、JD 关键词覆盖、论文取舍、九个第一作者会议报告、所有项目年月、重复内容和 PDF 页面密度。若行业/实习、研究型项目和应用型项目仍被平铺在同一 section，或 Summary、Skills 与前三条核心 bullet 没有形成一致定位，直接判定为不合格并重新组织。未达到以上标准就继续在内部修改并重新编译，直到达到或遇到只能由我补充的事实阻塞。

第一条完整回复直接交付接近定稿的版本，至少包括：

1. 简洁的岗位角色画像和学术产出权重结论；
2. 项目、论文与学术材料的保留/删减理由；
3. 已完成上述多轮修改的完整纯文本 CV 内容；
4. 简洁的 JD 关键词覆盖检查；
5. 本地预览 PDF 的可打开文件或链接、实际页数，以及页面密度检查结论。

不要在第一轮只给分析提纲、只给分类表或只改一部分内容后让我继续下指令。风格、措辞、顺序和有充分证据支持的取舍由你直接完成；只有无法从权威材料确认的真实事实才询问我。完成以上一次性交付后等待我确认是否定稿。

在我确认内容定稿之前：

- 不把 application-specific TeX 写入 GitHub
- 不把任何预览 PDF 写入 GitHub
- 不改变申请状态
- 允许按上面的内部多轮审校协议自动创建并展示本地预览 PDF，但不得把该预览当成归档定稿

当我说“内容定稿”或明确要求查看 PDF 后，可以从 \`cv_base.tex\` 在 Chat 的本地临时工作区创建本申请的工作 TeX。工作 TeX 必须保持母版的 document class、packages、字体、字号、页边距、section 样式、bullet 样式、行距、项目间距、联系方式格式、日期和地点排版、\`\\hfill\` 规则及全部自定义命令。可以调整文字和项目顺序，但不得重新设计版式，也不得通过明显缩小字体强行塞进两页。

### Chat 内 PDF 预览规则

1. 在根 Chat 中需要查看版式时，直接在本地工作区用 LuaLaTeX 编译当前工作 TeX，生成临时预览 PDF。预览文件不要写入申请归档仓库。
2. 每次涉及 wording、项目顺序、分页、间距或可能改变行数的修改后，如果我正在看 PDF，就重新编译最新预览。
3. 检查预览 PDF 不超过两页、无明显溢出或异常断行、文本可提取。不要只告诉我“编译成功”；要把生成的预览 PDF 作为 Chat 中可打开的文件或链接直接给我看。
4. 如果本地编译环境暂时不可用，明确告诉我缺少什么，不要改成通过 GitHub connector 读取或上传二进制 PDF 来冒充预览。
5. GitHub connector 不能可靠读取二进制 PDF 内容，所以聊天阶段的视觉检查以 Chat 本地编译出的预览 PDF 为准；GitHub 中的 PDF 是归档产物，不是唯一的查看方式。

我们可以根据预览 PDF 继续修改内容或版式并反复编译。只有当我明确说“PDF定稿”“最终版确认”或同等明确措辞后，才把最终工作 TeX 保存为 \`${customizedTex}\` 并写入本申请目录。文件名必须保留完整 application ID，不得简化为 \`cv_customized.tex\` 或其他不带 application ID 的名称。

提交 \`${customizedTex}\` 到 \`${ARCHIVE_REPOSITORY}\` 的 \`main\` 后，会自动触发 GitHub Actions 中的 \`Build customized CV PDF\` workflow。不要在 Chat 中把 PDF 二进制重新编码成 base64、分块传输，或通过 GitHub connector 手动上传 PDF。

workflow 会调用仓库的 \`scripts/build_cv.sh\`，使用 LuaLaTeX 生成并验证 \`${customizedPdf}\`，同时保存 \`${customizedText}\` 和 \`${buildManifest}\`。其中：

- \`${customizedPdf}\` 是归档 PDF；
- \`${customizedText}\` 是从最终 PDF 提取出的 UTF-8 文本，供其他 Chat / GitHub 文本连接读取；
- \`${buildManifest}\` 记录页数、ATS 文本提取状态、源文件/输出文件名和 SHA-256，用于确认最终 PDF 与 TeX 对应。

提交 TeX 后检查并等待该 GitHub Action 完成。如果 workflow 失败，读取失败步骤或日志，修正本地工作 TeX、重新给我预览，并在我确认后再提交修正版；在 workflow 成功且这些归档文件确实存在之前，不得声称归档 PDF 已成功生成。

GitHub Action 成功后，读取 \`${customizedText}\` 和 \`${buildManifest}\` 核对最终归档内容及页数。若我还要在根 Chat 里再次看最终版式，用已提交的同一份 \`${customizedTex}\` 在 Chat 本地重新编译并把 PDF 直接给我看；不要尝试通过 GitHub connector 直接读取 binary PDF 内容。

最终仍需经过我的确认。在我明确确认实际投递版本之前，不创建 \`${submittedPdf}\`。不得修改其他申请，也不得覆盖 \`XinyuIvy/CV\` 中的行业母版。

现在执行上述一次任务内部连续完成的全部审校轮次，并交付接近定稿的完整内容与本地 PDF 预览；完成后只等待我进行一次最终确认。第一版交付必须体现完整 JD 的全部主要板块，而不是只复述 jd_requirements.json / match_packet.json 中已经抽出的条目。
`;
}

export function normalizeInitialClassification(value: string) {
  if (["Direct", "Credential Direct", "Coursework Match"].includes(value)) return "Direct";
  if (value === "Strong Transferable") return "Transferable";
  if (["Adjacent", "Credential Status Gap"].includes(value)) return "Adjacent";
  return "Unsupported";
}
