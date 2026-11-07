import { cvLanguageGenerationRules } from "./cv-generation-rules";
import {
  buildCvPromptV194SharedContract,
  CV_PROMPT_SOURCE_SHA256,
  CV_PROMPT_STATUS,
  CV_PROMPT_VERSION,
} from "./cv-prompt-v194";

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
  ["master/project-evidence/CANONICAL_CURRENT_ADDENDUM.jsonl", "canonical_current_addendum.jsonl"],
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

export function resolveApplicationRecordIds(input: {
  company: string;
  id: number;
  applicationId?: string;
  archiveId?: string;
}) {
  const externalApplicationId = String(input.applicationId ?? "").trim();
  const legacyArchiveId = /^APP-\d{4}-[A-Z0-9]{3,12}-\d{3,}$/i.test(externalApplicationId)
    ? externalApplicationId.toUpperCase()
    : "";
  return {
    archiveId: stableArchiveId(
      input.company,
      input.id,
      String(input.archiveId ?? "").trim() || legacyArchiveId,
    ),
    applicationId: legacyArchiveId ? "" : externalApplicationId,
  };
}

export function archivePath(archiveId: string) {
  const year = archiveId.match(/^APP-(\d{4})-/)?.[1] ?? String(newYorkYear());
  return `applications/${year}/${archiveId}`;
}

export function frozenResumeVersion(templateFile: string, cvCommit: string) {
  const normalizedCommit = cvCommit.trim().toLowerCase();
  return `${templateFile}@${normalizedCommit.slice(0, 12)}`;
}

export function buildSubmittedTemplateManifest(input: {
  archiveId: string;
  templateFile: string;
  templatePath: string;
  cvCommit: string;
  submittedPdf: string;
  capturedAt: string;
}) {
  return {
    schema_version: "submitted-template-freeze-v1",
    application_id: input.archiveId,
    source: "selected_cv_template",
    template_filename: input.templateFile,
    template_path: input.templatePath,
    cv_repository: "XinyuIvy/CV",
    cv_commit: input.cvCommit,
    submitted_pdf: input.submittedPdf,
    captured_at: input.capturedAt,
    immutable_submission_snapshot: true,
  };
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
  externalApplicationId?: string;
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
    `external_application_id: ${yamlString(input.externalApplicationId)}`,
    `source: ${yamlString(input.source)}`,
    `captured_at: ${yamlString(input.capturedAt)}`,
    "source_versions:",
    "  cv_repository: XinyuIvy/CV",
    `  cv_commit: ${yamlString(input.cvCommit)}`,
    `  cv_template_path: ${yamlString(input.templatePath)}`,
    `  prompt_version: ${yamlString(CV_PROMPT_VERSION)}`,
    `  prompt_status: ${yamlString(CV_PROMPT_STATUS)}`,
    `  prompt_source_sha256: ${yamlString(CV_PROMPT_SOURCE_SHA256)}`,
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
    "  - canonical_current_addendum.jsonl",
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
  const languageRules = cvLanguageGenerationRules(language);
  const sharedContract = buildCvPromptV194SharedContract();
  const languageDirective = language === "zh"
    ? "最终 CV 的个人简介、专业能力、经历、项目和论文/荣誉等自然语言内容必须使用中文；公司、院校、论文、方法和软件可按冻结规则保留官方英文。不得因 JD 或事实库是英文而切换成英文 CV。"
    : "The final CV must use English for all natural-language sections, bullets, and labels. Do not switch to Chinese because an input contains Chinese.";

  return `请为正式申请 \`${archiveId}\` 定制定向 CV。当前执行版本是 **${CV_PROMPT_VERSION}**。

从私有仓库 \`${ARCHIVE_REPOSITORY}\` 的 main 分支完整读取目录 \`${path}/\`。只处理这一份申请，不修改其他 APP、CV 母版或申请状态。

## 冻结语言与母版

- 输出语言：${languageLabel}
- 已确认母版：\`${templateFile}\`
- ${languageDirective}
- application_record.yaml 的 language、source_versions.cv_template_path 与 cv_base.tex 必须一致；不一致时停止，不自行换语言或母版。

## 完整 JD 核对

下方是 Job Radar 中人工确认并冻结的完整 JD。逐字读完，再把 jd_snapshot.md 从第一行读到 EOF 并核对一致性；若 connector 截断就继续分段读取。两者不一致时停止，不自行选择。

----- BEGIN CONFIRMED FULL JD -----
${confirmedFullJd}
----- END CONFIRMED FULL JD -----

随后完整读取 application_record.yaml、jd_requirements.json、match_packet.json、fact_master_snapshot.md、cv_display_rules_snapshot.yaml、全部 canonical_*.jsonl 和 cv_base.tex。jd_requirements.json 与 match_packet.json 只是召回和初步分类，绝对不能替代完整 JD；match_packet 是初步分类，不是最终结论。

${sharedContract}

## 当前语言专项规则

${languageRules}

## 正式 APP 的本地预览与最终归档边界

先按共享合同一次性完成内容、TeX、本地 PDF 和 cv_review.md；不要在中间轮次等待确认。把本地 PDF 作为可打开文件交付，并报告 pdfinfo 的实际页数、文本/字体检查和两页视觉检查结论。完成后只等待一次最终确认。

在用户明确说“PDF定稿”“最终版确认”或同等措辞前，不能写入任何仓库，不能改变申请状态，也不能把本地预览当成归档定稿。automatic_tex_generation_authorized: false；local_chat_pdf_preview_authorized: true；local_preview_repository_write_authorized: false。

最终确认后，将同一份已预览 TeX 保存为 \`${customizedTex}\`。文件名必须保留完整 application ID，不得简化。提交到 \`${ARCHIVE_REPOSITORY}\` main 后等待 GitHub Actions 的 **Build customized CV PDF** workflow；它调用 scripts/build_cv.sh 和 LuaLaTeX 生成并核验 \`${customizedPdf}\`、\`${customizedText}\` 与 \`${buildManifest}\`。不要在 Chat 中把 PDF 二进制编码为 base64 或手动上传。

workflow 成功后读取 \`${customizedText}\` 和 \`${buildManifest}\` 核对页数、ATS 文本和 SHA-256。在 workflow 成功且三个归档产物真实存在之前，不得声称归档 PDF 已生成。用户明确确认实际投递版本之前，不创建 \`${submittedPdf}\`。
`;
}

export function normalizeInitialClassification(value: string) {
  if (["Direct", "Credential Direct", "Coursework Match"].includes(value)) return "Direct";
  if (value === "Strong Transferable") return "Transferable";
  if (["Adjacent", "Credential Status Gap"].includes(value)) return "Adjacent";
  return "Unsupported";
}
