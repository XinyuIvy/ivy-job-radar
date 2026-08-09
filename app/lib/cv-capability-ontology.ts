import type { JdRequirement, RequirementRule } from "./hybrid-rag";
import { CV_JD_EXTRA_RULES } from "./cv-jd-extra-rules.ts";

export type CvRelationType =
  | "exact_equivalent"
  | "native_synonym"
  | "narrower_than"
  | "evidence_for"
  | "transferable_to"
  | "related_only"
  | "excluded";

export type CapabilityConcept = {
  id: string;
  en: string;
  zh: string;
  aliasesEn?: string[];
  aliasesZh?: string[];
  jdZh?: string[];
};

export type CapabilityRelation = {
  from: string;
  to: string;
  type: CvRelationType;
  note?: string;
};

const concepts: CapabilityConcept[] = [
  { id: "statistics", en: "statistics", zh: "统计学", aliasesZh: ["统计背景", "统计专业", "统计学背景", "统计学专业"] },
  { id: "biostatistics", en: "biostatistics", zh: "生物统计学", aliasesZh: ["生物统计"] },
  { id: "computer_science", en: "computer science", zh: "计算机", aliasesZh: ["计算机专业", "计算机背景"] },
  { id: "artificial_intelligence_field", en: "artificial intelligence", zh: "人工智能", aliasesZh: ["AI专业", "AI 背景", "人工智能专业"] },
  { id: "information_science", en: "information science", zh: "信息科学", aliasesZh: ["信息类专业", "信息相关专业"] },
  { id: "mathematics", en: "mathematics", zh: "数学", aliasesZh: ["数学专业", "数学背景"] },
  { id: "automation_field", en: "automation", zh: "自动化", aliasesZh: ["自动化专业", "自动化背景"] },
  { id: "stem_field", en: "STEM field", zh: "理工科相关专业", aliasesZh: ["STEM 专业", "理工类专业", "数学统计相关专业", "相关 STEM 专业"] },
  { id: "stem_research", en: "STEM research", zh: "理工类科研领域", aliasesZh: ["理工类科研", "自然科学科研", "科学研究"] },
  { id: "neuroimaging_research", en: "neuroimaging research", zh: "神经影像研究", aliasesZh: ["医学影像研究", "脑影像研究", "神经影像"] },
  { id: "biomedical_research", en: "biomedical research", zh: "生物医学研究", aliasesZh: ["生物医学科研", "医学研究", "临床研究"] },
  { id: "interdisciplinary_research", en: "interdisciplinary research", zh: "交叉学科研究", aliasesZh: ["跨学科研究", "交叉学科背景", "跨学科背景"] },
  { id: "peer_reviewed_publication", en: "peer-reviewed publication", zh: "同行评议论文发表经历", aliasesZh: ["同行评议论文", "高水平论文发表", "正式发表论文"] },
  { id: "published_journal_article", en: "published journal article", zh: "正式发表的期刊论文", aliasesZh: ["期刊论文", "已发表论文"] },
  { id: "scientific_writing", en: "scientific writing", zh: "论文写作", aliasesZh: ["科研写作", "学术写作", "手稿撰写"] },
  { id: "literature_review", en: "literature review", zh: "文献综述", aliasesZh: ["论文阅读", "文献阅读", "文献检索", "系统综述"] },
  { id: "evidence_synthesis", en: "evidence synthesis", zh: "证据综合", aliasesZh: ["文献综合", "研究综合"] },
  { id: "independent_research", en: "independent research", zh: "独立推进科研项目", aliasesZh: ["独立科研", "主导科研", "独立开展研究"] },
  { id: "problem_definition", en: "problem definition", zh: "问题定义", aliasesZh: ["科学问题定义", "研究问题定义"] },
  { id: "experiment_design", en: "experiment design", zh: "实验设计", aliasesZh: ["试验设计", "研究设计"] },
  { id: "result_analysis", en: "result analysis", zh: "结果分析", aliasesZh: ["结果解读", "数据分析"] },
  { id: "python", en: "Python", zh: "Python" },
  { id: "pytorch", en: "PyTorch", zh: "PyTorch" },
  { id: "agent_system", en: "agent system", zh: "Agent 系统", aliasesZh: ["智能体系统", "科研智能体", "多智能体"] },
  { id: "agent_tool_calling", en: "agent tool calling", zh: "Agent 工具调用", aliasesZh: ["工具调用"] },
  { id: "agent_planning", en: "agent planning", zh: "Agent 规划", aliasesZh: ["自主规划", "规划能力"] },
  { id: "autonomous_decision", en: "autonomous decision making", zh: "自主决策" },
  { id: "code_execution", en: "code execution", zh: "代码执行" },
  { id: "experiment_validation", en: "experiment validation", zh: "实验验证" },
  { id: "reinforcement_learning", en: "reinforcement learning", zh: "强化学习", aliasesZh: ["RL"] },
  { id: "ppo", en: "PPO", zh: "PPO" },
  { id: "dpo", en: "DPO", zh: "DPO" },
  { id: "grpo", en: "GRPO", zh: "GRPO" },
  { id: "rl_post_training", en: "RL post-training", zh: "强化学习后训练", aliasesZh: ["后训练"] },
  { id: "reward_design", en: "reward design", zh: "奖励设计" },
  { id: "training_stability", en: "training stability", zh: "训练稳定性" },
  { id: "exploration_efficiency", en: "exploration efficiency", zh: "探索效率" },
  { id: "generalization", en: "generalization", zh: "泛化能力", aliasesZh: ["泛化"] },
  { id: "llm", en: "large language model", zh: "大语言模型", aliasesEn: ["LLM"], aliasesZh: ["大模型"] },
  { id: "multimodal_foundation_model", en: "multimodal foundation model", zh: "多模态大模型" },
  { id: "data_generation", en: "data generation", zh: "数据生成" },
  { id: "data_cleaning", en: "data cleaning", zh: "数据清洗" },
  { id: "data_filtering", en: "data filtering", zh: "数据筛选" },
  { id: "data_augmentation", en: "data augmentation", zh: "数据增强" },
  { id: "data_mixture", en: "data mixture", zh: "数据配比" },
  { id: "data_pipeline", en: "data pipeline", zh: "数据管线", aliasesZh: ["数据流水线"] },
  { id: "paper_reproduction", en: "paper reproduction", zh: "论文复现" },
  { id: "cross_disciplinary_collaboration", en: "cross-disciplinary collaboration", zh: "跨学科合作", aliasesZh: ["交叉学科合作", "跨学科协作"] },
  { id: "research_simulation", en: "research simulation", zh: "研究仿真实验", aliasesZh: ["蒙特卡洛模拟", "仿真实验"] },
  { id: "algorithm_experiment_design", en: "algorithm experiment design", zh: "算法实验设计" },
  { id: "orchestrator_workflow", en: "orchestrator workflow", zh: "编排器协调的工作流", aliasesZh: ["编排器", "Orchestrator"] },
];

export const CV_CAPABILITY_CONCEPTS = new Map(concepts.map((concept) => [concept.id, concept]));

export const CV_CAPABILITY_RELATIONS: CapabilityRelation[] = [
  { from: "biostatistics", to: "statistics", type: "narrower_than" },
  { from: "biostatistics", to: "stem_field", type: "narrower_than" },
  { from: "statistics", to: "stem_field", type: "narrower_than" },
  { from: "computer_science", to: "stem_field", type: "narrower_than" },
  { from: "artificial_intelligence_field", to: "stem_field", type: "narrower_than" },
  { from: "information_science", to: "stem_field", type: "narrower_than" },
  { from: "mathematics", to: "stem_field", type: "narrower_than" },
  { from: "automation_field", to: "stem_field", type: "narrower_than" },
  { from: "neuroimaging_research", to: "stem_research", type: "narrower_than" },
  { from: "biomedical_research", to: "stem_research", type: "narrower_than" },
  { from: "cross_disciplinary_collaboration", to: "interdisciplinary_research", type: "evidence_for", note: "Repeated statistical collaboration across neuroimaging, biomedical, and clinical research supports an interdisciplinary background." },
  { from: "published_journal_article", to: "peer_reviewed_publication", type: "evidence_for" },
  { from: "research_simulation", to: "algorithm_experiment_design", type: "transferable_to", note: "Simulation/design experience is transferable but is not algorithm-training experience." },
  { from: "orchestrator_workflow", to: "agent_tool_calling", type: "related_only", note: "Workflow orchestration alone does not prove direct implementation of model tool-calling policies." },
  { from: "agent_system", to: "reinforcement_learning", type: "related_only" },
  { from: "reinforcement_learning", to: "ppo", type: "excluded", note: "Generic RL never proves PPO." },
  { from: "reinforcement_learning", to: "dpo", type: "excluded", note: "Generic RL never proves DPO." },
  { from: "reinforcement_learning", to: "grpo", type: "excluded", note: "Generic RL never proves GRPO." },
  { from: "agent_system", to: "ppo", type: "excluded" },
  { from: "agent_system", to: "dpo", type: "excluded" },
  { from: "agent_system", to: "grpo", type: "excluded" },
  { from: "statistics", to: "reinforcement_learning", type: "excluded" },
  { from: "python", to: "pytorch", type: "excluded", note: "Python use does not prove PyTorch use." },
  { from: "agent_system", to: "llm", type: "related_only", note: "Agent workflow design does not prove LLM development or training." },
];

function normalized(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[–—_/]+/g, " ").replace(/\s+/g, " ").trim();
}

function includesTerm(text: string, term: string) {
  const source = normalized(text);
  const target = normalized(term);
  if (!target) return false;
  if (/[\u3400-\u9fff]/u.test(target)) return source.includes(target);
  return new RegExp(`(^|[^a-z0-9])${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9])`, "i").test(source);
}

export function conceptTerms(concept: CapabilityConcept) {
  return [concept.en, concept.zh, ...(concept.aliasesEn ?? []), ...(concept.aliasesZh ?? []), ...(concept.jdZh ?? [])];
}

export function conceptsInText(text: string) {
  const matched = concepts.filter((concept) => conceptTerms(concept).some((term) => includesTerm(text, term))).map((concept) => concept.id);
  if (!matched.includes("biostatistics")) return matched;
  const withoutBiostatistics = text.replace(/生物统计学|生物统计/giu, " ").replace(/biostatistics/giu, " ");
  const hasSeparateStatistics = conceptTerms(CV_CAPABILITY_CONCEPTS.get("statistics")!).some((term) => includesTerm(withoutBiostatistics, term));
  return hasSeparateStatistics ? matched : matched.filter((conceptId) => conceptId !== "statistics");
}

export function requirementConceptIds(requirement: Pick<JdRequirement, "label" | "literalTerms" | "normalizedConcepts">) {
  const text = [requirement.label, ...requirement.literalTerms, ...requirement.normalizedConcepts.map((value) => value.replace(/_/g, " "))].join(" ");
  return conceptsInText(text);
}

export function relationBetween(from: string, to: string) {
  if (from === to) return { from, to, type: "exact_equivalent" as const };
  return CV_CAPABILITY_RELATIONS.find((relation) => relation.from === from && relation.to === to) ?? null;
}

export const CV_JD_RULES: RequirementRule[] = [
  { label: "Doctoral degree", category: "Education", aliases: ["phd", "ph.d.", "doctorate", "doctoral degree", "博士"] },
  { label: "Statistics background", category: "Education", aliases: ["statistics", "statistics background", "statistical background", "统计学", "统计学背景", "统计背景", "统计学专业", "统计专业", "数学、统计", "统计、自动化"], projectTerms: ["biostatistics", "statistics", "生物统计", "统计学"] },
  { label: "Computer science background", category: "Education", aliases: ["computer science", "计算机专业", "计算机背景", "计算机、AI"] },
  { label: "AI background", category: "Education", aliases: ["artificial intelligence", "ai background", "人工智能", "AI专业", "计算机、AI", "AI、信息"] },
  { label: "Information science background", category: "Education", aliases: ["information science", "信息科学", "信息类专业", "AI、信息", "信息、数学"] },
  { label: "Mathematics background", category: "Education", aliases: ["mathematics", "math background", "数学专业", "数学背景", "信息、数学", "数学、统计"] },
  { label: "Automation background", category: "Education", aliases: ["automation", "自动化专业", "自动化背景", "统计、自动化"] },
  { label: "STEM-related field", category: "Education", aliases: ["stem", "stem field", "related stem", "相关 STEM", "相关STEM", "理工科相关专业", "理工类专业"], projectTerms: ["biostatistics", "statistics", "数学统计相关专业"] },
  { label: "Interdisciplinary background", category: "Collaboration", aliases: ["interdisciplinary", "cross-disciplinary", "交叉学科背景", "跨学科背景", "跨学科合作"], projectTerms: ["multidisciplinary", "clinical collaboration", "neuroimaging", "统计", "医学影像", "临床合作"] },
  { label: "STEM research domain", category: "Domain", aliases: ["stem research", "理工类科研领域", "理工类科研", "自然科学科研", "理工科科研"], projectTerms: ["neuroimaging", "biomedical", "医学影像", "神经影像", "生物医学"] },
  { label: "Peer-reviewed publications", category: "Communication", aliases: ["peer-reviewed", "peer reviewed", "同行评议", "高水平期刊", "高水平学术期刊", "发表论文"], projectTerms: ["published", "journal article", "正式发表", "期刊论文"] },
  { label: "Python", category: "Programming and Data", aliases: ["python"] },
  { label: "PyTorch", category: "Programming and Data", aliases: ["pytorch"] },
  { label: "Reinforcement learning", category: "Methods", aliases: ["reinforcement learning", "强化学习", "rl"] },
  { label: "PPO", category: "Methods", aliases: ["ppo"] },
  { label: "DPO", category: "Methods", aliases: ["dpo"] },
  { label: "GRPO", category: "Methods", aliases: ["grpo"] },
  { label: "RL post-training", category: "Methods", aliases: ["reinforcement learning post-training", "rl post-training", "强化学习后训练", "强化学习后训练方法"] },
  { label: "Reward design", category: "Methods", aliases: ["reward design", "奖励设计"] },
  { label: "Training stability", category: "Methods", aliases: ["training stability", "训练稳定性"] },
  { label: "Exploration efficiency", category: "Methods", aliases: ["exploration efficiency", "探索效率"] },
  { label: "Generalization", category: "Methods", aliases: ["generalization", "泛化能力", "泛化"] },
  { label: "Agent system", category: "AI Systems", aliases: ["agent system", "agent systems", "科研智能体", "智能体系统", "agent 系统", "agent"] },
  { label: "Autonomous decision making", category: "AI Systems", aliases: ["autonomous decision", "自主决策"] },
  { label: "Agent planning", category: "AI Systems", aliases: ["agent planning", "planning", "自主规划", "规划"] },
  { label: "Tool calling", category: "AI Systems", aliases: ["tool calling", "tool use", "工具调用"] },
  { label: "Code execution", category: "AI Systems", aliases: ["code execution", "代码执行"] },
  { label: "Experiment validation", category: "AI Systems", aliases: ["experiment validation", "实验验证"] },
  { label: "Agentic data generation", category: "Data Engineering", aliases: ["agentic data generation", "data generation", "数据生成", "轨迹数据生成"] },
  { label: "Data cleaning", category: "Data Engineering", aliases: ["data cleaning", "数据清洗"] },
  { label: "Data filtering", category: "Data Engineering", aliases: ["data filtering", "数据筛选"] },
  { label: "Data augmentation", category: "Data Engineering", aliases: ["data augmentation", "数据增强"] },
  { label: "Data mixture", category: "Data Engineering", aliases: ["data mixture", "mixture strategy", "数据配比"] },
  { label: "Data pipeline", category: "Data Engineering", aliases: ["data pipeline", "training data pipeline", "数据管线", "后训练数据管线"] },
  { label: "LLM", category: "AI Models", aliases: ["large language model", "llm", "大语言模型", "大模型"] },
  { label: "Multimodal foundation model", category: "AI Models", aliases: ["multimodal foundation model", "multimodal large model", "多模态大模型"] },
  { label: "Problem definition", category: "Research", aliases: ["problem definition", "问题定义", "科学问题定义"] },
  { label: "Independent research", category: "Research", aliases: ["independent research", "independently drive", "独立推进科研项目", "独立科研", "主导科研"] },
  { label: "Literature review", category: "Research", aliases: ["literature review", "systematic review", "paper reading", "论文阅读", "文献综述", "系统综述", "文献检索"] },
  { label: "Paper reproduction", category: "Research", aliases: ["paper reproduction", "research reproduction", "论文复现", "研究复现", "论文阅读与复现", "阅读与复现"] },
  { label: "Experiment design", category: "Research Design", aliases: ["experiment design", "study design", "实验设计", "试验设计", "研究设计"] },
  { label: "Result analysis", category: "Research", aliases: ["result analysis", "results analysis", "结果分析", "结果解读"] },
  { label: "Scientific writing", category: "Communication", aliases: ["scientific writing", "paper writing", "manuscript writing", "论文写作", "科研写作"] },
  { label: "Cross-disciplinary collaboration", category: "Collaboration", aliases: ["cross-disciplinary collaboration", "interdisciplinary collaboration", "跨学科合作", "交叉学科合作"] },
  { label: "Machine learning", category: "Methods", aliases: ["machine learning", "机器学习", "深度学习"], projectTerms: ["random forest", "xgboost", "lightgbm", "neural network", "随机森林", "神经网络"] },
  { label: "Statistical modeling", category: "Methods", aliases: ["statistical modeling", "statistical analysis", "统计建模", "统计模型", "统计分析"] },
  { label: "Longitudinal analysis", category: "Methods", aliases: ["longitudinal", "repeated measures", "纵向分析", "重复测量"], projectTerms: ["gee", "mixed-effects", "广义估计方程", "混合效应"] },
  { label: "Time-series analysis", category: "Methods", aliases: ["time series", "time-series", "时间序列", "时序数据"] },
  { label: "Mixed-effects models", category: "Methods", aliases: ["mixed-effects", "mixed models", "混合效应", "混合模型"] },
  { label: "Bayesian methods", category: "Methods", aliases: ["bayesian", "贝叶斯"] },
  { label: "Clinical data", category: "Data", aliases: ["clinical data", "临床数据"] },
  { label: "Biomedical data", category: "Data", aliases: ["biomedical data", "health data", "生物医学数据", "医疗健康数据"] },
  { label: "Multimodal data", category: "Data", aliases: ["multimodal data", "multi-modal data", "多模态数据", "多模态"] },
  { label: "Scientific visualization", category: "Communication", aliases: ["visualization", "scientific visualization", "可视化", "图表"] },
  { label: "Manuscript revision and reviewer response", category: "Communication", aliases: ["manuscript revision", "reviewer comments", "response to reviewers", "论文修改", "回复审稿意见"] },
  { label: "Peer review and professional service", category: "Professional Service", aliases: ["peer review", "reviewer", "同行评议", "审稿"] },
];

CV_JD_RULES.push(...CV_JD_EXTRA_RULES);
