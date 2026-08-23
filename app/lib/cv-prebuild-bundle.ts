import {
  ARCHIVE_REPOSITORY,
  canonicalSnapshotFiles,
  newYorkYear,
  templateFiles,
  type ArchiveLanguage,
  type ArchiveTrack,
} from "./application-archive";

export const CV_PREBUILD_PROMPT_VERSION = "cv-prebuilder-v1";

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

export function recommendCvPrebuildTemplate(job: Pick<CvPrebuildJobInput, "region" | "track" | "title">): CvPrebuildTemplateSelection {
  const language: ArchiveLanguage = job.region === "中国" ? "zh" : "en";
  const signal = `${job.track} ${job.title}`.toLocaleLowerCase();
  let track: ArchiveTrack = "tech";
  if (/quant|量化|定量/.test(signal)) track = "quant";
  else if (/consult|咨询/.test(signal)) track = "consulting";
  else if (/neuro|brain|神经|脑科学|medical device|医疗器械/.test(signal)) track = "clinical_neuro";
  else if (/pharma|biostat|clinical|epidemi|rwe|heor|医药|生物统计|临床|流行病/.test(signal)) track = "pharma";

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
  promptVersion?: string;
  date?: Date;
}) {
  const selection = recommendCvPrebuildTemplate(input.job);
  const promptVersion = input.promptVersion ?? CV_PREBUILD_PROMPT_VERSION;
  const stableJobIdentity = JSON.stringify({
    jobRowId: input.job.id,
    canonicalUrl: normalizeIdentityText(input.job.canonicalUrl || input.job.jobUrl),
    externalApplicationId: normalizeIdentityText(input.job.applicationId),
    company: normalizeIdentityText(input.job.company),
    title: normalizeIdentityText(input.job.title),
  });
  const [jobIdentitySha256, jdSha256] = await Promise.all([
    sha256Hex(stableJobIdentity),
    sha256Hex(input.jd.trim()),
  ]);
  const generationKey = await sha256Hex(JSON.stringify({
    schemaVersion: "prebuild-generation-v1",
    jobIdentitySha256,
    jdSha256,
    templateFile: selection.templateFile,
    cvCommit: input.cvCommit,
    factMasterSha: input.factMasterSha,
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
    "  - cv_base.tex",
    "  - prebuild_prompt.txt",
    "",
  ].join("\n");
}

export function buildCvPrebuildPrompt(input: {
  identity: CvPrebuildIdentity;
  jd: string;
}) {
  const languageLabel = input.identity.language === "zh" ? "中文（zh）" : "English（en）";
  return `请为临时任务 \`${input.identity.prebuildId}\` 预生成一份接近定稿、但尚未获得用户最终确认的定向 CV。

从私有仓库 \`${ARCHIVE_REPOSITORY}\` 的 \`main\` 分支完整读取目录 \`${input.identity.bundlePath}/\`。必须逐一读取 \`job_record.yaml\`、完整 \`jd_snapshot.md\`、事实母版、展示规则、全部 canonical indexes、\`cv_base.tex\` 和本文件；任何必需文件缺失或截断时立即停止。

本次冻结语言为 **${languageLabel}**，临时推荐母版为 **\`${input.identity.templateFile}\`**，CV 来源 commit 为 \`${input.identity.cvCommit}\`。这些文件必须来自同一冻结版本，不得改读 CV 仓库的更新 main，也不得自行切换语言或母版。

完整 JD 是岗位要求的主权威：

----- BEGIN CONFIRMED FULL JD -----
${input.jd.trim()}
----- END CONFIRMED FULL JD -----

执行一次任务内的连续审校：先建立岗位角色画像并判断研究/学术产出、应用/业务交付或混合导向；再根据完整 JD 选择经历、项目、论文和关键词；随后逐项对照事实母版与 canonical indexes 核验事实和贡献边界；最后才进行风格与中文/英文语言审校。行业或实习经历必须独立成节，研究型项目与应用型项目至少分成两个不同 section，每个项目只出现一次。只要包含学术传播或综合成果，必须写“以第一作者身份在九个学术会议作报告”。所有研究、项目、实习、工作和软件系统必须精确到开始年月与结束年月；缺月时停止并询问，不得猜测。

中文个人简介写“博士候选人”，不写大学名或预计毕业时间；SQL 只写 \`SQL\`，不得加入 TypeScript 或 React；中文地点使用“城市，国家”；必要括注英文首字母大写；脑区皮层必须写清楚。不得为贴合 JD 编造事实、改变论文状态或扩大贡献。

在 Agent 的本地临时工作区创建 TeX 和 PDF，用 LuaLaTeX 编译并用 \`pdfinfo\` 与文本提取检查：不超过两个物理页面，内容尽量接近但不挤满两页，不缩小字体或破坏母版间距硬塞，也不添加弱相关内容凑页。交付岗位画像、项目/论文取舍、关键词覆盖、完整临时 CV、实际 PDF 页数和可打开的临时 PDF，然后等待用户确认。

这是 PRECV 临时预览。禁止创建 application/APP ID，禁止修改申请状态，禁止自动提交，禁止写入任何 \`cv_customized_<APP-ID>\` 或 \`cv_submitted_<APP-ID>\` 文件，禁止把临时 TeX/PDF 写回任何仓库。只有用户以后明确进入正式申请和最终确认流程时，才能按正式 APP bundle 的边界继续。
`;
}

export function buildCvPrebuildBundleFiles(input: {
  job: CvPrebuildJobInput;
  identity: CvPrebuildIdentity;
  jd: string;
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
