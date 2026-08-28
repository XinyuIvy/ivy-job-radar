import {
  ARCHIVE_REPOSITORY,
  canonicalSnapshotFiles,
  newYorkYear,
  templateFiles,
  type ArchiveLanguage,
  type ArchiveTrack,
} from "./application-archive";
import { cvLanguageGenerationRules, normalizeCvGenerationRules } from "./cv-generation-rules";

export const CV_PREBUILD_PROMPT_VERSION = "cv-prebuilder-v10-current-canonical-amendment";

export type CvPrebuildSourceFile = {
  text: string;
  sha: string;
};

export type CvPrebuildJobInput = {
  id: number;
  company: string;
  title: string;
  region: string;
  location: string;
  track: string;
  jobUrl: string;
  canonicalUrl: string;
  applicationId: string;
  source: string;
};

export type CvPrebuildTemplateSelection = {
  language: ArchiveLanguage;
  track: ArchiveTrack;
  templateFile: string;
  templatePath: string;
};

export type CvPrebuildIdentity = CvPrebuildTemplateSelection & {
  prebuildId: string;
  bundlePath: string;
  generationKey: string;
  jdSha256: string;
  generationRulesSha256: string;
  jobIdentitySha256: string;
  cvCommit: string;
  factMasterSha: string;
  promptVersion: string;
};

const requiredSnapshotNames = [
  ...canonicalSnapshotFiles.map(([, archiveName]) => archiveName),
  "cv_base.tex",
] as const;

function normalizeIdentityText(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function yamlString(value: unknown) {
  return JSON.stringify(String(value ?? ""));
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function recommendCvPrebuildTemplate(
  job: Pick<CvPrebuildJobInput, "region" | "track" | "title">,
  preferredTrack?: ArchiveTrack,
  preferredLanguage?: ArchiveLanguage,
): CvPrebuildTemplateSelection {
  const language: ArchiveLanguage = preferredLanguage ?? (job.region === "中国" ? "zh" : "en");
  const signal = `${job.track} ${job.title}`.toLocaleLowerCase();
  let track: ArchiveTrack = preferredTrack ?? "tech";
  if (!preferredTrack) {
    if (/quant|量化|定量/.test(signal)) track = "quant";
    else if (/consult|咨询/.test(signal)) track = "consulting";
    else if (/neuro|brain|神经|脑科学|medical device|医疗器械/.test(signal)) track = "clinical_neuro";
    else if (/pharma|biostat|clinical|epidemi|rwe|heor|healthcare|medical|医药|医疗|生物统计|临床|流行病/.test(signal)) track = "pharma";
  }

  if (!templateFiles[language][track]) {
    track = track === "clinical_neuro" ? "pharma" : "tech";
  }
  const templateFile = templateFiles[language][track];
  if (!templateFile) throw new Error(`No ${language} template is available for ${track}.`);
  return {
    language,
    track,
    templateFile,
    templatePath: `master/template-cv/${templateFile}`,
  };
}

export async function createCvPrebuildIdentity(input: {
  job: CvPrebuildJobInput;
  jd: string;
  cvCommit: string;
  factMasterSha: string;
  templateTrack?: ArchiveTrack;
  templateLanguage?: ArchiveLanguage;
  generationRules?: string;
  promptVersion?: string;
  date?: Date;
}) {
  const selection = recommendCvPrebuildTemplate(input.job, input.templateTrack, input.templateLanguage);
  const promptVersion = input.promptVersion ?? CV_PREBUILD_PROMPT_VERSION;
  const stableJobIdentity = JSON.stringify({
    jobRowId: input.job.id,
    canonicalUrl: normalizeIdentityText(input.job.canonicalUrl || input.job.jobUrl),
    externalApplicationId: normalizeIdentityText(input.job.applicationId),
    company: normalizeIdentityText(input.job.company),
    title: normalizeIdentityText(input.job.title),
  });
  const generationRules = normalizeCvGenerationRules(input.generationRules);
  const [jobIdentitySha256, jdSha256, generationRulesSha256] = await Promise.all([
    sha256Hex(stableJobIdentity),
    sha256Hex(input.jd.trim()),
    sha256Hex(generationRules),
  ]);
  const generationKey = await sha256Hex(JSON.stringify({
    schemaVersion: "prebuild-generation-v1",
    jobIdentitySha256,
    jdSha256,
    templateFile: selection.templateFile,
    cvCommit: input.cvCommit,
    factMasterSha: input.factMasterSha,
    generationRulesSha256,
    promptVersion,
  }));
  const year = newYorkYear(input.date);
  const prebuildId = `PRECV-${year}-JOB-${input.job.id}-${generationKey.slice(0, 8).toUpperCase()}`;
  return {
    ...selection,
    prebuildId,
    bundlePath: `prebuilds/${year}/${prebuildId}`,
    generationKey,
    jdSha256,
    generationRulesSha256,
    jobIdentitySha256,
    cvCommit: input.cvCommit,
    factMasterSha: input.factMasterSha,
    promptVersion,
  } satisfies CvPrebuildIdentity;
}

export function buildCvPrebuildJobRecord(input: {
  job: CvPrebuildJobInput;
  identity: CvPrebuildIdentity;
  capturedAt: string;
}) {
  return [
    "schema_version: prebuild-bundle-v1",
    `prebuild_id: ${yamlString(input.identity.prebuildId)}`,
    `bundle_path: ${yamlString(input.identity.bundlePath)}`,
    `generation_key: ${yamlString(input.identity.generationKey)}`,
    "temporary_preview: true",
    "application_id: null",
    "job_radar_mapping:",
    `  job_row_id: ${input.job.id}`,
    "  application_row_id: null",
    `company: ${yamlString(input.job.company)}`,
    `title: ${yamlString(input.job.title)}`,
    `region: ${yamlString(input.job.region)}`,
    `location: ${yamlString(input.job.location)}`,
    `industry_track: ${yamlString(input.identity.track)}`,
    `language: ${yamlString(input.identity.language)}`,
    `job_url: ${yamlString(input.job.jobUrl)}`,
    `source: ${yamlString(input.job.source)}`,
    `captured_at: ${yamlString(input.capturedAt)}`,
    "source_versions:",
    "  cv_repository: XinyuIvy/CV",
    `  cv_commit: ${yamlString(input.identity.cvCommit)}`,
    `  cv_template_path: ${yamlString(input.identity.templatePath)}`,
    `  job_identity_sha256: ${yamlString(input.identity.jobIdentitySha256)}`,
    `  jd_sha256: ${yamlString(input.identity.jdSha256)}`,
    `  generation_rules_sha256: ${yamlString(input.identity.generationRulesSha256)}`,
    `  fact_master_sha: ${yamlString(input.identity.factMasterSha)}`,
    `  prompt_version: ${yamlString(input.identity.promptVersion)}`,
    "authorization:",
    "  create_application_record: false",
    "  mutate_application_status: false",
    "  write_final_cv_to_repository: false",
    "  create_submitted_pdf: false",
    "  local_temporary_tex_pdf: true",
    "  human_final_confirmation_required: true",
    "required_initial_inputs:",
    "  - job_record.yaml",
    "  - jd_snapshot.md",
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
    "  - prebuild_prompt.txt",
    "",
  ].join("\n");
}

export function buildCvPrebuildPrompt(input: {
  identity: CvPrebuildIdentity;
  jd: string;
  generationRules: string;
}) {
  const languageLabel = input.identity.language === "zh" ? "中文（zh）" : "English（en）";
  const languageRules = cvLanguageGenerationRules(input.identity.language);
  return `请为临时任务 \`${input.identity.prebuildId}\` 预生成一份接近定稿、但尚未获得用户最终确认的定向 CV。

Job Radar 已从私有仓库 \`${ARCHIVE_REPOSITORY}\` 的 \`main\` 分支冻结完整目录 \`${input.identity.bundlePath}/\`。完整事实材料保留在该归档中；本次 Responses API 附件包含完整 JD、CV 母版、展示规则、完整事实母版、baseline canonical indexes，以及当前 structured amendment \`canonical_current_addendum.jsonl\` 的按 JD 确定性切片。必须逐一读取已附加文件和 \`agent_context_manifest.md\`；不得把未附加的事实当成已验证证据。

本次冻结语言为 **${languageLabel}**，临时推荐母版为 **\`${input.identity.templateFile}\`**，CV 来源 commit 为 \`${input.identity.cvCommit}\`。这些文件必须来自同一冻结版本，不得改读 CV 仓库的更新 main，也不得自行切换语言或母版。

完整 JD 是岗位要求的主权威，必须从 \`jd_snapshot.md\` 读取，不得只依赖职位名或索引摘要。候选人做过什么、本人贡献、方法、工具、数据、结果、数字、年月、作者身份和论文状态，以完整 \`fact_master_snapshot.md\` 为第一最高权威。Baseline canonical indexes 与 \`canonical_current_addendum.jsonl\` 只用于结构化召回、证据定位和边界核验；如果 current addendum 明确以相同 record ID supersede baseline canonical record，则在 canonical 层采用 current addendum，但它不能覆盖完整事实母版或凭检索结果创造事实。

以下是用户在启动前可编辑的本次生成规则。必须逐轮执行并把每轮判断与实际改动写入 \`cv_review.md\`。这些规则可以控制岗位画像、内容取舍、改写程度和风格，但不能覆盖冻结事实、禁止编造、固定语言与模板，以及禁止自动提交等边界。

----- BEGIN USER-EDITABLE CV GENERATION RULES -----
${input.generationRules.trim()}
----- END USER-EDITABLE CV GENERATION RULES -----

下面是本次冻结语言对应的专项写作规则。它只适用于当前语言，是一级质量约束，不能被上面的可编辑规则删除或改成另一语言的写法。

----- BEGIN CURRENT LANGUAGE-SPECIFIC RULES -----
${languageRules}
----- END CURRENT LANGUAGE-SPECIFIC RULES -----

不得为贴合 JD 编造事实、改变论文状态或扩大贡献。规则与事实发生冲突时，以完整事实母版为准；structured canonical 发生同 ID 冲突时采用 current amendment，并在审校记录中说明冲突。

在 hosted shell 的 \`/mnt/data\` 创建 TeX、PDF、纯文本和审校记录，用 LuaLaTeX 编译并用 \`pdfinfo\` 与文本提取检查：不超过两个物理页面，内容尽量接近但不挤满两页，不缩小字体或破坏母版间距硬塞，也不添加弱相关内容凑页。交付岗位画像、项目/论文取舍、关键词覆盖、完整临时 CV、实际 PDF 页数和可打开的临时 PDF，然后在这个岗位自己的持久 CV Chat 中等待用户确认。

这是 PRECV 临时预览。禁止创建 application/APP ID，禁止修改申请状态，禁止自动提交，禁止写入任何 \`cv_customized_<APP-ID>\` 或 \`cv_submitted_<APP-ID>\` 文件，禁止把临时 TeX/PDF 写回任何仓库。只有用户以后明确进入正式申请和最终确认流程时，才能按正式 APP bundle 的边界继续。
`;
}

export function buildCvPrebuildBundleFiles(input: {
  job: CvPrebuildJobInput;
  identity: CvPrebuildIdentity;
  jd: string;
  generationRules: string;
  capturedAt: string;
  sources: Record<string, CvPrebuildSourceFile>;
}) {
  for (const filename of requiredSnapshotNames) {
    if (!input.sources[filename]?.text) throw new Error(`Missing frozen CV source: ${filename}`);
  }

  const files: Record<string, string> = {
    [`${input.identity.bundlePath}/job_record.yaml`]: buildCvPrebuildJobRecord(input),
    [`${input.identity.bundlePath}/jd_snapshot.md`]: `# ${input.job.company} - ${input.job.title}\n\n${input.jd.trim()}\n`,
    [`${input.identity.bundlePath}/prebuild_prompt.txt`]: buildCvPrebuildPrompt(input),
  };
  for (const filename of requiredSnapshotNames) {
    const content = input.sources[filename].text;
    files[`${input.identity.bundlePath}/${filename}`] = content.endsWith("\n") ? content : `${content}\n`;
  }
  return files;
}
