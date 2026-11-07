import { excludedJobGeography } from "./job-geography";

export type HardExclusionJobInput = {
  location?: string;
  title: string;
  description?: string;
  region?: string;
  visa?: string;
};

const excludedTitlePatterns: ReadonlyArray<RegExp> = [
  /\b(?:senior|sr\.?|principal|staff|lead|manager|director|head|vice president|vp)\b/i,
  /\b(?:intern|internship|postdoc|postdoctoral)\b/i,
  /\b(?:software engineer|data engineer|machine learning engineer|nlp engineer)\b/i,
  /(?:高级|资深|负责人|经理|总监|主管|实习|博士后|软件工程师|数据工程师|机器学习工程师)/,
  /\b(?:statistical programmer|statistical programming|clinical programmer|sas programmer|clinical data manager|clinical data coordinator|clinical data management)\b/i,
  /(?:统计编程师|统计程序师|临床统计程序师|临床编程专员|临床数据管理专员|临床数据管理员|临床数据管理)/,
];

const ambiguousTitlePatterns: ReadonlyArray<RegExp> = [
  /^(?:campus recruitment|university recruiting|general application|talent community|open application)$/i,
  /^(?:校园招聘|社会招聘|人才库|通用岗位|职位申请)$/,
];

export function maximumRequiredExperience(value: string) {
  const text = value.normalize("NFKC");
  const numbers: number[] = [];
  const patterns: ReadonlyArray<RegExp> = [
    /(?:minimum|at least|requires?|required|must have|qualifications?)[^.;\n]{0,70}?([0-9]{1,2})\+?\s*(?:years?|yrs?)(?:\s+of)?\s*(?:relevant|professional|industry|work|research)?\s*experience/gi,
    /([0-9]{1,2})\+?\s*(?:years?|yrs?)(?:\s+of)?\s*(?:relevant|professional|industry|work|research)?\s*experience/gi,
    /(?:zero|0)\s*(?:to|[-–—])\s*([0-9]{1,2})\s*(?:years?|yrs?)(?:\s+of)?\s*(?:relevant|professional|industry|work|research)?\s*experience/gi,
    /(?:至少|最低|要求|须有|需要)[^。；\n]{0,25}?([0-9]{1,2})\s*年(?:以上)?(?:相关|专业|行业|工作|研究|研发)?经验/g,
    /([0-9]{1,2})\s*年(?:以上)?(?:相关|专业|行业|工作|研究|研发)?经验/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) numbers.push(parsed);
    }
  }
  return numbers.length ? Math.max(...numbers) : 0;
}

export function hardJobExclusionReasons(job: HardExclusionJobInput) {
  const title = job.title.normalize("NFKC").trim();
  const description = String(job.description ?? "").normalize("NFKC");
  const combined = `${title}\n${description}`;
  const reasons: string[] = [];
  if (excludedJobGeography(job)) reasons.push("工作地点位于欧洲或非洲，按地区偏好排除");
  const requiredExperience = maximumRequiredExperience(combined);

  if (!title || ambiguousTitlePatterns.some((pattern) => pattern.test(title))) {
    reasons.push("岗位标题不明确");
  }
  if (excludedTitlePatterns.some((pattern) => pattern.test(title))) {
    reasons.push("岗位标题属于排除职级或排除方向");
  }
  if (requiredExperience > 3) {
    reasons.push(`明确要求 ${requiredExperience} 年经验，超过当前 3 年上限`);
  }
  if (
    /(?:CDISC|SDTM|ADaM|TFL)/i.test(combined)
    && /(?:deliver|production|generate|create|submit|交付|生成|制作|提交)/i.test(combined)
  ) {
    reasons.push("岗位以CDISC/SDTM/ADaM/TFL生产交付为主要职责");
  }
  if (
    /(?:EDC|CRF|query management|data cleaning|database lock|数据清理|质疑管理|数据库锁库)/i.test(combined)
    && /(?:clinical data management|clinical data manager|临床数据管理|临床数据管理员)/i.test(combined)
  ) {
    reasons.push("岗位属于纯临床数据管理方向");
  }

  if (job.region === "美国") {
    if (
      /(?:no|not|without|unable to)\s+(?:visa\s+)?sponsorship|(?:visa\s+)?sponsorship\s+(?:is\s+|will\s+)?not\s+(?:be\s+)?(?:available|provided|offered)|will\s+not\s+(?:provide|offer)\s+(?:visa\s+)?sponsorship/i.test(combined)
      || /(?:不提供|无法提供|不支持).{0,12}(?:签证|sponsorship)/i.test(combined)
      || /不接受.{0,12}(?:需要|未来需要).{0,12}(?:签证|sponsorship)/i.test(combined)
      || /不提供|不支持/.test(String(job.visa ?? ""))
    ) {
      reasons.push("岗位明确拒绝或不提供 sponsorship");
    }
    if (/\b(?:u\.?s\.?|united states)\s+citizens?(?:hip)?\b|\bu\.?s\.?\s+persons?\b|美国公民|美国身份/i.test(combined)) {
      reasons.push("岗位要求美国公民身份或 U.S. Person");
    }
    if (/security clearance|active clearance|top secret|secret clearance|安全许可|安全审查/i.test(combined)) {
      reasons.push("岗位要求安全许可或 security clearance");
    }
    if (/\bITAR\b|export control(?:led)?|出口管制/i.test(combined)) {
      reasons.push("岗位受 ITAR 或出口管制身份限制");
    }
  }

  return [...new Set(reasons)];
}
