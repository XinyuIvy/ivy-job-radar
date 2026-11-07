import { hardJobExclusionReasons, maximumRequiredExperience } from "./job-hard-exclusions";

export type ShortlistJobInput = {
  location?: string;
  company?: string;
  title: string;
  region: string;
  track?: string;
  score: number;
  visa?: string;
  description: string;
  jobUrl?: string;
  status?: string;
  deadline?: string;
  deadlineType?: string;
  discoveredAt?: string;
  checkedAt?: string;
  source?: string;
  evidence?: string;
};

export type ShortlistDecision = {
  eligible: boolean;
  fitScore: number;
  reasons: string[];
  blockers: string[];
};

const targetTitlePattern = /(?:data scientist|applied scientist|research scientist|decision scientist|quantitative researcher|quantitative analyst|statistical scientist|biostatistician|epidemiologist|health econom|outcomes research|algorithm validation|imaging scientist|clinical data scientist|rwe scientist|real world evidence|healthcare consultant|life sciences consultant|medical affairs|pharmacometrics|quantitative pharmacology|pk\/?pd|\bhe\/?rwi\b|\brwd&t\b|\brwe\/?rwa\b|数据科学|应用科学家|研究科学家|算法科学家|决策科学家|算法研究员|创新算法|科学计算|计算科学家|计算生物|ai for science|生物统计|统计科学家|临床统计|医学统计|统计师|流行病|真实世界|卫生经济|健康经济|结局研究|量化研究|定量研究|量化分析|定量药理|药代动力学|医学影像|影像科学家|科研合作|医疗事务|医疗咨询|医药咨询|生命科学咨询)/i;

const openStatuses = new Set(["", "开放", "open", "active", "rolling"]);

export function isSpreadsheetApprovedCandidate(job: ShortlistJobInput) {
  const source = String(job.source ?? "");
  const evidence = String(job.evidence ?? "");
  const status = String(job.status ?? "").normalize("NFKC").trim().toLocaleLowerCase();
  return source.includes("Excel同步")
    && /Excel结论：(直接可投|条件型可投)/.test(evidence)
    && openStatuses.has(status);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function hasCompleteDescription(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length >= 160 && /(?:responsibil|qualif|require|role|experience|职责|要求|资格|岗位)/i.test(normalized);
}

export function evaluateTodayShortlistCandidate(
  job: ShortlistJobInput,
  _options: { now?: string } = {},
): ShortlistDecision {
  void _options;
  const title = job.title.normalize("NFKC").trim();
  const description = String(job.description ?? "").normalize("NFKC").trim();
  const status = String(job.status ?? "").normalize("NFKC").trim().toLocaleLowerCase();
  const blockers = hardJobExclusionReasons(job);
  const reasons: string[] = [];
  const fitScore = clampScore(job.score);

  if (!targetTitlePattern.test(title)) blockers.push("岗位标题不属于已确认目标方向");
  else reasons.push("岗位标题属于已确认目标方向");

  if (!hasCompleteDescription(description)) blockers.push("缺少可核验的完整 JD");
  else reasons.push("已保存可核验的完整 JD");

  if (!openStatuses.has(status)) blockers.push("岗位当前未确认开放");
  reasons.push(`综合匹配分 ${fitScore}（仅供排序）`);

  const years = maximumRequiredExperience(description);
  if (years > 0 && years <= 3) reasons.push(`经验要求不超过 ${years} 年`);
  if (job.region === "美国" && !blockers.some((value) => value.includes("sponsorship"))) {
    reasons.push("未发现明确拒绝 sponsorship 的文本");
  }

  const uniqueBlockers = [...new Set(blockers)];
  return {
    eligible: uniqueBlockers.length === 0,
    fitScore,
    reasons: [...new Set(reasons)],
    blockers: uniqueBlockers,
  };
}

export { maximumRequiredExperience } from "./job-hard-exclusions";
