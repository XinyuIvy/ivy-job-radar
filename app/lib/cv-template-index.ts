import type { FactIndexRecord, JdRequirement } from "./hybrid-rag";
import type { StructuredFactRecord } from "./structured-evidence";
import {
  CV_CAPABILITY_CONCEPTS,
  CV_CAPABILITY_RELATIONS,
  conceptsInText,
  relationBetween,
  requirementConceptIds,
  type CvRelationType,
} from "./cv-capability-ontology";
import { latexToPlainText } from "./latex-text";

export type CvSnippetType = "summary" | "education" | "coursework" | "skill" | "project_title" | "project_bullet" | "publication" | "award" | "service" | "other";

export type CvTemplateSnippet = {
  snippetId: string;
  templateName: string;
  section: string;
  snippetType: CvSnippetType;
  entityId: string;
  rawLatex: string;
  visibleText: string;
  conceptIds: string[];
  factIds: string[];
  sourceFile: string;
  location: string;
  present: true;
};

export type TemplateRelationPath = {
  fromConcept: string;
  toConcept: string;
  relationType: CvRelationType;
  nodes: string[];
  confidence: number;
  explanation: string;
};

export type CvTemplateMatch = {
  snippet: CvTemplateSnippet;
  relationPath: TemplateRelationPath;
  confidence: number;
};

function normalized(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[–—_/]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string) {
  const source = normalized(value);
  const english = source.match(/[a-z0-9][a-z0-9+#.-]*/g) ?? [];
  const chinese = source.match(/[\u3400-\u9fff]+/gu) ?? [];
  const zh = chinese.flatMap((block) => block.length < 2 ? [block] : Array.from({ length: block.length - 1 }, (_, index) => block.slice(index, index + 2)));
  return [...new Set([...english, ...zh])];
}

function similarity(left: string, right: string) {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / Math.sqrt(a.size * b.size);
}

function lineNumber(source: string, offset: number) {
  return source.slice(0, Math.max(0, offset)).split(/\r?\n/).length;
}

function sectionRanges(template: string) {
  const matches = [...template.matchAll(/\\section\*\{(?:\\Large\s*)?([^{}]+)\}/g)];
  return matches.map((match, index) => ({
    name: latexToPlainText(match[1]).trim(),
    start: match.index ?? 0,
    bodyStart: (match.index ?? 0) + match[0].length,
    end: matches[index + 1]?.index ?? template.length,
  }));
}

function sectionType(section: string) {
  const value = normalized(section);
  if (/个人简介|summary|profile/.test(value)) return "summary";
  if (/教育|education/.test(value)) return "education";
  if (/技能|skill/.test(value)) return "skill";
  if (/课程|coursework/.test(value)) return "coursework";
  if (/论文|publication|荣誉|award/.test(value)) return "publication";
  if (/研究|project|经历|experience/.test(value)) return "project";
  if (/服务|service/.test(value)) return "service";
  return "other";
}

function entityIdFromTitle(title: string, facts: FactIndexRecord[]) {
  const ranked = facts.map((fact) => ({ projectId: fact.project_id, score: similarity(title, fact.project_name) }))
    .sort((a, b) => b.score - a.score)[0];
  return ranked && ranked.score >= 0.48 ? ranked.projectId : "";
}

function linkedFactIds(text: string, entityId: string, facts: FactIndexRecord[], structured: StructuredFactRecord[]) {
  const result = new Set<string>();
  if (entityId) facts.filter((fact) => fact.project_id === entityId).forEach((fact) => result.add(fact.fact_id));
  for (const record of structured) {
    const needles = [record.verified_fact, record.field ?? "", record.course ?? "", record.skill ?? "", record.title ?? "", record.institution ?? ""].filter(Boolean);
    const best = Math.max(...needles.map((needle) => similarity(text, needle)), 0);
    if (best >= 0.58) result.add(record.fact_id);
  }
  return [...result];
}

function makeSnippet(params: Omit<CvTemplateSnippet, "conceptIds" | "factIds" | "present">, facts: FactIndexRecord[], structured: StructuredFactRecord[]) {
  const visibleText = latexToPlainText(params.rawLatex).replace(/\s+/g, " ").trim();
  return {
    ...params,
    visibleText,
    conceptIds: conceptsInText(visibleText),
    factIds: linkedFactIds(visibleText, params.entityId, facts, structured),
    present: true as const,
  };
}

export function buildCvTemplateIndex(
  template: string,
  templateName: string,
  facts: FactIndexRecord[],
  structured: StructuredFactRecord[],
) {
  const snippets: CvTemplateSnippet[] = [];
  for (const section of sectionRanges(template)) {
    const body = template.slice(section.bodyStart, section.end);
    const kind = sectionType(section.name);
    const baseLine = lineNumber(template, section.bodyStart);

    if (kind === "summary") {
      const text = body.trim();
      if (latexToPlainText(text).trim()) snippets.push(makeSnippet({
        snippetId: `${templateName}:summary`, templateName, section: section.name, snippetType: "summary", entityId: "summary",
        rawLatex: text, visibleText: "", sourceFile: templateName, location: `lines ${baseLine}-${baseLine + text.split(/\r?\n/).length - 1}`,
      }, facts, structured));
      continue;
    }

    if (kind === "education") {
      const markers = [...body.matchAll(/\\noindent\s*\\textbf\{([^{}]+)\}/g)];
      markers.forEach((match, index) => {
        const start = match.index ?? 0;
        const end = markers[index + 1]?.index ?? body.length;
        const raw = body.slice(start, end).trim();
        snippets.push(makeSnippet({
          snippetId: `${templateName}:education:${index + 1}`, templateName, section: section.name, snippetType: "education", entityId: `education-${index + 1}`,
          rawLatex: raw, visibleText: "", sourceFile: templateName, location: `line ${baseLine + body.slice(0, start).split(/\r?\n/).length - 1}`,
        }, facts, structured));
      });
      continue;
    }

    if (kind === "skill" || kind === "coursework") {
      const lines = body.split(/\r?\n/);
      lines.forEach((line, index) => {
        const visible = latexToPlainText(line).trim();
        if (!visible || (!line.includes("\\textbf") && visible.length < 8)) return;
        snippets.push(makeSnippet({
          snippetId: `${templateName}:${kind}:${index + 1}`, templateName, section: section.name, snippetType: kind === "skill" ? "skill" : "coursework", entityId: `${kind}-${index + 1}`,
          rawLatex: line.trim(), visibleText: "", sourceFile: templateName, location: `line ${baseLine + index}`,
        }, facts, structured));
      });
      continue;
    }

    if (kind === "project") {
      const headings = [...body.matchAll(/\\noindent\s*\\textbf\{([^{}\n]+)\}/g)];
      headings.forEach((heading, index) => {
        const start = heading.index ?? 0;
        const end = headings[index + 1]?.index ?? body.length;
        const block = body.slice(start, end);
        const title = latexToPlainText(heading[1]).trim();
        const entityId = entityIdFromTitle(title, facts);
        snippets.push(makeSnippet({
          snippetId: `${templateName}:project:${index + 1}:title`, templateName, section: section.name, snippetType: "project_title", entityId,
          rawLatex: heading[0], visibleText: "", sourceFile: templateName, location: `line ${baseLine + body.slice(0, start).split(/\r?\n/).length - 1}`,
        }, facts, structured));
        const items = [...block.matchAll(/\\item\s+([\s\S]*?)(?=\\item|\\end\{itemize\}|$)/g)];
        items.forEach((item, bulletIndex) => snippets.push(makeSnippet({
          snippetId: `${templateName}:project:${index + 1}:bullet:${bulletIndex + 1}`, templateName, section: section.name, snippetType: "project_bullet", entityId,
          rawLatex: item[0].trim(), visibleText: "", sourceFile: templateName,
          location: `line ${baseLine + body.slice(0, start + (item.index ?? 0)).split(/\r?\n/).length - 1}`,
        }, facts, structured)));
      });
      continue;
    }

    const items = [...body.matchAll(/\\item\s+([\s\S]*?)(?=\\item|\\end\{itemize\}|$)/g)];
    if (items.length) {
      items.forEach((item, index) => {
        const visible = latexToPlainText(item[0]);
        const snippetType: CvSnippetType = /20\d{2}|journal|期刊|arxiv|doi|\bemph\b/i.test(item[0]) ? "publication" : /奖|award|prize|honor/i.test(visible) ? "award" : kind === "service" ? "service" : "other";
        snippets.push(makeSnippet({
          snippetId: `${templateName}:${kind}:${index + 1}`, templateName, section: section.name, snippetType, entityId: "",
          rawLatex: item[0].trim(), visibleText: "", sourceFile: templateName, location: `line ${baseLine + body.slice(0, item.index ?? 0).split(/\r?\n/).length - 1}`,
        }, facts, structured));
      });
    } else {
      const raw = body.trim();
      if (latexToPlainText(raw).trim()) snippets.push(makeSnippet({
        snippetId: `${templateName}:${kind}:1`, templateName, section: section.name, snippetType: "other", entityId: "",
        rawLatex: raw, visibleText: "", sourceFile: templateName, location: `line ${baseLine}`,
      }, facts, structured));
    }
  }
  return snippets.filter((snippet) => snippet.visibleText.length >= 2);
}

function directRelation(from: string, to: string): TemplateRelationPath | null {
  if (from === to) {
    const concept = CV_CAPABILITY_CONCEPTS.get(from);
    return { fromConcept: from, toConcept: to, relationType: "exact_equivalent", nodes: [from], confidence: 1, explanation: `${concept?.zh ?? from} 与 JD canonical concept 相同。` };
  }
  const relation = relationBetween(from, to);
  if (!relation) return null;
  const allowedConfidence: Record<CvRelationType, number> = {
    exact_equivalent: 1,
    native_synonym: 0.98,
    narrower_than: 0.94,
    evidence_for: 0.94,
    transferable_to: 0.78,
    related_only: 0.48,
    excluded: 0,
  };
  return {
    fromConcept: from,
    toConcept: to,
    relationType: relation.type,
    nodes: [from, to],
    confidence: allowedConfidence[relation.type],
    explanation: relation.note ?? `${from} ${relation.type} ${to}`,
  };
}

function twoHopRelation(from: string, to: string): TemplateRelationPath | null {
  for (const first of CV_CAPABILITY_RELATIONS.filter((relation) => relation.from === from && !["related_only", "excluded"].includes(relation.type))) {
    const second = relationBetween(first.to, to);
    if (!second || ["related_only", "excluded"].includes(second.type)) continue;
    const confidence = first.type === "transferable_to" || second.type === "transferable_to" ? 0.7 : 0.86;
    return { fromConcept: from, toConcept: to, relationType: first.type === "transferable_to" || second.type === "transferable_to" ? "transferable_to" : second.type, nodes: [from, first.to, to], confidence, explanation: `${from} → ${first.type} → ${first.to} → ${second.type} → ${to}` };
  }
  return null;
}

export function searchCvTemplate(
  requirement: JdRequirement,
  snippets: CvTemplateSnippet[],
  hasFactualSupport: boolean,
  strongestEvidenceClass: string,
) {
  if (!hasFactualSupport) return { covered: false, matches: [] as CvTemplateMatch[] };
  const targets = requirementConceptIds(requirement);
  const matches: CvTemplateMatch[] = [];
  for (const snippet of snippets) {
    for (const from of snippet.conceptIds) {
      for (const to of targets) {
        const path = directRelation(from, to) ?? twoHopRelation(from, to);
        if (!path || path.relationType === "excluded" || path.relationType === "related_only") continue;
        if (path.relationType === "transferable_to" && strongestEvidenceClass !== "Strong Transferable") continue;
        matches.push({ snippet, relationPath: path, confidence: path.confidence });
      }
    }
    const literalHit = requirement.literalTerms.some((term) => normalized(snippet.visibleText).includes(normalized(term)));
    if (literalHit) matches.push({
      snippet,
      relationPath: { fromConcept: targets[0] ?? requirement.label, toConcept: targets[0] ?? requirement.label, relationType: "native_synonym", nodes: [targets[0] ?? requirement.label], confidence: 0.99, explanation: "当前 CV 片段包含 JD 原始表达或其本地同义表达。" },
      confidence: 0.99,
    });
  }
  const ranked = matches
    .sort((a, b) => b.confidence - a.confidence || Number(Boolean(a.snippet.factIds.length)) - Number(Boolean(b.snippet.factIds.length)))
    .filter((item, index, all) => all.findIndex((candidate) => candidate.snippet.snippetId === item.snippet.snippetId && candidate.relationPath.toConcept === item.relationPath.toConcept) === index)
    .slice(0, 4);
  return { covered: ranked.some((match) => match.confidence >= 0.78), matches: ranked };
}
