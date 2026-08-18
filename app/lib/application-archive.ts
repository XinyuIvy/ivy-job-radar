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
    "  application_status_mutation_authorized: false",
    "required_initial_inputs:",
    "  - application_record.yaml",
    "  - jd_snapshot.md",
    "  - jd_requirements.json",
    "  - match_packet.json",
    "  - fact_master_snapshot.md",
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

export function buildChatPrompt(archiveId: string, path: string) {
  const customizedTex = `cv_customized_${archiveId}.tex`;
  const customizedPdf = `cv_customized_${archiveId}.pdf`;
  const submittedPdf = `cv_submitted_${archiveId}.pdf`;

  return `请为申请 \`${archiveId}\` 定制定向 CV。

请从私有仓库 \`${ARCHIVE_REPOSITORY}\` 的 \`main\` 分支读取目录：

\`${path}/\`

首先只读取以下申请输入：

- \`application_record.yaml\`
- \`jd_snapshot.md\`
- \`jd_requirements.json\`
- \`match_packet.json\`
- \`fact_master_snapshot.md\`
- \`canonical_project_index.jsonl\`
- \`canonical_fact_index.jsonl\`
- \`canonical_capability_index.jsonl\`
- \`canonical_concept_index.jsonl\`
- \`canonical_relation_index.jsonl\`
- \`canonical_retrieval_index.jsonl\`
- \`cv_base.tex\`

如果申请 ID、目录或任何必需文件不存在，立即停止并明确告诉我缺少什么。不要根据聊天记忆、岗位名称或相似申请猜测。

\`match_packet.json\` 只是 Job Radar 的初步分类，不是最终结论。请读取完整 JD、完整事实母版、canonical indexes 和当前 CV，独立审核每项 JD 要求属于 Direct、Transferable、Adjacent 还是 Unsupported。你可以纠正、补充或推翻 Job Radar 的分类，但必须说明事实依据。

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

完成分类审核后，不要修改 TeX。先给我纯文本内容方案，包括：summary、skills、经历或项目选择、项目顺序、每条 bullet、关键词覆盖和需要删减的内容。我们在 Chat 里逐条调整，直到我明确说“内容定稿”。

在我确认内容定稿之前：

- 不修改或生成 TeX
- 不生成 PDF
- 不改变申请状态
- 不写入任何仓库

我确认内容定稿后，才从 \`cv_base.tex\` 创建本申请自己的 \`${customizedTex}\`。文件名必须保留完整 application ID，不得简化为 \`cv_customized.tex\` 或其他不带 application ID 的名称。必须保持母版的 document class、packages、字体、字号、页边距、section 样式、bullet 样式、行距、项目间距、联系方式格式、日期和地点排版、\`\\hfill\` 规则及全部自定义命令。可以调整文字和项目顺序，但不得重新设计版式，也不得通过明显缩小字体强行塞进两页。

TeX 内容确认无误后，把 \`${customizedTex}\` 写入本申请目录并提交到 \`${ARCHIVE_REPOSITORY}\` 的 \`main\`。这次 TeX 提交会自动触发 GitHub Actions 中的 \`Build customized CV PDF\` workflow。不要在 Chat 中把 PDF 二进制重新编码成 base64、分块传输，或通过 GitHub connector 手动上传 PDF。

提交 TeX 后，检查并等待该 GitHub Action 完成。workflow 会调用仓库的 \`scripts/build_cv.sh\`，使用 XeLaTeX 生成 \`${customizedPdf}\`，检查不超过两页，并使用 \`pdftotext\` 验证 ATS 文本可提取；验证成功后由 GitHub 自动把 \`${customizedPdf}\` 提交回同一个申请目录。如果 workflow 失败，读取失败步骤或日志，修正 TeX 后重新提交；在 workflow 成功且 PDF 文件确实存在之前，不得声称已经生成 PDF。

GitHub Action 成功后，再读取并检查 \`${customizedPdf}\` 的最终版式、分页、异常断行和内容。最终仍需经过我的 PDF 确认。在我明确确认实际投递版本之前，不创建 \`${submittedPdf}\`。如果我确认这就是实际投递版本，再从已经验证过的 \`${customizedPdf}\` 保存 \`${submittedPdf}\`，不得重新编译或通过 Chat 重新上传一份二进制 PDF。不得修改其他申请，也不得覆盖 \`XinyuIvy/CV\` 中的行业母版。

现在只执行读取、独立分类审核和第一版纯文本内容建议，完成后停下来等我确认。
`;
}

export function normalizeInitialClassification(value: string) {
  if (["Direct", "Credential Direct", "Coursework Match"].includes(value)) return "Direct";
  if (value === "Strong Transferable") return "Transferable";
  if (["Adjacent", "Credential Status Gap"].includes(value)) return "Adjacent";
  return "Unsupported";
}
