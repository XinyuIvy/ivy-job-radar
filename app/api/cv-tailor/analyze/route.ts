import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RequirementRule = {
  label: string;
  category: string;
  aliases: string[];
  projectTerms?: string[];
};

type ProjectRecommendation = {
  name: string;
  score: number;
  matchedRequirements: string[];
  alreadyInTemplate: boolean;
  evidence: string;
};

const requirements: RequirementRule[] = [
  { label: "Scientific study design", category: "Research Design", aliases: ["study design", "scientific studies", "clinical studies", "observational", "prospective", "retrospective", "interventional"], projectTerms: ["study design", "clinical trial", "observational", "simulation"] },
  { label: "Human-subjects research", category: "Research Design", aliases: ["human subjects", "protocol development", "endpoint selection", "ethics", "irb"], projectTerms: ["clinical trial", "endpoint", "protocol", "ehr", "patient"] },
  { label: "Wearable and physiological data", category: "Data", aliases: ["wearable", "physiological", "digital health", "biobehavioral"], projectTerms: ["daily", "diary", "digital", "physiological", "patient-reported"] },
  { label: "Clinical and multimodal data", category: "Data", aliases: ["clinical data", "multimodal", "multi-modal", "biomedical data"], projectTerms: ["multimodal", "multi-modal", "clinical", "ehr", "imaging"] },
  { label: "Time-series analysis", category: "Methods", aliases: ["time-series", "time series", "temporal data"], projectTerms: ["time series", "longitudinal", "daily", "temporal"] },
  { label: "Regression and mixed models", category: "Methods", aliases: ["regression", "mixed models", "mixed-effects", "mixed effects"], projectTerms: ["regression", "mixed-effects", "mixed effects", "gee"] },
  { label: "Bayesian methods", category: "Methods", aliases: ["bayesian"], projectTerms: ["bayesian"] },
  { label: "Machine learning", category: "Methods", aliases: ["machine learning", "machine-learning"], projectTerms: ["machine learning", "random forest", "xgboost", "lightgbm", "neural network"] },
  { label: "Statistical modeling", category: "Methods", aliases: ["statistical modeling", "statistical methods", "statistical analysis"], projectTerms: ["statistical", "model", "inference"] },
  { label: "Python", category: "Programming and Data", aliases: ["python"] },
  { label: "R", category: "Programming and Data", aliases: ["r programming", "using r", " r,", " r and", " r;", " r "] },
  { label: "SQL", category: "Programming and Data", aliases: ["sql"] },
  { label: "Reproducible computational workflows", category: "Engineering", aliases: ["reproducible", "computational workflow", "analytical workflow", "jupyter", "rstudio", "git", "docker", "conda"], projectTerms: ["reproducible", "git", "quarto", "pipeline", "workflow"] },
  { label: "Scientific visualization", category: "Communication", aliases: ["visualization", "figures", "scientific data visualization"], projectTerms: ["visualization", "figures", "dashboard", "shiny"] },
  { label: "Manuscripts and scientific dissemination", category: "Communication", aliases: ["manuscripts", "abstracts", "reports", "patents", "publication", "presentations", "scientific dissemination"], projectTerms: ["first author", "manuscript", "publication", "presentation"] },
  { label: "Research leadership from hypothesis to publication", category: "Leadership", aliases: ["leading scientific research", "hypothesis through publication", "first-authored", "first authored"], projectTerms: ["first author", "led", "lead project", "project lead"] },
  { label: "Cross-functional collaboration", category: "Collaboration", aliases: ["cross-functionally", "cross-functional", "collaborative", "stakeholders", "partnership"], projectTerms: ["cross-functional", "collaboration", "stakeholder", "multidisciplinary"] },
  { label: "Evidence-based decision support", category: "Decision Support", aliases: ["evidence-based decisions", "decision-ready", "insight generation", "practical health applications"], projectTerms: ["decision support", "recommendation", "trial design", "operating trade-offs"] },
  { label: "Clinical and regulatory collaboration", category: "Collaboration", aliases: ["clinical", "regulatory", "research operations"], projectTerms: ["clinical", "regulatory", "endpoint", "trial"] },
  { label: "Industry-academia experience", category: "Experience", aliases: ["industry and academia", "intersection of industry and academia"], projectTerms: ["pfizer", "industry", "university"] },
  { label: "UAE research experience", category: "Regional Preference", aliases: ["uae", "united arab emirates"], projectTerms: ["uae", "united arab emirates"] },
  { label: "Sleep and circadian science", category: "Domain", aliases: ["sleep", "circadian"], projectTerms: ["sleep", "circadian"] },
  { label: "Digital health", category: "Domain", aliases: ["digital health"], projectTerms: ["digital health", "digital endpoint", "wearable"] },
];

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
  return text.slice(Math.max(0, index - 150), Math.min(text.length, index + alias.length + 300)).replace(/\s+/g, " ").trim();
}

function projectSections(facts: string) {
  const headings = [...facts.matchAll(/^####\s+(.+)$/gm)];
  return headings.map((match, index) => {
    const start = match.index ?? 0;
    const end = headings[index + 1]?.index ?? facts.length;
    return { name: match[1].trim(), text: facts.slice(start, end) };
  }).filter((section) => /Project|Pfizer|Readmission|Treatment Effect|Confidence|NeuroStat|Distance Model|AI Usage|Ivy Job Radar/i.test(section.name));
}

function recommendProjects(facts: string, template: string, detected: RequirementRule[]) {
  return projectSections(facts).map((project) => {
    const matchedRequirements = detected.filter((requirement) => {
      const terms = requirement.projectTerms ?? requirement.aliases;
      return hasAlias(project.text, terms);
    }).map((requirement) => requirement.label);
    const score = matchedRequirements.length;
    return {
      name: project.name,
      score,
      matchedRequirements,
      alreadyInTemplate: normalized(template).includes(normalized(project.name.replace(/^.*?—\s*/, ""))) || normalized(template).includes(normalized(project.name.split(":" ).pop() || project.name)),
      evidence: project.text.slice(0, 420).replace(/\s+/g, " ").trim(),
    } satisfies ProjectRecommendation;
  }).filter((project) => project.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { track?: string; jd?: string; template?: string; facts?: string; keywords?: string };
  const track = body.track || "tech";
  const jd = body.jd || "";
  const template = body.template || "";
  const facts = body.facts || "";
  const detected = requirements.filter((rule) => hasAlias(jd, rule.aliases));
  const matches = detected.map((rule) => {
    const covered = hasAlias(template, rule.aliases);
    const factSupported = hasAlias(facts, [...rule.aliases, ...(rule.projectTerms ?? [])]);
    return {
      keyword: rule.label,
      category: rule.category,
      status: covered ? "covered" : factSupported ? "supported_gap" : "unsupported_gap",
      factEvidence: factSupported ? evidenceContext(facts, [...rule.aliases, ...(rule.projectTerms ?? [])]) : "",
      jdEvidence: evidenceContext(jd, rule.aliases),
    };
  });
  const projects = recommendProjects(facts, template, detected);
  return NextResponse.json({
    track,
    matches,
    projects,
    summary: {
      required: matches.length,
      covered: matches.filter((item) => item.status === "covered").length,
      supportedGaps: matches.filter((item) => item.status === "supported_gap").length,
      unsupportedGaps: matches.filter((item) => item.status === "unsupported_gap").length,
    },
  });
}
