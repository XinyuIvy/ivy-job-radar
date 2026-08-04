import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RequirementRule = {
  label: string;
  category: string;
  aliases: string[];
  projectTerms?: string[];
};

type SupportEvidence = {
  project: string;
  fact: string;
  relevance: string;
};

type ProjectRecommendation = {
  name: string;
  score: number;
  matchedRequirements: string[];
  alreadyInTemplate: boolean;
  evidence: string;
};

const templates: Record<string, string> = {
  pharma: "cv_pharma.md",
  tech: "cv_tech.md",
  quant: "cv_quant.md",
  consulting: "cv_healthcare_consulting.md",
};

const requirements: RequirementRule[] = [
  { label: "Scientific study design", category: "Research Design", aliases: ["study design", "scientific studies", "clinical studies", "observational", "prospective", "retrospective", "interventional"], projectTerms: ["study design", "clinical trial", "observational", "simulation", "endpoint"] },
  { label: "Human-subjects research", category: "Research Design", aliases: ["human subjects", "protocol development", "endpoint selection", "ethics", "irb"], projectTerms: ["clinical trial", "endpoint", "protocol", "ehr", "patient", "participants"] },
  { label: "Wearable and physiological data", category: "Data", aliases: ["wearable", "physiological", "digital health", "biobehavioral"], projectTerms: ["daily", "diary", "digital", "physiological", "patient-reported", "high-frequency"] },
  { label: "Clinical and multimodal data", category: "Data", aliases: ["clinical data", "multimodal", "multi-modal", "biomedical data"], projectTerms: ["multimodal", "multi-modal", "clinical", "ehr", "imaging"] },
  { label: "Time-series analysis", category: "Methods", aliases: ["time-series", "time series", "temporal data"], projectTerms: ["time series", "longitudinal", "daily", "temporal", "repeated"] },
  { label: "Regression and mixed models", category: "Methods", aliases: ["regression", "mixed models", "mixed-effects", "mixed effects"], projectTerms: ["regression", "mixed-effects", "mixed effects", "gee"] },
  { label: "Bayesian methods", category: "Methods", aliases: ["bayesian"], projectTerms: ["bayesian"] },
  { label: "Machine learning", category: "Methods", aliases: ["machine learning", "machine-learning"], projectTerms: ["machine learning", "random forest", "xgboost", "lightgbm", "neural network"] },
  { label: "Statistical modeling", category: "Methods", aliases: ["statistical modeling", "statistical methods", "statistical analysis", "logistic regression", "regression"], projectTerms: ["statistical", "model", "inference"] },
  { label: "Python", category: "Programming and Data", aliases: ["python"] },
  { label: "R", category: "Programming and Data", aliases: ["r programming", "using r", " r,", " r and", " r;", " r ", "r;"] },
  { label: "SQL", category: "Programming and Data", aliases: ["sql"] },
  { label: "Reproducible computational workflows", category: "Engineering", aliases: ["reproducible", "computational workflow", "analytical workflow", "jupyter", "rstudio", "git", "docker", "conda"], projectTerms: ["reproducible", "git", "quarto", "pipeline", "workflow"] },
  { label: "Scientific visualization", category: "Communication", aliases: ["visualization", "figures", "scientific data visualization"], projectTerms: ["visualization", "figures", "dashboard", "shiny"] },
  { label: "Manuscripts and scientific dissemination", category: "Communication", aliases: ["manuscripts", "abstracts", "reports", "patents", "publication", "presentations", "scientific dissemination"], projectTerms: ["first author", "manuscript", "publication", "presentation", "report"] },
  { label: "Research leadership from hypothesis to publication", category: "Leadership", aliases: ["leading scientific research", "hypothesis through publication", "first-authored", "first authored"], projectTerms: ["first author", "led", "lead project", "project lead", "corresponding author"] },
  { label: "Cross-functional collaboration", category: "Collaboration", aliases: ["cross-functionally", "cross-functional", "collaborative", "stakeholders", "partnership"], projectTerms: ["cross-functional", "collaboration", "stakeholder", "multidisciplinary", "team"] },
  { label: "Evidence-based decision support", category: "Decision Support", aliases: ["evidence-based decisions", "decision-ready", "insight generation", "practical health applications"], projectTerms: ["decision support", "recommendation", "trial design", "operating trade-offs", "recommendation"] },
  { label: "Clinical and regulatory collaboration", category: "Collaboration", aliases: ["clinical", "regulatory", "research operations"], projectTerms: ["clinical", "regulatory", "endpoint", "trial"] },
  { label: "Industry-academia experience", category: "Experience", aliases: ["industry and academia", "intersection of industry and academia"], projectTerms: ["pfizer", "industry", "university"] },
  { label: "UAE research experience", category: "Regional Preference", aliases: ["uae", "united arab emirates"], projectTerms: ["uae", "united arab emirates"] },
  { label: "Sleep and circadian science", category: "Domain", aliases: ["sleep", "circadian"], projectTerms: ["sleep", "circadian"] },
  { label: "Digital health", category: "Domain", aliases: ["digital health"], projectTerms: ["digital health", "digital endpoint", "wearable"] },
];

const supportReasons: Record<string, string> = {
  "Scientific study design": "该项目包含研究问题、试验或模拟设计、终点比较或分析方案，可证明研究设计能力。",
  "Human-subjects research": "该项目使用患者、受试者或临床数据，并涉及终点、研究流程或人体研究语境。",
  "Wearable and physiological data": "该项目处理日记、重复测量、数字测量或高频健康信号，与 wearable 数据结构相近，但不能等同于真实 wearable 研究。",
  "Clinical and multimodal data": "该项目联合分析临床、EHR、影像或多来源数据，可支持复杂生物医学数据分析能力。",
  "Time-series analysis": "该项目包含纵向、重复测量、每日记录或时间顺序验证，可支持时间相关数据分析。",
  "Regression and mixed models": "该项目使用回归、GEE、混合效应或相关结构建模，可支持这一方法要求。",
  "Bayesian methods": "该项目明确使用 Bayesian 方法时才可支持。",
  "Machine learning": "该项目实际训练和比较机器学习模型，而不是只在课程中接触。",
  "Statistical modeling": "该项目包含明确的统计模型、推断或模型评估工作。",
  "Reproducible computational workflows": "该项目包含可复现代码、版本控制、流水线、报告或结构化工作流。",
  "Scientific visualization": "该项目生成图表、可视化工具或分析展示，用于解释复杂结果。",
  "Manuscripts and scientific dissemination": "该项目形成论文、报告、摘要、演示或其他科学传播成果。",
  "Research leadership from hypothesis to publication": "该项目有第一作者、项目主导或从方法设计推进到论文产出的证据。",
  "Cross-functional collaboration": "该项目需要与不同专业、研究或业务合作方共同推进。",
  "Evidence-based decision support": "该项目把分析结果转化为方法选择、试验设计或可执行建议。",
  "Clinical and regulatory collaboration": "该项目处于临床试验或临床研究语境，并与临床或监管相关工作相邻。",
  "Industry-academia experience": "该经历连接药企或行业项目与学术研究训练。",
  "Digital health": "该项目处理数字化健康测量、患者报告结果或健康数据系统。",
};

function normalized(value: string) {
  return value.toLocaleLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

function hasAlias(text: string, aliases: string[]) {
  const source = normalized(text);
  return aliases.some((alias) => source.includes(normalized(alias)));
}

function evidenceContext(text: string, aliases: string[]) {
  const source = normalized(text);
  const alias = aliases.find((item) => source.includes(normalized(item)));
  if (!alias) return "";
  const index = source.indexOf(normalized(alias));
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

function projectSections(facts: string) {
  const headings = [...facts.matchAll(/^####\s+(.+)$/gm)];
  return headings.map((match, index) => {
    const start = match.index ?? 0;
    const end = headings[index + 1]?.index ?? facts.length;
    return { name: match[1].trim(), text: facts.slice(start, end) };
  }).filter((section) => /Project|Pfizer|Readmission|Treatment Effect|Confidence|NeuroStat|Distance Model|AI Usage|Ivy Job Radar|Multimodal|Clinical Trial/i.test(section.name));
}

function cleanFactLine(line: string) {
  return line
    .replace(/^[-*]\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isRestrictionLine(line: string) {
  return /\b(must not|do not|cannot|can't|should not|after august|after the internship|wording must|audited|not default|recommended standardized|deliverables?)\b|不能|不得|不可|不要|仅可|禁用|限制|结束后|措辞|审计/i.test(line);
}

function candidateFactLines(projectText: string, terms: string[]) {
  return projectText
    .split(/\r?\n/)
    .map(cleanFactLine)
    .filter((line) => line.length >= 28 && line.length <= 360)
    .filter((line) => !isRestrictionLine(line))
    .filter((line) => hasAlias(line, terms))
    .sort((a, b) => {
      const score = (line: string) => terms.filter((term) => hasAlias(line, [term])).length;
      return score(b) - score(a);
    });
}

function supportReason(rule: RequirementRule) {
  return supportReasons[rule.label] || "该事实与 JD 中的这项要求有直接方法、数据或职责关联。";
}

function collectSupportEvidence(facts: string, rule: RequirementRule): SupportEvidence[] {
  const terms = rule.projectTerms ?? rule.aliases;
  const evidence: SupportEvidence[] = [];
  for (const project of projectSections(facts)) {
    if (!hasAlias(project.text, terms)) continue;
    const lines = candidateFactLines(project.text, terms);
    for (const fact of lines.slice(0, 2)) {
      evidence.push({ project: project.name, fact, relevance: supportReason(rule) });
      if (evidence.length >= 3) return evidence;
    }
  }

  if (evidence.length === 0 && rule.category === "Programming and Data") {
    const lines = facts
      .split(/\r?\n/)
      .map(cleanFactLine)
      .filter((line) => !isRestrictionLine(line) && hasAlias(line, rule.aliases))
      .slice(0, 2);
    for (const fact of lines) {
      evidence.push({ project: "Technical skills evidence", fact, relevance: "事实母版明确记录了该编程或数据技能。" });
    }
  }
  return evidence;
}

function recommendProjects(facts: string, template: string, detected: RequirementRule[]) {
  return projectSections(facts).map((project) => {
    const matchedRequirements = detected.filter((requirement) => {
      const terms = requirement.projectTerms ?? requirement.aliases;
      return hasAlias(project.text, terms) && candidateFactLines(project.text, terms).length > 0;
    }).map((requirement) => requirement.label);
    const score = matchedRequirements.length;
    return {
      name: project.name,
      score,
      matchedRequirements,
      alreadyInTemplate: normalized(template).includes(normalized(project.name.replace(/^.*?—\s*/, ""))) || normalized(template).includes(normalized(project.name.split(":" ).pop() || project.name)),
      evidence: candidateFactLines(project.text, detected.flatMap((item) => item.projectTerms ?? item.aliases))[0] || "",
    } satisfies ProjectRecommendation;
  }).filter((project) => project.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { track?: string; jd?: string };
  const track = body.track && templates[body.track] ? body.track : "tech";
  const jd = body.jd || "";
  const { env } = await import("cloudflare:workers");
  const token = String(env.CV_GITHUB_TOKEN || "").trim();

  if (!token) {
    return NextResponse.json({
      error: "XinyuIvy/CV 是私有仓库。请先配置 CV_GITHUB_TOKEN，再运行 CV 分析。",
      code: "CV_TOKEN_REQUIRED",
    }, { status: 503 });
  }

  try {
    const [template, facts] = await Promise.all([
      readPrivateFile(`master/template-cv/${templates[track]}`, token),
      readPrivateFile("master/FACT_MASTER.md", token),
    ]);
    const detected = requirements.filter((rule) => hasAlias(jd, rule.aliases));
    const matches = detected.map((rule) => {
      const covered = hasAlias(template, rule.aliases);
      const supportEvidence = covered ? [] : collectSupportEvidence(facts, rule);
      return {
        keyword: rule.label,
        category: rule.category,
        status: covered ? "covered" : supportEvidence.length > 0 ? "supported_gap" : "unsupported_gap",
        supportEvidence,
        templateEvidence: covered ? evidenceContext(template, rule.aliases) : "",
        jdEvidence: evidenceContext(jd, rule.aliases),
      };
    });
    const projects = recommendProjects(facts, template, detected);
    return NextResponse.json({
      track,
      matches,
      projects,
      sourceDiagnostics: { templateFile: templates[track], templateLength: template.length, factsLength: facts.length },
      summary: {
        required: matches.length,
        covered: matches.filter((item) => item.status === "covered").length,
        supportedGaps: matches.filter((item) => item.status === "supported_gap").length,
        unsupportedGaps: matches.filter((item) => item.status === "unsupported_gap").length,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CV source loading failed." }, { status: 502 });
  }
}
