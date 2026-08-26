import type { ArchiveTrack } from "./application-archive";

export const automationTaskStatuses = [
  "awaiting_cv",
  "ready_for_browser",
  "claimed",
  "filling",
  "needs_review",
  "submitted",
  "screened_out",
  "cv_failed",
  "failed_retryable",
  "cancelled",
] as const;

export type AutomationTaskStatus = (typeof automationTaskStatuses)[number];
export type AutomationExecutionMode = "pilot" | "automatic";
export type AutomationAtsProvider = "greenhouse" | "lever" | "ashby" | "workday" | "icims" | "unknown";

export type AutomationConfig = {
  enabled: boolean;
  executionMode: AutomationExecutionMode;
  dailyLimit: number;
  minimumScore: number;
  defaultLanguage: "en" | "zh";
  allowedAts: AutomationAtsProvider[];
  finalSubmitEnabled: boolean;
  updatedAt: string;
};

export type AutomationJobInput = {
  id: number;
  company: string;
  title: string;
  region: string;
  location: string;
  track: string;
  score: number;
  visa: string;
  description: string;
  jobUrl: string;
  status: string;
  discoveredAt: string;
};

export type AutomationDecision = {
  eligible: boolean;
  score: number;
  atsProvider: AutomationAtsProvider;
  templateTrack: ArchiveTrack;
  reasons: string[];
  blockers: string[];
  requiresBrowserReview: boolean;
};

const TARGET_ROLE_RE = /\b(?:data scientist|applied scientist|research scientist|machine learning scientist|ml scientist|statistical scientist|biostatistician|epidemiologist|quantitative researcher|quant researcher|health economics|outcomes research|rwe scientist|clinical data scientist|imaging scientist|decision scientist)\b|生物统计|统计科学家|数据科学家|应用科学家|研究科学家|量化研究|医疗人工智能|医学影像/i;
const EXCLUDED_ROLE_RE = /\b(?:postdoc|postdoctoral|software engineer|frontend|front end|backend|back end|data engineer|product manager|program manager|nlp engineer|llm engineer|language model|generative ai|senior|principal|staff|director|manager|lead|head of|vice president)\b|博士后|前端|后端|软件工程|数据工程|产品经理|大模型|自然语言处理|资深|首席|总监|经理|负责人/i;
const SPONSORSHIP_BLOCK_RE = /\b(?:no|not|unable to|cannot|can not|will not|won't)\s+(?:provide\s+)?(?:visa\s+)?sponsor(?:ship)?\b|\b(?:visa\s+)?sponsorship\s+(?:is\s+)?(?:will\s+not\s+be\s+provided|not\s+(?:available|provided|offered)|unavailable)\b|\bwithout\s+(?:current or future\s+)?sponsorship\b|不提供(?:工作)?签证|不支持(?:工作)?签证/i;
const CITIZENSHIP_BLOCK_RE = /\b(?:must|required to)\s+be\s+(?:a\s+)?u\.?s\.?\s+citizen\b|\bu\.?s\.?\s+citizenship\s+(?:is\s+)?required\b|\bactive\s+(?:security\s+)?clearance\b|\bsecurity clearance\s+(?:is\s+)?required\b|\bitar\b|\bu\.?s\.?\s+person\s+(?:is\s+)?required\b|要求美国公民|必须为美国公民|安全许可/i;
const OPEN_STATUSES = new Set(["开放", "待官网核验"]);

export const defaultAutomationConfig = (now = new Date().toISOString()): AutomationConfig => ({
  enabled: true,
  executionMode: "pilot",
  dailyLimit: 3,
  minimumScore: 75,
  defaultLanguage: "en",
  allowedAts: ["greenhouse", "lever", "ashby"],
  finalSubmitEnabled: false,
  updatedAt: now,
});

export function detectAutomationAts(jobUrl: string): AutomationAtsProvider {
  const value = jobUrl.toLowerCase();
  if (value.includes("greenhouse.io") || value.includes("job-boards.greenhouse")) return "greenhouse";
  if (value.includes("lever.co")) return "lever";
  if (value.includes("ashbyhq.com")) return "ashby";
  if (value.includes("myworkdayjobs.com") || value.includes("workdayjobs.com")) return "workday";
  if (value.includes("icims.com")) return "icims";
  return "unknown";
}

export function recommendAutomationTemplate(job: Pick<AutomationJobInput, "title" | "track" | "description">): ArchiveTrack {
  const signal = `${job.track} ${job.title} ${job.description.slice(0, 2500)}`.toLowerCase();
  if (/quant|systematic|量化|定量/.test(signal)) return "quant";
  if (/consult|strategy|advisory|咨询|战略/.test(signal)) return "consulting";
  if (/neuro|brain|imaging|medical device|clinical data|神经|脑|医学影像|医疗器械/.test(signal)) return "clinical_neuro";
  if (/pharma|biostat|clinical|epidemi|rwe|heor|health economics|healthcare|医药|生物统计|临床|流行病|医疗/.test(signal)) return "pharma";
  return "tech";
}

export function maximumRequiredExperience(text: string) {
  const matches = Array.from(text.matchAll(
    /(?:minimum|at least|requires?|required)\s+(\d+)\+?\s+years?|(?:^|\D)(\d+)\+?\s+years?\s+(?:of\s+)?(?:relevant|related|professional|industry|work)?\s*experience|至少\s*(\d+)\s*年|(?:要求|需具备)\s*(\d+)\s*年/gi,
  ));
  const values = matches.flatMap((match) => match.slice(1).filter(Boolean).map(Number));
  return values.length ? Math.max(...values) : null;
}

export function evaluateAutomationCandidate(
  job: AutomationJobInput,
  config: AutomationConfig,
): AutomationDecision {
  const content = `${job.title}\n${job.description}`;
  const blockers: string[] = [];
  const reasons: string[] = [];
  const atsProvider = detectAutomationAts(job.jobUrl);
  const experienceYears = maximumRequiredExperience(content);

  if (job.region !== "美国") blockers.push("不是美国岗位");
  if (!OPEN_STATUSES.has(job.status)) blockers.push("岗位不是已确认开放状态");
  if (job.score < config.minimumScore) blockers.push(`初筛分数低于 ${config.minimumScore}`);
  if (job.description.trim().length < 400) blockers.push("缺少足够完整的 JD");
  if (!TARGET_ROLE_RE.test(job.title)) blockers.push("岗位标题不属于已确认目标方向");
  if (EXCLUDED_ROLE_RE.test(job.title)) blockers.push("岗位属于明确排除的职级或方向");
  if (!config.allowedAts.includes(atsProvider)) blockers.push("申请系统暂不在自动投递支持范围内");
  if (experienceYears !== null && experienceYears > 3) blockers.push(`明确要求 ${experienceYears} 年经验`);
  if (job.visa === "明确不支持" || SPONSORSHIP_BLOCK_RE.test(content)) blockers.push("岗位明确不支持未来签证 sponsorship");
  if (CITIZENSHIP_BLOCK_RE.test(content)) blockers.push("岗位包含公民身份、U.S. Person、ITAR 或 Security Clearance 限制");

  if (job.score >= config.minimumScore) reasons.push(`岗位初筛 ${job.score} 分`);
  if (TARGET_ROLE_RE.test(job.title)) reasons.push("岗位标题符合已确认目标范围");
  if (experienceYears === null) reasons.push("JD 未发现超过三年的明确最低年限");
  else if (experienceYears <= 3) reasons.push(`最低经验年限 ${experienceYears} 年，在允许范围内`);
  if (!SPONSORSHIP_BLOCK_RE.test(content) && job.visa !== "明确不支持") reasons.push("未发现明确拒绝 sponsorship 的文本");

  return {
    eligible: blockers.length === 0,
    score: job.score,
    atsProvider,
    templateTrack: recommendAutomationTemplate(job),
    reasons,
    blockers,
    requiresBrowserReview: !config.allowedAts.includes(atsProvider),
  };
}

export function automationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    awaiting_cv: "等待 CV",
    ready_for_browser: "等待浏览器填写",
    claimed: "浏览器已领取",
    filling: "正在填写",
    needs_review: "需要一次确认",
    submitted: "已自动投递",
    screened_out: "已筛除",
    cv_failed: "CV 生成失败",
    failed_retryable: "执行失败，可重试",
    cancelled: "已取消",
  };
  return labels[status] ?? status;
}
