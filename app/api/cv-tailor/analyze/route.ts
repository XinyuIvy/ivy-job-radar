import { NextRequest, NextResponse } from "next/server";
import {
  parseJsonl,
  runHybridRag,
  type ConceptEdge,
  type FactIndexRecord,
  type HybridCandidate,
  type HybridMatch,
  type IndustryTrack,
} from "../../../lib/hybrid-rag";
import { latexToPlainText } from "../../../lib/latex-text";

export const dynamic = "force-dynamic";

type TemplateLanguage = "en" | "zh";
type EvidenceClassification = "Direct" | "Strong Transferable" | "Adjacent";

type RequirementRule = {
  label: string;
  category: string;
  aliases: string[];
  projectTerms?: string[];
};

type SupportEvidence = {
  projectId: string;
  project: string;
  factId: string;
  fact: string;
  factStatus: string;
  evidenceStrength: string;
  classification: EvidenceClassification;
  relevance: string;
  source: string;
  evidenceLocation: string;
  claimBoundary: string;
  capabilityContext?: string;
  industryTranslation?: string;
  industryGuardrail?: string;
  score?: number;
  retrievalChannels?: string[];
};

type ProjectRecommendation = {
  projectId: string;
  name: string;
  score: number;
  matchedRequirements: string[];
  classifications: EvidenceClassification[];
  alreadyInTemplate: boolean;
  evidence: SupportEvidence | null;
};

type MatchStatus = "covered" | "supported_gap" | "adjacent_gap" | "unsupported_gap";

type RequirementMatch = {
  keyword: string;
  category: string;
  status: MatchStatus;
  supportEvidence: SupportEvidence[];
  templateEvidence: string;
  jdEvidence: string;
  jdMatchedTerms: string[];
};

type ModificationDraft = {
  id: string;
  action: "revise_existing" | "consider_addition";
  projectId: string;
  project: string;
  requirement: string;
  classification: EvidenceClassification;
  factId: string;
  verifiedFact: string;
  proposedBullet: string;
  source: string;
  evidenceLocation: string;
  claimBoundary: string;
  rationale: string;
  latexDiff: { before: string; after: string };
};

const templateFiles: Record<TemplateLanguage, Record<string, string | null>> = {
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

// Compound requirements stay split so one matched concept cannot imply another.
const requirements: RequirementRule[] = [
  { label: "Scientific study design", category: "Research Design", aliases: ["study design", "scientific studies", "clinical studies", "observational", "prospective", "retrospective", "interventional", "研究设计", "实验设计", "试验设计", "课题设计"], projectTerms: ["study design", "clinical trial", "simulation", "endpoint", "研究设计", "试验设计", "模拟", "终点"] },
  { label: "Human-subjects research", category: "Research Design", aliases: ["human subjects", "protocol development", "endpoint selection", "ethics", "irb", "人体研究", "受试者", "临床研究", "伦理审查"], projectTerms: ["clinical trial", "endpoint", "protocol", "ehr", "patient", "participants", "临床试验", "终点", "患者", "受试者"] },
  { label: "Wearable data", category: "Data", aliases: ["wearable", "wearables", "可穿戴"], projectTerms: ["wearable", "digital measurement", "daily diary", "可穿戴", "数字测量", "每日记录"] },
  { label: "Physiological data", category: "Data", aliases: ["physiological", "physiology", "生理数据", "生理信号"], projectTerms: ["physiological", "heart rate", "fev1", "pef", "生理", "心率", "肺功能"] },
  { label: "Clinical data", category: "Data", aliases: ["clinical data", "clinical dataset", "临床数据"], projectTerms: ["clinical", "ehr", "patient", "trial", "临床", "电子病历", "患者", "试验"] },
  { label: "Multimodal data", category: "Data", aliases: ["multimodal data", "multi-modal data", "multimodal", "multi-modal", "多模态"], projectTerms: ["multimodal", "multi-modal", "multiple data sources", "多模态", "多来源"] },
  { label: "Biomedical data", category: "Data", aliases: ["biomedical data", "health data", "生物医学数据", "医疗健康数据"], projectTerms: ["biomedical", "neuroimaging", "clinical", "ehr", "生物医学", "神经影像", "临床"] },
  { label: "Time-series analysis", category: "Methods", aliases: ["time-series", "time series", "temporal data", "时间序列", "时序数据"], projectTerms: ["time series", "temporal", "daily", "longitudinal", "时间序列", "时间外", "每日", "纵向"] },
  { label: "Longitudinal analysis", category: "Methods", aliases: ["longitudinal", "repeated measures", "纵向数据", "纵向分析", "重复测量"], projectTerms: ["longitudinal", "repeated measurements", "gee", "mixed-effects", "纵向", "重复测量", "广义估计方程", "混合效应"] },
  { label: "Regression", category: "Methods", aliases: ["regression", "logistic regression", "linear regression", "回归", "逻辑回归", "线性回归"], projectTerms: ["regression", "回归"] },
  { label: "Mixed-effects models", category: "Methods", aliases: ["mixed models", "mixed-effects", "mixed effects", "混合模型", "混合效应"], projectTerms: ["mixed-effects", "mixed effects", "linear mixed", "混合效应", "混合模型"] },
  { label: "Bayesian methods", category: "Methods", aliases: ["bayesian", "贝叶斯"], projectTerms: ["bayesian", "贝叶斯"] },
  { label: "Machine learning", category: "Methods", aliases: ["machine learning", "machine-learning", "机器学习", "深度学习"], projectTerms: ["machine learning", "random forest", "xgboost", "lightgbm", "neural network", "机器学习", "随机森林", "神经网络"] },
  { label: "Statistical modeling", category: "Methods", aliases: ["statistical modeling", "statistical methods", "statistical analysis", "统计建模", "统计模型", "统计分析", "统计学"], projectTerms: ["statistical", "model", "inference", "统计", "模型", "推断"] },
  { label: "Agent workflow", category: "AI Systems", aliases: ["agent workflow", "agentic workflow", "agent system", "multi-agent", "智能体", "多智能体"], projectTerms: ["multi-agent", "agent orchestration", "orchestrator", "human-in-the-loop", "多智能体", "编排器", "人工监督"] },
  { label: "Tool use and code execution", category: "AI Systems", aliases: ["tool use", "tool calling", "code execution", "工具调用", "代码执行", "实验验证"], projectTerms: ["tool integration", "code execution", "evaluation harness", "工具", "代码实现", "实验验证"] },
  { label: "Reinforcement learning", category: "Methods", aliases: ["reinforcement learning", "ppo", "dpo", "grpo", "强化学习", "奖励设计"], projectTerms: ["reinforcement learning", "ppo", "dpo", "grpo", "强化学习", "奖励"] },
  { label: "Post-training", category: "Methods", aliases: ["post-training", "post training", "后训练", "训练稳定性"], projectTerms: ["post-training", "post training", "后训练"] },
  { label: "Agentic data synthesis", category: "Data Engineering", aliases: ["agentic data synthesis", "trajectory data", "data synthesis", "数据合成", "轨迹数据"], projectTerms: ["agentic data synthesis", "trajectory data", "data synthesis", "数据合成", "轨迹数据"] },
  { label: "Data curation pipeline", category: "Data Engineering", aliases: ["data cleaning", "data filtering", "data augmentation", "data mixture", "data pipeline", "数据清洗", "数据筛选", "数据增强", "数据配比", "数据管线"], projectTerms: ["data cleaning", "pipeline", "quality checks", "数据清洗", "数据核验", "流程"] },
  { label: "Foundation-model development", category: "AI Models", aliases: ["foundation model", "large language model", "llm development", "大语言模型", "大模型"], projectTerms: ["foundation model", "large language model", "llm training", "基础模型", "大模型"] },
  { label: "Multimodal-model development", category: "AI Models", aliases: ["multimodal model", "multi-modal model", "multimodal foundation model", "多模态模型", "多模态大模型"], projectTerms: ["multimodal model", "multi-modal model", "多模态模型"] },
  { label: "Scientific problem solving", category: "Research", aliases: ["problem definition", "scientific problem solving", "科研能力", "问题定义", "创新性解决方案"], projectTerms: ["research question", "methodology", "research design", "研究问题", "方法", "研究设计"] },
  { label: "Paper reproduction", category: "Research", aliases: ["paper reproduction", "research reproduction", "论文复现", "研究复现"], projectTerms: ["reproducibility", "replication", "reproduction", "可复现", "复现"] },
  { label: "Literature review", category: "Research", aliases: ["literature review", "paper reading", "论文阅读", "文献综述", "文献检索"], projectTerms: ["literature", "published studies", "manuscript", "文献", "公开研究", "论文"] },
  { label: "Python", category: "Programming and Data", aliases: ["python"] },
  { label: "R", category: "Programming and Data", aliases: ["r", "r programming", "using r"] },
  { label: "SQL", category: "Programming and Data", aliases: ["sql"] },
  { label: "Reproducible computational workflows", category: "Engineering", aliases: ["reproducible", "computational workflow", "analytical workflow", "jupyter", "rstudio", "git", "docker", "conda", "可复现", "计算工作流", "分析流程"], projectTerms: ["reproducible", "git", "quarto", "pipeline", "workflow", "可复现", "流水线", "工作流"] },
  { label: "Scientific visualization", category: "Communication", aliases: ["visualization", "figures", "scientific data visualization", "可视化", "图表"], projectTerms: ["visualization", "figures", "dashboard", "shiny", "可视化", "图表", "仪表板"] },
  { label: "Manuscript development", category: "Communication", aliases: ["manuscripts", "manuscript development", "publication", "论文", "手稿"], projectTerms: ["first author", "manuscript", "publication", "第一作者", "论文", "手稿"] },
  { label: "Scientific dissemination", category: "Communication", aliases: ["abstracts", "reports", "patents", "presentations", "scientific dissemination", "专利", "学术会议", "同行评议", "报告"], projectTerms: ["presentation", "report", "reviewer", "报告", "会议", "审稿"] },
  { label: "Research leadership", category: "Leadership", aliases: ["leading scientific research", "hypothesis through publication", "first-authored", "first authored", "主导科研", "研究能力", "课题设计"], projectTerms: ["first author", "led", "lead project", "project lead", "corresponding author", "第一作者", "主导", "通讯作者"] },
  { label: "Cross-functional collaboration", category: "Collaboration", aliases: ["cross-functionally", "cross-functional", "collaborative", "stakeholders", "partnership", "跨职能", "跨学科", "团队合作", "协作"], projectTerms: ["cross-functional", "collaboration", "stakeholder", "multidisciplinary", "team", "跨职能", "合作", "团队"] },
  { label: "Evidence-based decision support", category: "Decision Support", aliases: ["evidence-based decisions", "decision-ready", "insight generation", "practical health applications", "决策支持", "支持决策"], projectTerms: ["decision support", "recommendation", "trial design", "operating trade-offs", "决策", "建议", "试验设计", "权衡"] },
  { label: "Clinical collaboration", category: "Collaboration", aliases: ["clinical collaboration", "clinical partners", "临床协作", "临床团队"], projectTerms: ["clinical", "endpoint", "trial", "临床", "终点", "试验"] },
  { label: "Regulatory collaboration", category: "Collaboration", aliases: ["regulatory collaboration", "regulatory affairs", "regulatory", "监管协作", "监管事务"], projectTerms: ["regulatory", "监管"] },
  { label: "Industry-academia experience", category: "Experience", aliases: ["industry and academia", "intersection of industry and academia", "产学", "行业与学术"], projectTerms: ["pfizer", "industry", "university", "辉瑞", "行业", "大学"] },
  { label: "UAE research experience", category: "Regional Preference", aliases: ["uae", "united arab emirates", "阿联酋"], projectTerms: ["uae", "united arab emirates", "阿联酋"] },
  { label: "Sleep science", category: "Domain", aliases: ["sleep science", "sleep", "睡眠"], projectTerms: ["sleep", "睡眠"] },
  { label: "Circadian science", category: "Domain", aliases: ["circadian", "昼夜节律"], projectTerms: ["circadian", "昼夜节律"] },
  { label: "Digital health", category: "Domain", aliases: ["digital health", "数字健康"], projectTerms: ["digital health", "digital endpoint", "wearable", "数字健康", "数字终点", "可穿戴"] },
];

const projectIdentityAliases: Record<string, string[]> = {
  semiparametric_confidence_sets: ["Semiparametric Confidence Sets", "Semiparametric Confidence Sets for Correlated Outcomes", "相关结局的半参数置信集", "半参数置信集"],
  resi_asymptotic_inference: ["Robust Effect Size Index", "Closed-Form Asymptotic Inference for Effect Sizes", "效应量的闭式渐近推断", "稳健效应量"],
  model_reliance_confidence_sets: ["Confidence Sets for Model Reliance", "FDR- and FWER-Controlled Confidence Sets for Model Reliance", "控制错误发现率的模型依赖度置信集", "模型依赖度置信集"],
  multimodal_multiregion_distance: ["Multimodal and Multi-Region Distance Model", "Multi-modal and Multi-region Distance Model", "多模态多区域距离模型"],
  pfizer_asthma_clinical_trial_simulation: ["Pfizer", "Asthma Clinical-Trial Simulation", "辉瑞", "哮喘临床试验模拟"],
  hospital_readmission_risk: ["Hospital Readmission Risk", "Real-Time Hospital Readmission", "30-Day Hospital Readmission", "住院再入院风险", "再入院风险机器学习模型"],
  nph_treatment_effects: ["Non-Proportional Hazards", "Non-proportional Hazard", "非比例风险"],
  markov_switching_matrix_autoregressive: ["Markov Switching Matrix Autoregressive", "Markov-Switching Matrix Autoregressive", "马尔可夫切换矩阵"],
  lumbosacral_resting_state_fc: ["Lumbosacral Spinal-Cord Resting-State Functional Connectivity", "spinal-cord functional connectivity", "脊髓功能连接", "多发性硬化脊髓神经影像标志物"],
  lumbosacral_mffe: ["Multi-echo Gradient-echo MRI", "mFFE", "多回波梯度回波", "腰骶部多发性硬化影像"],
  neurostat_virtual_lab: ["NeuroStat"],
  ivy_job_radar: ["Ivy Job Radar", "Ivy Job Radar 多源岗位情报平台", "多源岗位情报平台", "多源岗位信息平台"],
  ai_usage_dashboard: ["AI Usage Dashboard", "AI Usage", "AI 用量", "AI 配额"],
};

function normalized(value: string) {
  return value.toLocaleLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasAlias(text: string, aliases: string[]) {
  const source = normalized(text);
  return aliases.some((alias) => {
    const target = normalized(alias);
    if (!target) return false;
    if (/[\u3400-\u9fff]/u.test(target)) return source.includes(target);
    const startBoundary = /^[a-z0-9]/i.test(target) ? "(^|[^a-z0-9])" : "";
    const endBoundary = /[a-z0-9]$/i.test(target) ? "(?=$|[^a-z0-9])" : "";
    return new RegExp(`${startBoundary}${escapeRegex(target)}${endBoundary}`, "i").test(source);
  });
}

function evidenceContext(text: string, aliases: string[]) {
  const source = normalized(text);
  const alias = aliases.find((item) => hasAlias(source, [item]));
  if (!alias) return "";
  const index = source.indexOf(normalized(alias));
  if (index < 0) return "";
  return text.slice(Math.max(0, index - 120), Math.min(text.length, index + alias.length + 220)).replace(/\s+/g, " ").trim();
}

function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function readPrivateFile(path: string, token: string) {
  const response = await fetch(`https://api.github.com/repos/XinyuIvy/CV/contents/${path}?ref=main`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Ivy-Job-Radar",
    },
  });
  if (!response.ok) throw new Error(`无法从私有 CV 仓库读取 ${path}（GitHub ${response.status}）。`);
  const payload = await response.json() as { content?: string; encoding?: string };
  if (payload.encoding !== "base64" || !payload.content) throw new Error(`GitHub 未返回 ${path} 的文件内容。`);
  return decodeBase64Utf8(payload.content);
}

function yamlValue(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try { return JSON.parse(trimmed) as string; } catch { return trimmed.slice(1, -1); }
  }
  return trimmed.replace(/^['"]|['"]$/g, "");
}

function inlineYamlList(value: string) {
  const body = value.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (!body) return [];
  return body.split(/\s*,\s*/).map(yamlValue).filter(Boolean);
}

function parseCapabilityLayers(yaml: string) {
  const records = new Map<string, CapabilityLayer>();
  let inRecords = false;
  let factId = "";
  for (const line of yaml.split(/\r?\n/)) {
    if (line === "records:") { inRecords = true; continue; }
    if (!inRecords) continue;
    const recordMatch = line.match(/^  ([A-Z0-9-]+):\s*$/);
    if (recordMatch) {
      factId = recordMatch[1];
      records.set(factId, { exactMethodsTools: [], statisticalConcepts: [], problemSolved: "", transferableCapabilities: [] });
      continue;
    }
    const fieldMatch = line.match(/^    ([a-z_]+):\s*(.+)$/);
    const current = records.get(factId);
    if (!fieldMatch || !current) continue;
    if (fieldMatch[1] === "exact_methods_tools") current.exactMethodsTools = inlineYamlList(fieldMatch[2]);
    else if (fieldMatch[1] === "statistical_analytical_concepts") current.statisticalConcepts = inlineYamlList(fieldMatch[2]);
    else if (fieldMatch[1] === "problem_solved") current.problemSolved = yamlValue(fieldMatch[2]);
    else if (fieldMatch[1] === "transferable_capabilities") current.transferableCapabilities = inlineYamlList(fieldMatch[2]);
  }
  return records;
}

function parseIndustryTranslations(yaml: string, track: string) {
  const records = new Map<string, IndustryTranslation>();
  let inProjects = false;
  let projectId = "";
  let activeTrack = "";
  let activeList: "validInterpretations" | "invalidOverclaims" | "" = "";
  for (const line of yaml.split(/\r?\n/)) {
    if (line === "projects:") { inProjects = true; continue; }
    if (!inProjects) continue;
    const projectMatch = line.match(/^  ([a-z0-9_]+):\s*$/);
    if (projectMatch) { projectId = projectMatch[1]; activeTrack = ""; activeList = ""; continue; }
    const trackMatch = line.match(/^    (pharma|tech|quant|consulting):\s*$/);
    if (trackMatch) {
      activeTrack = trackMatch[1];
      activeList = "";
      if (activeTrack === track) records.set(projectId, { translationType: "", supportingFacts: [], validInterpretations: [], invalidOverclaims: [] });
      continue;
    }
    if (activeTrack !== track) continue;
    const current = records.get(projectId);
    if (!current) continue;
    const fieldMatch = line.match(/^      ([a-z_]+):\s*(.*)$/);
    if (fieldMatch) {
      const [key, value] = [fieldMatch[1], fieldMatch[2]];
      activeList = "";
      if (key === "translation_type") current.translationType = yamlValue(value);
      else if (key === "supporting_facts") current.supportingFacts = inlineYamlList(value);
      else if (key === "valid_transferable_interpretation") current.validInterpretations = inlineYamlList(value);
      else if (key === "invalid_overclaim") activeList = "invalidOverclaims";
      continue;
    }
    const itemMatch = line.match(/^        -\s+(.+)$/);
    if (itemMatch && activeList) current[activeList].push(yamlValue(itemMatch[1]));
  }
  return records;
}

function parseConceptGraph(yaml: string) {
  const records = new Map<string, ConceptExpansion>();
  const ensure = (factId: string) => {
    const current = records.get(factId) ?? { direct: [], transferable: [], adjacent: [] };
    records.set(factId, current);
    return current;
  };
  for (const line of yaml.split(/\r?\n/)) {
    const edge = line.match(/- \{from:\s*([^,]+),\s*to:\s*([^,]+),\s*type:\s*([^,]+),\s*evidence:\s*\[([^\]]+)\]/);
    if (!edge) continue;
    const terms = [edge[1], edge[2]].map((value) => value.trim().replace(/_/g, " "));
    const bucket = edge[3].trim() === "exact_synonym" ? "direct" : edge[3].trim() === "adjacent_concept" ? "adjacent" : "transferable";
    for (const factId of edge[4].split(/\s*,\s*/)) ensure(factId.trim())[bucket].push(...terms);
  }
  return records;
}

function parseAtomicFacts(yaml: string) {
  const facts: AtomicFact[] = [];
  let inProjectRecords = false;
  let projectId = "";
  let projectName = "";
  let role = "";
  let current: Partial<AtomicFact> | null = null;

  const finishFact = () => {
    if (current?.factId && current.verifiedFact) {
      facts.push({
        projectId,
        projectName,
        role,
        factId: current.factId,
        verifiedFact: current.verifiedFact,
        factStatus: current.factStatus || "",
        personalAttribution: current.personalAttribution || "",
        evidenceStrength: current.evidenceStrength || "",
        source: current.source || "",
        evidenceLocation: current.evidenceLocation || "",
        claimBoundary: current.claimBoundary || "",
      });
    }
    current = null;
  };

  for (const line of yaml.split(/\r?\n/)) {
    if (line === "project_records:") { inProjectRecords = true; continue; }
    if (!inProjectRecords) continue;
    const projectMatch = line.match(/^  ([a-z0-9_]+):\s*$/);
    if (projectMatch) {
      finishFact();
      projectId = projectMatch[1];
      projectName = "";
      role = "";
      continue;
    }
    const projectNameMatch = line.match(/^    project_name:\s*(.+)$/);
    if (projectNameMatch) { projectName = yamlValue(projectNameMatch[1]); continue; }
    const roleMatch = line.match(/^    role:\s*(.+)$/);
    if (roleMatch) { role = yamlValue(roleMatch[1]); continue; }
    const factMatch = line.match(/^      - fact_id:\s*(.+)$/);
    if (factMatch) {
      finishFact();
      current = { factId: yamlValue(factMatch[1]) };
      continue;
    }
    if (!current) continue;
    const fieldMatch = line.match(/^        ([a-z_]+):\s*(.+)$/);
    if (!fieldMatch) continue;
    const key = fieldMatch[1];
    const value = yamlValue(fieldMatch[2]);
    if (key === "verified_fact") current.verifiedFact = value;
    else if (key === "fact_status") current.factStatus = value;
    else if (key === "personal_attribution") current.personalAttribution = value;
    else if (key === "evidence_strength") current.evidenceStrength = value;
    else if (key === "source") current.source = value;
    else if (key === "evidence_location") current.evidenceLocation = value;
    else if (key === "claim_boundary") current.claimBoundary = value;
  }
  finishFact();
  return facts;
}

function evidenceClassification(
  fact: AtomicFact,
  rule: RequirementRule,
  capability: CapabilityLayer | undefined,
  translation: IndustryTranslation | undefined,
  graph: ConceptExpansion | undefined,
): EvidenceClassification | null {
  const exactText = [fact.verifiedFact, fact.role, ...(capability?.exactMethodsTools ?? []), ...(graph?.direct ?? [])].join(" ");
  const transferableText = [
    ...(capability?.statisticalConcepts ?? []),
    capability?.problemSolved ?? "",
    ...(capability?.transferableCapabilities ?? []),
    ...(translation?.validInterpretations ?? []),
    ...(graph?.transferable ?? []),
  ].join(" ");
  const adjacentText = [fact.projectName, exactText, transferableText, ...(graph?.adjacent ?? [])].join(" ");
  const direct = hasAlias(exactText, rule.aliases);
  const transferable = hasAlias(transferableText, [...rule.aliases, ...(rule.projectTerms ?? [])]);
  const adjacent = hasAlias(adjacentText, [...rule.aliases, ...(rule.projectTerms ?? [])]);
  const incomplete = ["planned", "project_context"].includes(fact.factStatus);
  if (direct && !incomplete) return "Direct";
  if (transferable && !incomplete) return "Strong Transferable";
  if (adjacent) return "Adjacent";
  return null;
}

function collectAtomicEvidence(
  atomicFacts: AtomicFact[],
  rule: RequirementRule,
  capabilityLayers: Map<string, CapabilityLayer>,
  industryTranslations: Map<string, IndustryTranslation>,
  conceptGraph: Map<string, ConceptExpansion>,
) {
  const rank: Record<EvidenceClassification, number> = { Direct: 3, "Strong Transferable": 2, Adjacent: 1 };
  return atomicFacts
    .map((fact) => {
      const capability = capabilityLayers.get(fact.factId);
      const projectTranslation = industryTranslations.get(fact.projectId);
      const translation = projectTranslation?.supportingFacts.includes(fact.factId) ? projectTranslation : undefined;
      const graph = conceptGraph.get(fact.factId);
      return { fact, capability, translation, graph, classification: evidenceClassification(fact, rule, capability, translation, graph) };
    })
    .filter((item): item is typeof item & { classification: EvidenceClassification } => Boolean(item.classification))
    .map(({ fact, capability, translation, classification }) => ({
      projectId: fact.projectId,
      project: fact.projectName,
      factId: fact.factId,
      fact: fact.verifiedFact,
      factStatus: fact.factStatus,
      evidenceStrength: fact.evidenceStrength,
      classification,
      relevance: supportReasons[classification],
      source: fact.source,
      evidenceLocation: fact.evidenceLocation,
      claimBoundary: fact.claimBoundary,
      capabilityContext: capability?.problemSolved || capability?.transferableCapabilities[0] || "",
      industryTranslation: translation?.validInterpretations.find((value) => hasAlias(value, [...rule.aliases, ...(rule.projectTerms ?? [])])) || "",
      industryGuardrail: translation?.invalidOverclaims[0] || "",
    } satisfies SupportEvidence))
    .sort((a, b) => rank[b.classification] - rank[a.classification] || Number(b.evidenceStrength === "high") - Number(a.evidenceStrength === "high"))
    .filter((item, index, all) => all.findIndex((candidate) => candidate.projectId === item.projectId && candidate.factId === item.factId) === index)
    .slice(0, 4);
}

function projectSections(facts: string) {
  const headings = [...facts.matchAll(/^###\s+(.+)$/gm)];
  return headings.map((match, index) => {
    const start = match.index ?? 0;
    const end = headings[index + 1]?.index ?? facts.length;
    return { name: match[1].trim(), text: facts.slice(start, end) };
  });
}

function cleanFactLine(line: string) {
  return line.replace(/^[-*]\s+/, "").replace(/\*\*/g, "").replace(/`/g, "").replace(/\s+/g, " ").trim();
}

function isRestrictionLine(line: string) {
  return /\b(must not|do not|cannot|can't|should not|after august|wording must|audited|not default|claim boundary|restriction)\b|不能|不得|不可|不要|仅可|禁用|限制|措辞|审计/i.test(line);
}

function localizedFactLine(factMaster: string, evidence: SupportEvidence, rule: RequirementRule, language: TemplateLanguage) {
  if (language === "en") return evidence.fact;
  const aliases = projectIdentityAliases[evidence.projectId] ?? [evidence.project];
  const section = projectSections(factMaster).find((candidate) => hasAlias(candidate.name, aliases));
  if (!section) return evidence.fact;
  const terms = [...rule.aliases, ...(rule.projectTerms ?? [])];
  const localized = section.text
    .split(/\r?\n/)
    .filter((line) => !/^#{1,6}\s/.test(line.trim()))
    .map(cleanFactLine)
    .filter((line) => /[\u3400-\u9fff]/u.test(line))
    .filter((line) => line.length >= 24 && line.length <= 420)
    .filter((line) => !isRestrictionLine(line) && hasAlias(line, terms))
    .sort((a, b) => terms.filter((term) => hasAlias(b, [term])).length - terms.filter((term) => hasAlias(a, [term])).length)[0];
  return localized || evidence.fact;
}

function verifiedSupportEvidence(candidate: HybridCandidate, track: IndustryTrack): SupportEvidence | null {
  if (candidate.classification === "No Evidence") return null;
  const fact = candidate.fact;
  const translationTrack = track === "clinical_neuro" ? "pharma" : track;
  const translation = fact.industry_translation[translationTrack];
  return {
    projectId: fact.project_id,
    project: fact.project_name,
    factId: fact.fact_id,
    fact: fact.verified_fact,
    factStatus: fact.fact_status,
    evidenceStrength: fact.evidence_strength,
    classification: candidate.classification,
    relevance: candidate.why,
    source: fact.source,
    evidenceLocation: fact.evidence_location,
    claimBoundary: fact.claim_boundary,
    capabilityContext: fact.problem_solved,
    industryTranslation: translation?.valid_transferable_interpretation[0] || "",
    industryGuardrail: candidate.limitation,
    score: Math.round(candidate.preverificationScore * 10) / 10,
    retrievalChannels: candidate.retrievalChannels,
  };
}

function recommendVerifiedProjects(ragMatches: HybridMatch[], templateText: string, track: IndustryTrack) {
  const byProject = new Map<string, { name: string; requirements: Map<string, SupportEvidence> }>();
  const rank: Record<EvidenceClassification, number> = { Direct: 3, "Strong Transferable": 2, Adjacent: 1 };
  for (const match of ragMatches) {
    for (const candidate of match.candidates) {
      const evidence = verifiedSupportEvidence(candidate, track);
      if (!evidence) continue;
      const current = byProject.get(evidence.projectId) ?? { name: evidence.project, requirements: new Map<string, SupportEvidence>() };
      const previous = current.requirements.get(match.requirement.label);
      if (!previous || rank[evidence.classification] > rank[previous.classification] || (evidence.score ?? 0) > (previous.score ?? 0)) {
        current.requirements.set(match.requirement.label, evidence);
      }
      byProject.set(evidence.projectId, current);
    }
  }
  return [...byProject.entries()].map(([projectId, value]) => {
    const evidence = [...value.requirements.values()];
    return {
      projectId,
      name: value.name,
      score: Math.round(evidence.reduce((sum, item) => sum + rank[item.classification] * 10 + (item.score ?? 0) / 10, 0)),
      matchedRequirements: [...value.requirements.keys()],
      classifications: [...new Set(evidence.map((item) => item.classification))],
      alreadyInTemplate: templateContainsProject(templateText, projectId, value.name),
      evidence: evidence.sort((left, right) => rank[right.classification] - rank[left.classification] || (right.score ?? 0) - (left.score ?? 0))[0] ?? null,
    } satisfies ProjectRecommendation;
  }).sort((left, right) => right.score - left.score).slice(0, 8);
}

function meaningfulTokens(value: string) {
  const stop = new Set(["with", "from", "using", "under", "model", "models", "analysis", "statistical", "project", "development", "application", "study"]);
  return normalized(value).split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && !stop.has(token));
}

function templateContainsProject(templateText: string, projectId: string, projectName: string) {
  const aliases = [projectName, ...(projectIdentityAliases[projectId] ?? [])];
  if (aliases.some((alias) => hasAlias(templateText, [alias]))) return true;
  const tokens = meaningfulTokens(projectName);
  if (tokens.length < 3) return false;
  return tokens.filter((token) => hasAlias(templateText, [token])).length / tokens.length >= 0.6;
}

function latexProjectBlocks(template: string) {
  const markers = [...template.matchAll(/\\noindent\s*\\textbf\{([^{}\n]+)\}/g)];
  return markers.map((match, index) => ({
    title: latexToPlainText(match[1]),
    source: template.slice(match.index ?? 0, markers[index + 1]?.index ?? template.length).trim(),
  }));
}

function findProjectBlock(template: string, projectId: string, projectName: string) {
  const aliases = [projectName, ...(projectIdentityAliases[projectId] ?? [])];
  return latexProjectBlocks(template).find((block) => aliases.some((alias) => hasAlias(block.title, [alias]))) ?? null;
}

function latexEscape(value: string) {
  return value.replace(/\\/g, "\\textbackslash{}").replace(/([#$%&_{}])/g, "\\$1").replace(/~/g, "\\textasciitilde{}").replace(/\^/g, "\\textasciicircum{}");
}

function recommendProjects(
  atomicFacts: AtomicFact[],
  templateText: string,
  detected: RequirementRule[],
  capabilityLayers: Map<string, CapabilityLayer>,
  industryTranslations: Map<string, IndustryTranslation>,
  conceptGraph: Map<string, ConceptExpansion>,
) {
  const byProject = new Map<string, { name: string; requirements: Map<string, SupportEvidence> }>();
  for (const rule of detected) {
    for (const evidence of collectAtomicEvidence(atomicFacts, rule, capabilityLayers, industryTranslations, conceptGraph)) {
      const current = byProject.get(evidence.projectId) ?? { name: evidence.project, requirements: new Map<string, SupportEvidence>() };
      if (!current.requirements.has(rule.label)) current.requirements.set(rule.label, evidence);
      byProject.set(evidence.projectId, current);
    }
  }
  const weights: Record<EvidenceClassification, number> = { Direct: 3, "Strong Transferable": 2, Adjacent: 1 };
  return [...byProject.entries()].map(([projectId, value]) => {
    const evidence = [...value.requirements.values()];
    return {
      projectId,
      name: value.name,
      score: evidence.reduce((sum, item) => sum + weights[item.classification], 0),
      matchedRequirements: [...value.requirements.keys()],
      classifications: [...new Set(evidence.map((item) => item.classification))],
      alreadyInTemplate: templateContainsProject(templateText, projectId, value.name),
      evidence: evidence[0] ?? null,
    } satisfies ProjectRecommendation;
  }).sort((a, b) => b.score - a.score).slice(0, 8);
}

function buildModificationDrafts(matches: RequirementMatch[], template: string, factMaster: string, language: TemplateLanguage) {
  const drafts: ModificationDraft[] = [];
  for (const match of matches.filter((item) => item.status === "supported_gap")) {
    const evidence = match.supportEvidence.find((item) => item.classification !== "Adjacent");
    if (!evidence) continue;
    const block = findProjectBlock(template, evidence.projectId, evidence.project);
    const rule = requirements.find((item) => item.label === match.keyword) ?? { label: match.keyword, category: match.category, aliases: [match.keyword] };
    const proposedBullet = localizedFactLine(factMaster, evidence, rule, language);
    const escapedBullet = latexEscape(proposedBullet);
    const existingBullet = block?.source.match(/\\item\s+([\s\S]*?)(?=\\item|\\end\{itemize\})/)?.[0]?.trim() || "% No matching bullet in the selected template";
    const after = block
      ? `\\item ${escapedBullet}`
      : `\\noindent\\textbf{${latexEscape(evidence.project)}}\n\\begin{itemize}\n\\item ${escapedBullet}\n\\end{itemize}`;
    drafts.push({
      id: `${match.keyword}-${evidence.factId}`,
      action: block ? "revise_existing" : "consider_addition",
      projectId: evidence.projectId,
      project: evidence.project,
      requirement: match.keyword,
      classification: evidence.classification,
      factId: evidence.factId,
      verifiedFact: evidence.fact,
      proposedBullet,
      source: evidence.source,
      evidenceLocation: evidence.evidenceLocation,
      claimBoundary: evidence.claimBoundary,
      rationale: block ? "该项目已在母版中；建议只改写现有 bullet，使这项要求更明确。" : "该项目不在所选母版中；仅在它比现有项目更匹配时考虑替换加入。",
      latexDiff: { before: existingBullet, after },
    });
    if (drafts.length >= 10) break;
  }
  return drafts.filter((draft, index, all) => all.findIndex((item) => item.projectId === draft.projectId && item.requirement === draft.requirement) === index);
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { track?: string; language?: TemplateLanguage; jd?: string };
  const language: TemplateLanguage = body.language === "zh" ? "zh" : "en";
  const track = body.track && body.track in templateFiles[language] ? body.track : "tech";
  const jd = body.jd || "";
  const templateFile = templateFiles[language][track];
  const { env } = await import("cloudflare:workers");
  const token = String(env.CV_GITHUB_TOKEN || "").trim();

  if (!token) {
    return NextResponse.json({
      error: "XinyuIvy/CV 是私有仓库。请先配置 CV_GITHUB_TOKEN，再运行 CV 分析。",
      code: "CV_TOKEN_REQUIRED",
    }, { status: 503 });
  }

  if (!templateFile) {
    return NextResponse.json({
      error: "脑科学 / 临床数据 / 医疗器械方向目前只有中文 LaTeX 母版，请选择中文母版。",
      code: "CV_TEMPLATE_LANGUAGE_UNAVAILABLE",
    }, { status: 400 });
  }

  try {
    const [template, factMaster, factIndexJsonl, conceptEdgesJsonl, matchingSpecYaml] = await Promise.all([
      readPrivateFile(`master/template-cv/${templateFile}`, token),
      readPrivateFile("master/FACT_MASTER.md", token),
      readPrivateFile("master/project-evidence/FACT_INDEX.jsonl", token),
      readPrivateFile("master/project-evidence/CONCEPT_EDGES.jsonl", token),
      readPrivateFile("master/project-evidence/STAGE7_HYBRID_RAG_MATCHING.yaml", token),
    ]);
    const templateText = latexToPlainText(template);
    const factIndex = parseJsonl<FactIndexRecord>(factIndexJsonl);
    const conceptEdges = parseJsonl<ConceptEdge>(conceptEdgesJsonl);
    const rag = runHybridRag(jd, track as IndustryTrack, requirements, factIndex, conceptEdges);
    const matches: RequirementMatch[] = rag.matches.map((hybridMatch) => {
      const rule = hybridMatch.requirement;
      const covered = hasAlias(templateText, rule.literalTerms);
      const evidenceRank: Record<EvidenceClassification, number> = { Direct: 3, "Strong Transferable": 2, Adjacent: 1 };
      const supportEvidence = hybridMatch.candidates
        .map((candidate) => verifiedSupportEvidence(candidate, track as IndustryTrack))
        .filter((evidence): evidence is SupportEvidence => Boolean(evidence))
        .sort((left, right) => evidenceRank[right.classification] - evidenceRank[left.classification] || (right.score ?? 0) - (left.score ?? 0))
        .slice(0, 4);
      const hasSupported = supportEvidence.some((item) => item.classification === "Direct" || item.classification === "Strong Transferable");
      const hasAdjacent = supportEvidence.some((item) => item.classification === "Adjacent");
      return {
        keyword: rule.label,
        category: rule.category,
        status: covered ? "covered" : hasSupported ? "supported_gap" : hasAdjacent ? "adjacent_gap" : "unsupported_gap",
        supportEvidence: covered ? [] : supportEvidence,
        templateEvidence: covered ? evidenceContext(templateText, rule.literalTerms) : "",
        jdEvidence: rule.sourceText,
        jdMatchedTerms: rule.literalTerms,
      };
    });
    const projects = recommendVerifiedProjects(rag.matches, templateText, track as IndustryTrack);
    const modificationDrafts = buildModificationDrafts(matches, template, factMaster, language);
    return NextResponse.json({
      track,
      language,
      matches,
      projects,
      modificationDrafts,
      sourceDiagnostics: {
        templateFile,
        templateLength: template.length,
        factMasterLength: factMaster.length,
        factIndexFile: "master/project-evidence/FACT_INDEX.jsonl",
        conceptEdgesFile: "master/project-evidence/CONCEPT_EDGES.jsonl",
        atomicFactCount: factIndex.length,
        conceptEdgeCount: conceptEdges.length,
        embeddingBackend: rag.diagnostics.embeddingBackend,
        embeddingDimensions: rag.diagnostics.embeddingDimensions,
        bm25Parameters: rag.diagnostics.bm25Parameters,
        matchingSpecLoaded: matchingSpecYaml.includes("stage: 7"),
        ragPreparationStages: "1–7",
      },
      summary: {
        required: matches.length,
        covered: matches.filter((item) => item.status === "covered").length,
        supportedGaps: matches.filter((item) => item.status === "supported_gap").length,
        adjacentGaps: matches.filter((item) => item.status === "adjacent_gap").length,
        unsupportedGaps: matches.filter((item) => item.status === "unsupported_gap").length,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CV source loading failed." }, { status: 502 });
  }
}
