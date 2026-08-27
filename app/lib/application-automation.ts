import type { ArchiveTrack } from "./application-archive";
import {
  evaluateTodayShortlistCandidate,
  type ShortlistJobInput,
} from "./job-shortlist";

export const automationTaskStatuses = [
  "awaiting_user_approval",
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

export type AutomationJobInput = ShortlistJobInput & {
  id: number;
  location: string;
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

export const defaultAutomationConfig = (now = new Date().toISOString()): AutomationConfig => ({
  enabled: true,
  executionMode: "pilot",
  dailyLimit: 10,
  minimumScore: 55,
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

export { maximumRequiredExperience } from "./job-shortlist";

export function evaluateAutomationCandidate(
  job: AutomationJobInput,
  config: AutomationConfig,
): AutomationDecision {
  const atsProvider = detectAutomationAts(job.jobUrl);
  const shortlist = evaluateTodayShortlistCandidate(job);
  const blockers = [...shortlist.blockers];
  const reasons = [...shortlist.reasons];

  if (job.region !== "美国") blockers.push("不是美国岗位");
  if (shortlist.fitScore < config.minimumScore) blockers.push(`综合匹配分低于 ${config.minimumScore}`);
  if (!config.allowedAts.includes(atsProvider)) blockers.push("申请系统暂不在自动投递支持范围内");
  if (job.region === "美国" && !shortlist.blockers.some((value) => value.includes("sponsorship"))) reasons.push("未发现明确拒绝 sponsorship 的文本");

  return {
    eligible: blockers.length === 0,
    score: shortlist.fitScore,
    atsProvider,
    templateTrack: recommendAutomationTemplate(job),
    reasons: [...new Set(reasons)],
    blockers: [...new Set(blockers)],
    requiresBrowserReview: !config.allowedAts.includes(atsProvider),
  };
}

export function automationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    awaiting_user_approval: "等待整批确认",
    awaiting_cv: "等待 CV",
    ready_for_browser: "等待浏览器填写",
    claimed: "浏览器已领取",
    filling: "正在填写",
    needs_review: "待你浏览并提交",
    submitted: "已确认提交",
    screened_out: "已筛除",
    cv_failed: "CV 生成失败",
    failed_retryable: "执行失败，可重试",
    cancelled: "已取消",
  };
  return labels[status] ?? status;
}
