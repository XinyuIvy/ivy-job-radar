import { NextRequest, NextResponse } from "next/server";
import {
  parseJsonl,
  runHybridRag,
  type ConceptEdge,
  type FactIndexRecord,
  type HybridCandidate,
  type HybridMatch,
  type IndustryTrack,
  type RequirementRule,
} from "../../../lib/hybrid-rag";
import {
  matchStructuredEvidence,
  type StructuredCandidate,
  type StructuredFactRecord,
} from "../../../lib/structured-evidence";
import { CV_JD_RULES, requirementConceptIds } from "../../../lib/cv-capability-ontology";
import {
  buildCvTemplateIndex,
  searchCvTemplate,
  type CvTemplateMatch,
} from "../../../lib/cv-template-index";

export const dynamic = "force-dynamic";

type TemplateLanguage = "en" | "zh";
type EvidenceClassification = "Direct" | "Credential Direct" | "Coursework Match" | "Strong Transferable" | "Credential Status Gap" | "Adjacent";
type MatchStatus = "covered" | "supported_gap" | "adjacent_gap" | "unsupported_gap";

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
  evidenceType: "project_fact" | StructuredFactRecord["record_type"];
};

type TemplateMatchView = {
  snippetId: string;
  section: string;
  entityId: string;
  rawLatex: string;
  visibleText: string;
  conceptIds: string[];
  factIds: string[];
  sourceFile: string;
  location: string;
  relationType: string;
  relationPath: string[];
  relationExplanation: string;
  confidence: number;
};

type RequirementMatch = {
  requirementId: string;
  keyword: string;
  category: string;
  canonicalConcepts: string[];
  status: MatchStatus;
  evidenceClassification: EvidenceClassification | "No Evidence";
  supportEvidence: SupportEvidence[];
  templateCovered: boolean;
  templateEvidence: string;
  templateMatches: TemplateMatchView[];
  jdEvidence: string;
  jdMatchedTerms: string[];
  confidence: number;
  action: string;
  reason: string;
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

type ModificationDraft = {
  id: string;
  action: "revise_existing" | "consider_addition" | "add_to_section" | "no_direct_edit";
  status: "supported_gap" | "adjacent_gap";
  targetSection: string;
  canGenerateEdit: boolean;
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
  latexDiff: { before: string; after: string } | null;
};

const templateFiles: Record<TemplateLanguage, Record<string, string | null>> = {
  en: { pharma: "cv_pharma.tex", tech: "cv_tech.tex", quant: "cv_quant.tex", consulting: "cv_healthcare_consulting.tex", clinical_neuro: null },
  zh: { pharma: "cv_pharma_cn.tex", tech: "cv_tech_cn.tex", quant: "cv_quant_cn.tex", consulting: "cv_healthcare_consulting_cn.tex", clinical_neuro: "cv_clinical_data_neuro_cn.tex" },
};

const evidenceRank: Record<EvidenceClassification, number> = {
  Direct: 6,
  "Credential Direct": 6,
  "Strong Transferable": 5,
  "Coursework Match": 3,
  "Credential Status Gap": 2,
  Adjacent: 1,
};

function decodeBase64Utf8(content: string) {
  const binary = atob(content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function readPrivateFile(path: string, token: string) {
  const response = await fetch(`https://api.github.com/repos/XinyuIvy/CV/contents/${path}?ref=main`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ivy-job-radar-cv-tailor",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`CV source read failed for ${path}: ${response.status}`);
  const payload = await response.json() as { content?: string };
  if (!payload.content) throw new Error(`CV source ${path} did not contain file content.`);
  return decodeBase64Utf8(payload.content);
}

function verifiedSupportEvidence(candidate: HybridCandidate, track: IndustryTrack): SupportEvidence | null {
  if (candidate.classification === "No Evidence") return null;
  const fact = candidate.fact;
  const translationTrack = track === "clinical_neuro" ? "pharma" : track;
  const translation = fact.industry_translation[translationTrack];
  const classification: EvidenceClassification = fact.fact_status === "planned" ? "Adjacent" : candidate.classification;
  return {
    projectId: fact.project_id,
    project: fact.project_name,
    factId: fact.fact_id,
    fact: fact.verified_fact,
    factStatus: fact.fact_status,
    evidenceStrength: fact.evidence_strength,
    classification,
    relevance: fact.fact_status === "planned"
      ? `${candidate.why} The underlying fact is still planned, so it cannot support completed-experience coverage.`
      : candidate.why,
    source: fact.source,
    evidenceLocation: fact.evidence_location,
    claimBoundary: fact.claim_boundary,
    capabilityContext: fact.problem_solved,
    industryTranslation: translation?.valid_transferable_interpretation[0] || "",
    industryGuardrail: candidate.limitation,
    score: Math.round(candidate.preverificationScore * 10) / 10,
    retrievalChannels: candidate.retrievalChannels,
    evidenceType: "project_fact",
  };
}

function structuredEvidenceLabel(candidate: StructuredCandidate) {
  const record = candidate.record;
  if (record.record_type === "education_credential") return `Education · ${record.institution}`;
  if (record.record_type === "coursework") return `Coursework · ${record.institution}`;
  if (record.record_type === "skill") return `Skill · ${record.skill}`;
  if (record.record_type === "publication") return `Publication · ${record.title}`;
  if (record.record_type === "research_literature") return "Scholarly literature workflow";
  if (record.record_type === "conference_participation") return `Conference participation · ${record.conference ?? "conference"}${record.year ? ` ${record.year}` : ""}`;
  if (record.record_type === "professional_service") return "Professional service";
  if (record.record_type === "teaching") return "Teaching";
  return "Awards and honors";
}

function structuredSupportEvidence(candidate: StructuredCandidate): SupportEvidence {
  const record = candidate.record;
  return {
    projectId: `profile:${record.fact_id}`,
    project: structuredEvidenceLabel(candidate),
    factId: record.fact_id,
    fact: record.verified_fact,
    factStatus: record.course_status || record.degree_status || record.publication_status || "verified",
    evidenceStrength: record.evidence_strength,
    classification: candidate.classification,
    relevance: candidate.why,
    source: record.source,
    evidenceLocation: record.evidence_location || "",
    claimBoundary: record.claim_boundary || "",
    capabilityContext: record.normalized_concepts?.join(" · ") || "",
    industryGuardrail: candidate.limitation,
    score: candidate.score,
    retrievalChannels: [record.record_type === "coursework" ? "coursework_index" : record.record_type === "education_credential" ? "credential_index" : record.record_type === "conference_participation" ? "conference_index" : "profile_index"],
    evidenceType: record.record_type,
  };
}

function templateMatchView(match: CvTemplateMatch): TemplateMatchView {
  return {
    snippetId: match.snippet.snippetId,
    section: match.snippet.section,
    entityId: match.snippet.entityId,
    rawLatex: match.snippet.rawLatex,
    visibleText: match.snippet.visibleText,
    conceptIds: match.snippet.conceptIds,
    factIds: match.snippet.factIds,
    sourceFile: match.snippet.sourceFile,
    location: match.snippet.location,
    relationType: match.relationPath.relationType,
    relationPath: match.relationPath.nodes,
    relationExplanation: match.relationPath.explanation,
    confidence: Math.round(match.confidence * 1000) / 1000,
  };
}

function strongestClassification(evidence: SupportEvidence[]) {
  return evidence.sort((left, right) => evidenceRank[right.classification] - evidenceRank[left.classification] || (right.score ?? 0) - (left.score ?? 0))[0]?.classification ?? "Adjacent";
}

function statusAction(status: MatchStatus) {
  if (status === "covered") return "母版已覆盖，不需要为了这个要求新增内容。";
  if (status === "supported_gap") return "事实库支持，但当前母版表达不足；进入逐条修改。";
  if (status === "adjacent_gap") return "只有相邻证据；可以解释相关性，但不能写成已完成该要求。";
  return "无事实支持；保留在完整分析中，不生成 CV 修改。";
}

function reasonFor(status: MatchStatus, templateMatches: TemplateMatchView[], evidence: SupportEvidence[]) {
  if (status === "covered") return templateMatches[0]?.relationExplanation || "事实和当前 CV 片段共同支持该要求。";
  if (status === "supported_gap") return `找到 ${evidence.length} 条可用事实证据，但当前 CV 片段索引没有找到足够强的表达。`;
  if (status === "adjacent_gap") return "现有事实只达到 Adjacent 或存在学位状态差距，不能升级为直接经验。";
  return "事实索引、结构化学历/课程/论文索引均没有足够证据。";
}

function runCompleteHybridRag(
  jd: string,
  track: IndustryTrack,
  rules: RequirementRule[],
  factIndex: FactIndexRecord[],
  conceptEdges: ConceptEdge[],
) {
  const chunkSize = 30;
  const allMatches: HybridMatch[] = [];
  for (let offset = 0; offset < rules.length; offset += chunkSize) {
    allMatches.push(...runHybridRag(jd, track, rules.slice(offset, offset + chunkSize), factIndex, conceptEdges).matches);
  }
  const seen = new Set<string>();
  const matches = allMatches.filter((match) => {
    const key = `${match.requirement.category}\u0000${match.requirement.label}\u0000${match.requirement.sourceText}`.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((match, index) => ({
    ...match,
    requirement: {
      ...match.requirement,
      requirementId: `JD-R${String(index + 1).padStart(3, "0")}`,
    },
  }));
  return { matches };
}

function projectRecommendations(matches: RequirementMatch[], snippets: ReturnType<typeof buildCvTemplateIndex>) {
  const byProject = new Map<string, { name: string; requirements: Map<string, SupportEvidence> }>();
  for (const match of matches) {
    for (const evidence of match.supportEvidence.filter((item) => item.evidenceType === "project_fact" && ["Direct", "Strong Transferable"].includes(item.classification))) {
      const current = byProject.get(evidence.projectId) ?? { name: evidence.project, requirements: new Map<string, SupportEvidence>() };
      const previous = current.requirements.get(match.keyword);
      if (!previous || evidenceRank[evidence.classification] > evidenceRank[previous.classification]) current.requirements.set(match.keyword, evidence);
      byProject.set(evidence.projectId, current);
    }
  }
  return [...byProject.entries()].map(([projectId, value]) => {
    const evidence = [...value.requirements.values()];
    return {
      projectId,
      name: value.name,
      score: evidence.reduce((sum, item) => sum + evidenceRank[item.classification] * 10 + (item.score ?? 0) / 10, 0),
      matchedRequirements: [...value.requirements.keys()],
      classifications: [...new Set(evidence.map((item) => item.classification))],
      alreadyInTemplate: snippets.some((snippet) => snippet.entityId === projectId),
      evidence: evidence.sort((left, right) => evidenceRank[right.classification] - evidenceRank[left.classification])[0] ?? null,
    } satisfies ProjectRecommendation;
  }).sort((left, right) => right.score - left.score).slice(0, 8);
}

function targetSection(evidence: SupportEvidence, language: TemplateLanguage) {
  const zh = language === "zh";
  if (evidence.evidenceType === "education_credential") return zh ? "教育背景" : "Education";
  if (evidence.evidenceType === "coursework") return zh ? "专业技能 / 相关课程" : "Relevant Coursework";
  if (evidence.evidenceType === "skill") return zh ? "专业技能" : "Technical Skills";
  if (evidence.evidenceType === "publication") return zh ? "部分论文与荣誉" : "Selected Publications";
  if (evidence.evidenceType === "conference_participation") return zh ? "学术会议 / 学术服务" : "Conferences / Professional Service";
  if (evidence.evidenceType === "professional_service") return zh ? "学术服务" : "Professional Service";
  if (evidence.evidenceType === "teaching") return zh ? "教学经历" : "Teaching";
  if (evidence.evidenceType === "award") return zh ? "部分论文与荣誉" : "Honors & Awards";
  return zh ? "代表性研究 / 项目经历" : "Research / Projects";
}

function buildModificationDrafts(matches: RequirementMatch[], language: TemplateLanguage) {
  const drafts: ModificationDraft[] = [];
  for (const match of matches.filter((item) => ["supported_gap", "adjacent_gap"].includes(item.status))) {
    const evidence = match.supportEvidence[0];
    if (!evidence) continue;
    if (match.status === "adjacent_gap") {
      drafts.push({
        id: `${match.requirementId}-${evidence.factId}`,
        action: "no_direct_edit",
        status: "adjacent_gap",
        targetSection: language === "zh" ? "不直接写入 CV" : "Do not add as a direct claim",
        canGenerateEdit: false,
        projectId: evidence.projectId,
        project: evidence.project,
        requirement: match.keyword,
        classification: evidence.classification,
        factId: evidence.factId,
        verifiedFact: evidence.fact,
        proposedBullet: "",
        source: evidence.source,
        evidenceLocation: evidence.evidenceLocation,
        claimBoundary: evidence.claimBoundary || evidence.industryGuardrail || "Adjacent evidence only.",
        rationale: "只有相邻证据或状态差距，禁止把它改写成已经完成的同名能力。",
        latexDiff: null,
      });
      continue;
    }
    drafts.push({
      id: `${match.requirementId}-${evidence.factId}`,
      action: evidence.evidenceType === "project_fact" ? "revise_existing" : "add_to_section",
      status: "supported_gap",
      targetSection: targetSection(evidence, language),
      canGenerateEdit: true,
      projectId: evidence.projectId,
      project: evidence.project,
      requirement: match.keyword,
      classification: evidence.classification,
      factId: evidence.factId,
      verifiedFact: evidence.fact,
      proposedBullet: evidence.fact,
      source: evidence.source,
      evidenceLocation: evidence.evidenceLocation,
      claimBoundary: evidence.claimBoundary || evidence.industryGuardrail || "",
      rationale: `事实库支持该要求，但所选母版没有足够清楚的片段。建议在 ${targetSection(evidence, language)} 中用真实事实加强表达。`,
      latexDiff: null,
    });
  }
  return drafts;
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { track?: string; language?: TemplateLanguage; jd?: string };
  const language: TemplateLanguage = body.language === "zh" ? "zh" : "en";
  const track = body.track && body.track in templateFiles[language] ? body.track : "tech";
  const jd = body.jd?.trim() || "";
  const templateFile = templateFiles[language][track];
  const { env } = await import("cloudflare:workers");
  const token = String(env.CV_GITHUB_TOKEN || "").trim();

  if (!jd) return NextResponse.json({ error: "该申请没有完整 JD，无法分析。", code: "JD_REQUIRED" }, { status: 400 });
  if (!token) return NextResponse.json({ error: "XinyuIvy/CV 是私有仓库。请先配置 CV_GITHUB_TOKEN，再运行 CV 分析。", code: "CV_TOKEN_REQUIRED" }, { status: 503 });
  if (!templateFile) return NextResponse.json({ error: "该方向当前没有所选语言的 LaTeX 母版。", code: "CV_TEMPLATE_LANGUAGE_UNAVAILABLE" }, { status: 400 });

  try {
    const [template, factIndexJsonl, statusAddendumJsonl, conceptEdgesJsonl, credentialIndexJsonl, courseworkIndexJsonl, profileIndexJsonl, literatureIndexJsonl, conferenceIndexJsonl] = await Promise.all([
      readPrivateFile(`master/template-cv/${templateFile}`, token),
      readPrivateFile("master/project-evidence/FACT_INDEX.jsonl", token),
      readPrivateFile("master/project-evidence/FACT_INDEX_STATUS_ADDENDUM.jsonl", token),
      readPrivateFile("master/project-evidence/CONCEPT_EDGES.jsonl", token),
      readPrivateFile("master/project-evidence/CREDENTIAL_INDEX.jsonl", token),
      readPrivateFile("master/project-evidence/COURSEWORK_INDEX.jsonl", token),
      readPrivateFile("master/project-evidence/PROFILE_INDEX.jsonl", token),
      readPrivateFile("master/project-evidence/LITERATURE_INDEX.jsonl", token),
      readPrivateFile("master/project-evidence/CONFERENCE_INDEX.jsonl", token),
    ]);

    const unifiedFactIndex = [
      ...parseJsonl<FactIndexRecord>(factIndexJsonl),
      ...parseJsonl<FactIndexRecord>(statusAddendumJsonl),
    ];
    const factIndex = unifiedFactIndex.filter((fact) => !fact.record_type || fact.record_type === "project_fact");
    const structuredIndex = [
      ...parseJsonl<StructuredFactRecord>(credentialIndexJsonl),
      ...parseJsonl<StructuredFactRecord>(courseworkIndexJsonl),
      ...parseJsonl<StructuredFactRecord>(profileIndexJsonl),
      ...parseJsonl<StructuredFactRecord>(literatureIndexJsonl),
      ...parseJsonl<StructuredFactRecord>(conferenceIndexJsonl),
    ];
    const conceptEdges = parseJsonl<ConceptEdge>(conceptEdgesJsonl);
    const rag = runCompleteHybridRag(jd, track as IndustryTrack, CV_JD_RULES, factIndex, conceptEdges);
    const templateIndex = buildCvTemplateIndex(template, templateFile, factIndex, structuredIndex);

    const matches: RequirementMatch[] = rag.matches.map((hybridMatch) => {
      const projectEvidence = hybridMatch.candidates
        .map((candidate) => verifiedSupportEvidence(candidate, track as IndustryTrack))
        .filter((evidence): evidence is SupportEvidence => Boolean(evidence));
      const structuredEvidence = matchStructuredEvidence(hybridMatch.requirement, structuredIndex).map(structuredSupportEvidence);
      const supportEvidence = [...projectEvidence, ...structuredEvidence]
        .sort((left, right) => evidenceRank[right.classification] - evidenceRank[left.classification] || (right.score ?? 0) - (left.score ?? 0))
        .filter((item, index, all) => all.findIndex((candidate) => candidate.factId === item.factId) === index)
        .slice(0, 6);
      const supportedEvidence = supportEvidence.filter((item) => ["Direct", "Credential Direct", "Coursework Match", "Strong Transferable"].includes(item.classification));
      const hasSupported = supportedEvidence.length > 0;
      const hasAdjacent = supportEvidence.some((item) => item.classification === "Adjacent" || item.classification === "Credential Status Gap");
      const strongest = hasSupported ? strongestClassification(supportedEvidence) : hasAdjacent ? strongestClassification(supportEvidence) : "Adjacent";
      const templateSearch = searchCvTemplate(hybridMatch.requirement, templateIndex, hasSupported, strongest);
      const templateMatches = templateSearch.matches.map(templateMatchView);
      const status: MatchStatus = templateSearch.covered ? "covered" : hasSupported ? "supported_gap" : hasAdjacent ? "adjacent_gap" : "unsupported_gap";
      const evidenceClassification: EvidenceClassification | "No Evidence" = hasSupported || hasAdjacent ? strongest : "No Evidence";
      const confidence = status === "covered"
        ? Math.round((templateMatches[0]?.confidence ?? 0) * 100)
        : supportEvidence[0]?.score ? Math.min(99, Math.round(supportEvidence[0].score)) : status === "unsupported_gap" ? 0 : 45;
      return {
        requirementId: hybridMatch.requirement.requirementId,
        keyword: hybridMatch.requirement.label,
        category: hybridMatch.requirement.category,
        canonicalConcepts: requirementConceptIds(hybridMatch.requirement),
        status,
        evidenceClassification,
        supportEvidence,
        templateCovered: templateSearch.covered,
        templateEvidence: templateMatches[0]?.visibleText || "",
        templateMatches,
        jdEvidence: hybridMatch.requirement.sourceText,
        jdMatchedTerms: hybridMatch.requirement.literalTerms,
        confidence,
        action: statusAction(status),
        reason: reasonFor(status, templateMatches, supportEvidence),
      };
    });

    const projects = projectRecommendations(matches, templateIndex);
    const modificationDrafts = buildModificationDrafts(matches, language);
    const summary = {
      required: matches.length,
      covered: matches.filter((item) => item.status === "covered").length,
      supportedGaps: matches.filter((item) => item.status === "supported_gap").length,
      adjacentGaps: matches.filter((item) => item.status === "adjacent_gap").length,
      unsupportedGaps: matches.filter((item) => item.status === "unsupported_gap").length,
    };

    return NextResponse.json({
      track,
      language,
      matches,
      projects,
      modificationDrafts,
      summary,
      sourceDiagnostics: {
        templateFile,
        templateSnippetCount: templateIndex.length,
        factIndexFile: "master/project-evidence/FACT_INDEX.jsonl + FACT_INDEX_STATUS_ADDENDUM.jsonl",
        atomicFactCount: factIndex.length,
        structuredFactCount: structuredIndex.length,
        conceptEdgeCount: conceptEdges.length,
        templateMatching: "independent_semantic_snippet_index",
        factMatching: "complete_chunked_hybrid_rag",
        ontology: "shared_bilingual_capability_ontology",
      },
    });
  } catch (error) {
    console.error("CV Tailor analysis failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "CV Tailor analysis failed." }, { status: 500 });
  }
}
