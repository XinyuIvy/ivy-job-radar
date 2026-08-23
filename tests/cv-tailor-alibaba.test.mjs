import assert from "node:assert/strict";
import test from "node:test";

import { runHybridRag } from "../app/lib/hybrid-rag.ts";
import { CV_JD_RULES } from "../app/lib/cv-capability-ontology.ts";
import { buildCvTemplateIndex, searchCvTemplate } from "../app/lib/cv-template-index.ts";
import { matchStructuredEvidence } from "../app/lib/structured-evidence.ts";

const noTranslation = { translation_type: "no_evidence", valid_transferable_interpretation: [], invalid_overclaim: [] };
const translations = { pharma: noTranslation, tech: noTranslation, quant: noTranslation, consulting: noTranslation };

function projectFact(overrides) {
  return {
    record_type: "project_fact",
    fact_id: "TEST-001",
    project_id: "test",
    project_name: "Test project",
    project_type: "software_system",
    role: "project lead",
    verified_fact: "Implemented a verified workflow.",
    fact_status: "completed",
    personal_attribution: "explicit_primary_evidence",
    evidence_strength: "high",
    source_tier: "primary",
    source: "test fixture",
    evidence_location: "fixture",
    exact_methods_tools: [],
    statistical_analytical_concepts: [],
    problem_solved: "Evaluate a workflow.",
    transferable_capabilities: [],
    industry_translation: translations,
    prohibited_overclaims: [],
    concept_nodes: [],
    claim_boundary: "",
    cv_eligible: true,
    retrieval_text: "Implemented a verified workflow.",
    ...overrides,
  };
}

const alibabaJd = `
面向 Auto Research 的强化学习算法与数据合成体系研究。
理工类科研领域中的自动化科研智能体，自主决策、规划、工具调用、代码执行、实验验证。
Agentic 数据生成、数据清洗、数据筛选、数据增强、数据配比和后训练数据管线。
研究 PPO、DPO、GRPO 等强化学习后训练方法，关注奖励设计、训练稳定性、探索效率和泛化能力。
代码生成、实验执行、错误修复、结果分析、论文写作，形成训练与评测闭环并关注模型鲁棒性。
要求在高水平期刊或会议发表经过同行评议的论文。
计算机、AI、信息、数学、统计、自动化及相关 STEM 或交叉学科博士。
熟练 Python、PyTorch，具备算法实现、实验设计和结果分析能力。
具有 LLM、多模态大模型、RL、Agent、工具调用、自动化科研或自动化推理相关背景。
能够独立推进科研项目，具备扎实理论背景、问题定义、论文阅读与复现能力，以及创新、沟通协作和跨学科合作能力。
`;

const facts = [
  projectFact({
    fact_id: "NSVL-007",
    project_id: "neurostat_virtual_lab",
    project_name: "NeuroStat Virtual Lab",
    verified_fact: "Started implementing the single-agent baseline workflow for the bounded NeuroStat research task.",
    fact_status: "in_progress",
    exact_methods_tools: ["single-agent research workflow implementation"],
    statistical_analytical_concepts: ["baseline workflow implementation"],
    problem_solved: "Establish a single-agent baseline for later matched workflow comparison.",
    retrieval_text: "Started implementing a single-agent research workflow baseline for agent workflow evaluation.",
    industry_translation: {
      ...translations,
      tech: { translation_type: "strong_transferable", valid_transferable_interpretation: ["single-agent research workflow prototyping"], invalid_overclaim: ["Do not claim RL or LLM training."] },
    },
  }),
  projectFact({
    fact_id: "PY-001",
    project_id: "ivy_job_radar",
    project_name: "Ivy Job Radar",
    verified_fact: "Implemented data and software workflows in Python.",
    exact_methods_tools: ["Python"],
    retrieval_text: "Implemented Python data and software workflows.",
  }),
];

function completeRag() {
  const matches = [];
  for (let offset = 0; offset < CV_JD_RULES.length; offset += 30) {
    matches.push(...runHybridRag(alibabaJd, "tech", CV_JD_RULES.slice(offset, offset + 30), facts, []).matches);
  }
  const unique = new Map();
  for (const match of matches) unique.set(`${match.requirement.category}\u0000${match.requirement.label}`, match);
  return [...unique.values()];
}

test("Alibaba JD is atomized without sibling collapse or a 45-item ceiling", () => {
  const matches = completeRag();
  const labels = new Set(matches.map((item) => item.requirement.label));
  const required = [
    "Doctoral degree", "Statistics background", "STEM-related field", "Interdisciplinary background",
    "STEM research domain", "Peer-reviewed publications", "Python", "PyTorch", "Reinforcement learning",
    "PPO", "DPO", "GRPO", "RL post-training", "Reward design", "Training stability",
    "Exploration efficiency", "Generalization", "Agent system", "Autonomous decision making",
    "Agent planning", "Tool calling", "Code execution", "Experiment validation", "Agentic data generation",
    "Data cleaning", "Data filtering", "Data augmentation", "Data mixture", "Data pipeline", "LLM",
    "Multimodal foundation model", "Problem definition", "Independent research", "Literature review",
    "Paper reproduction", "Experiment design", "Result analysis", "Scientific writing", "Cross-disciplinary collaboration",
    "Code generation", "Experiment execution", "Error fixing", "Training and evaluation loop", "Model robustness",
    "Algorithm implementation", "Automated research", "Automated reasoning", "Theoretical background", "Innovation",
    "Communication and collaboration",
  ];
  for (const label of required) assert.ok(labels.has(label), `missing atom: ${label}`);
  assert.ok(matches.length > 45, `complete extraction unexpectedly capped at ${matches.length}`);
  console.log(`Alibaba fixture atomic requirement count: ${matches.length}`);
});

test("Alibaba named RL methods and PyTorch remain No Evidence", () => {
  const byLabel = new Map(completeRag().map((item) => [item.requirement.label, item]));
  for (const label of ["PyTorch", "Reinforcement learning", "PPO", "DPO", "GRPO", "RL post-training", "Reward design", "Training stability", "Exploration efficiency"]) {
    assert.equal(byLabel.get(label)?.classification, "No Evidence", label);
  }
  assert.equal(byLabel.get("Python")?.classification, "Direct");
});

test("Biostatistics education snippet covers Statistics through narrower_than", () => {
  const requirement = {
    requirementId: "JD-R001",
    label: "Statistics background",
    category: "Education",
    sourceText: "数学、统计、自动化及相关 STEM 或交叉学科博士",
    literalTerms: ["数学、统计", "统计、自动化"],
    normalizedConcepts: ["statistics_background"],
    evidenceTerms: ["biostatistics", "statistics"],
    hardRequirement: true,
    importance: "high",
    scopes: [],
    namedTool: false,
  };
  const credentials = [{
    record_type: "education_credential",
    fact_id: "EDU-VU-PHD-BIOSTAT",
    verified_fact: "Enrolled in a Graduate Doctoral Degree program with Biostatistics major at Vanderbilt University.",
    evidence_strength: "high",
    source_tier: "primary_record",
    source: "transcript",
    evidence_location: "Biostatistics Major",
    claim_boundary: "PhD is in progress.",
    cv_eligible: true,
    match_class: "credential_direct",
    institution: "Vanderbilt University",
    degree_level: "PhD",
    degree_status: "candidate / in progress",
    field: "Biostatistics",
    normalized_concepts: ["biostatistics"],
    retrieval_text: "Vanderbilt PhD candidate in Biostatistics",
  }];
  const candidates = matchStructuredEvidence(requirement, credentials);
  assert.equal(candidates[0]?.classification, "Credential Direct");
  const latex = String.raw`\section*{\Large 教育背景}
\noindent\textbf{生物统计学博士} $\mid$ 范德堡大学 \hfill 预计 2027 年 5 月毕业 \\
`;
  const snippets = buildCvTemplateIndex(latex, "cv_tech_cn.tex", [], credentials);
  const match = searchCvTemplate(requirement, snippets, true, "Credential Direct");
  assert.equal(match.covered, true);
  assert.equal(match.matches[0]?.relationPath.relationType, "narrower_than");
});

test("realistic Chinese CV snippets cover STEM field and interdisciplinary background", () => {
  const credentials = [{
    record_type: "education_credential",
    fact_id: "EDU-VU-PHD-BIOSTAT",
    verified_fact: "Enrolled in a Graduate Doctoral Degree program with Biostatistics major at Vanderbilt University.",
    evidence_strength: "high",
    source_tier: "primary_record",
    source: "transcript",
    evidence_location: "Biostatistics Major",
    claim_boundary: "PhD is in progress.",
    cv_eligible: true,
    match_class: "credential_direct",
    institution: "Vanderbilt University",
    degree_level: "PhD",
    degree_status: "candidate / in progress",
    field: "Biostatistics",
    normalized_concepts: ["biostatistics"],
    retrieval_text: "Vanderbilt PhD candidate in Biostatistics",
  }];
  const latex = String.raw`\section*{\Large 个人简介}
范德堡大学生物统计学博士候选人。
\section*{\Large 教育背景}
\noindent\textbf{生物统计学博士} $\mid$ 范德堡大学 \hfill 预计 2027 年毕业 \\
\section*{\Large 代表性研究}
\noindent\textbf{神经影像统计研究}
\begin{itemize}
\item 基于神经影像数据开展统计建模与生物医学研究。
\end{itemize}
`;
  const snippets = buildCvTemplateIndex(latex, "cv_tech_cn.tex", [], credentials);
  const stemRequirement = {
    requirementId: "JD-R-STEM", label: "STEM-related field", category: "Education",
    sourceText: "统计及相关 STEM 专业博士", literalTerms: ["相关 STEM"],
    normalizedConcepts: ["stem_field"], evidenceTerms: ["biostatistics"], hardRequirement: true,
    importance: "high", scopes: [], namedTool: false,
  };
  const interdisciplinaryRequirement = {
    requirementId: "JD-R-INTER", label: "Interdisciplinary background", category: "Collaboration",
    sourceText: "交叉学科博士", literalTerms: ["交叉学科"],
    normalizedConcepts: ["interdisciplinary_research"], evidenceTerms: ["neuroimaging"],
    hardRequirement: true, importance: "high", scopes: [], namedTool: false,
  };
  assert.equal(searchCvTemplate(stemRequirement, snippets, true, "Credential Direct").covered, true);
  const interdisciplinary = searchCvTemplate(interdisciplinaryRequirement, snippets, true, "Direct");
  assert.equal(interdisciplinary.covered, true);
  assert.equal(interdisciplinary.matches[0]?.relationPath.relationType, "evidence_for");
});

test("published journal snippet can evidence peer-reviewed publication but under-review status cannot", () => {
  const requirement = {
    requirementId: "JD-R002",
    label: "Peer-reviewed publications",
    category: "Communication",
    sourceText: "在高水平期刊或会议发表经过同行评议的论文",
    literalTerms: ["同行评议", "高水平期刊"],
    normalizedConcepts: ["peer_reviewed_publication"],
    evidenceTerms: ["published", "journal article"],
    hardRequirement: true,
    importance: "high",
    scopes: [],
    namedTool: false,
  };
  const published = {
    record_type: "publication", fact_id: "PUB-SC-2025", verified_fact: "published manuscript", evidence_strength: "high",
    source_tier: "primary", source: "paper", cv_eligible: true, match_class: "publication_direct",
    title: "Semiparametric confidence sets for cross-sectional and longitudinal neuroimaging", publication_status: "published",
    venue: "Imaging Neuroscience", authorship: "first author", normalized_concepts: [], retrieval_text: "published journal article",
  };
  const review = { ...published, fact_id: "PUB-REVIEW", title: "Under review paper", publication_status: "under_review", retrieval_text: "under review manuscript" };
  const candidates = matchStructuredEvidence(requirement, [published, review]);
  assert.ok(candidates.some((item) => item.record.fact_id === "PUB-SC-2025"));
  assert.ok(!candidates.some((item) => item.record.fact_id === "PUB-REVIEW"));
  const latex = String.raw`\section*{\Large 部分论文与荣誉}
\begin{itemize}
\item Zhang, X. “Semiparametric confidence sets for cross-sectional and longitudinal neuroimaging.” \emph{Imaging Neuroscience}, 2025。
\item Zhang, X. “Under review paper.” 正在审稿。
\end{itemize}
`;
  const snippets = buildCvTemplateIndex(latex, "cv_tech_cn.tex", [], [published, review]);
  const templateMatch = searchCvTemplate(requirement, snippets, true, "Direct");
  assert.equal(templateMatch.covered, true);
  assert.equal(templateMatch.matches[0]?.relationPath.relationType, "evidence_for");
  assert.ok(templateMatch.matches[0]?.snippet.factIds.includes("PUB-SC-2025"));
  assert.ok(!templateMatch.matches.some((item) => item.snippet.factIds.includes("PUB-REVIEW")));
});
