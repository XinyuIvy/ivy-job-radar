export type JobScoreResult = {
  score: number;
  details: string[];
  eligible: boolean;
};

export function sponsorship(text: string) {
  const lower = text.toLowerCase();
  if (/(will not|does not|unable to|not provide).{0,40}(sponsor|sponsorship)/.test(lower)) return "明确不支持";
  if (/(visa|h-?1b).{0,40}(sponsor|sponsorship)|sponsorship available/.test(lower)) return "可能支持";
  return "JD 未明确";
}

export function experienceYears(text: string) {
  const years = [
    ...text.matchAll(/(?:minimum|min\.?|at least|至少)\s*(\d+)\+?\s*(?:years?|年)/gi),
    ...text.matchAll(/(\d+)\+?\s*(?:years?|年)\s+(?:of\s+)?(?:relevant|related|professional|industry|work)?\s*experience/gi),
    ...text.matchAll(/(\d+)\s*年(?:及|或)?以上(?:相关)?(?:工作)?经验/gi),
  ].map((match) => Number(match[1]));
  return years.length ? Math.max(...years) : null;
}

export function scoreJob(
  title: string,
  content: string,
  region: string,
  years: number | null,
  visa: string,
): JobScoreResult {
  const text = `${title} ${content}`;
  const lower = text.toLowerCase();
  const details: string[] = [];
  let score = 0;

  // 1. Degree and career-stage feasibility: 20 points.
  const phdAccepted = /\bph\.?d\.?\b|doctoral|doctorate|博士|硕博|硕士(?:研究生)?(?:及|或)?以上/.test(lower);
  const quantitativeDegree = /statistics|biostatistics|epidemiology|data science|mathematics|economics|quantitative|统计|生物统计/.test(lower);
  if (phdAccepted) score += 10;
  else if (quantitativeDegree) score += 6;
  if (years === null) score += 4;
  else if (years === 0) score += 10;
  else if (years <= 3) score += 8;
  details.push(phdAccepted ? "学历：明确接受博士" : quantitativeDegree ? "学历：接受相关定量专业" : "学历：未确认博士匹配");
  details.push(years === null ? "经验：未写明最低年限" : `经验：最低要求约 ${years} 年`);

  // 2. Core statistics and research strengths: 30 points.
  const coreSignals: Array<[number, RegExp]> = [
    [10, /biostatistics|statistical modeling|statistical analysis|statistics|生物统计|统计建模/],
    [7, /study design|research design|experimental design|clinical trial|研究设计|临床试验/],
    [6, /predictive model|risk prediction|risk stratification|machine learning|预测模型|风险分层/],
    [7, /causal inference|longitudinal|repeated measures|missing data|survival analysis|因果推断|纵向数据|缺失数据/],
  ];
  const coreScore = Math.min(30, coreSignals.reduce((sum, [points, pattern]) => sum + (pattern.test(lower) ? points : 0), 0));
  score += coreScore;
  details.push(`核心专业：${coreScore}/30`);

  // 3. Domain transferability: 20 points.
  const domainSignals: Array<[number, RegExp]> = [
    [8, /clinical|healthcare|medical|patient|ehr|pharma|biotech|临床|医疗|医药/],
    [6, /neuroimaging|medical imaging|multimodal|digital biomarker|wearable|医学影像|神经影像/],
    [6, /real.world evidence|\brwe\b|\bheor\b|epidemiology|pharmacoepidemiology|regulatory science/],
    [5, /experimentation|decision science|product analytics|quantitative research|systematic research/],
  ];
  const domainScore = Math.min(20, domainSignals.reduce((sum, [points, pattern]) => sum + (pattern.test(lower) ? points : 0), 0));
  score += domainScore;
  details.push(`领域迁移：${domainScore}/20`);

  // 4. Verified tools and implementation fit: 15 points.
  let toolScore = 0;
  if (/(?:^|\W)r(?:\W|$)|\brstudio\b/i.test(text)) toolScore += 7;
  if (/\bpython\b/i.test(text)) toolScore += 5;
  if (/data analysis|statistical programming|数据分析/.test(lower)) toolScore += 3;
  score += Math.min(15, toolScore);
  details.push(`工具匹配：${Math.min(15, toolScore)}/15`);

  // 5. Work authorization: 15 points for US roles; neutral for China roles.
  if (region === "美国") {
    if (visa === "可能支持") score += 15;
    else if (visa === "JD 未明确") score += 7;
    details.push(`工作授权：${visa}`);
  } else {
    score += 15;
    details.push("工作授权：中国岗位不适用 sponsorship");
  }

  // Unsupported engineering requirements remain real gaps.
  const aiCoreSignals = [
    /large language model|\bllm\b|\brag\b|natural language processing|\bnlp\b/,
    /fine.tun(?:e|ing)|reinforcement learning|foundation model/,
    /deep learning architecture|computer vision|image segmentation/,
    /production ml|mlops|distributed training|model serving/,
    /full.stack|backend engineer|frontend engineer|software engineering/,
  ];
  const aiGapCount = aiCoreSignals.filter((pattern) => pattern.test(lower)).length;
  if (aiGapCount > 0) {
    score -= Math.min(40, aiGapCount * 15);
    details.push(`硬技能缺口：检测到 ${aiGapCount} 类未具备的核心研发要求`);
  }

  const citizenshipRestricted = /u\.?s\.? citizen|us citizenship|required clearance|security clearance|公民身份/.test(lower);
  const sponsorshipBlocked = region === "美国" && visa === "明确不支持";
  const experienceBlocked = years !== null && years > 3 && !/(ph\.?d\.?|doctorate).{0,80}(?:count|equivalent|substitut)/i.test(content);
  const eligible = !citizenshipRestricted && !sponsorshipBlocked && !experienceBlocked && aiGapCount < 2;

  if (citizenshipRestricted) details.push("硬性限制：要求美国公民身份或安全许可");
  if (sponsorshipBlocked) details.push("硬性限制：明确不提供 sponsorship");
  if (experienceBlocked) details.push("硬性限制：经验要求超过 3 年");

  return { score: Math.max(0, Math.min(100, Math.round(score))), details, eligible };
}

export function scoreStoredJob(input: {
  title: string;
  content: string;
  region: string;
}) {
  const years = experienceYears(input.content);
  const visa = input.region === "中国" ? "不适用" : sponsorship(input.content);
  return {
    ...scoreJob(input.title, input.content, input.region, years, visa),
    years,
    visa,
  };
}
