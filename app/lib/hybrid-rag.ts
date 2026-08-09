export type IndustryTrack = "pharma" | "tech" | "quant" | "consulting" | "clinical_neuro";
export type MatchClassification = "Direct" | "Strong Transferable" | "Adjacent" | "No Evidence";

export type IndustryTranslation = {
  translation_type: "direct_match" | "strong_transferable" | "adjacent" | "no_evidence";
  valid_transferable_interpretation: string[];
  invalid_overclaim: string[];
};

export type FactIndexRecord = {
  fact_id: string;
  project_id: string;
  project_name: string;
  project_type: string;
  role: string;
  verified_fact: string;
  fact_status: string;
  personal_attribution: string;
  evidence_strength: string;
  source_tier: string;
  source: string;
  evidence_location: string;
  exact_methods_tools: string[];
  statistical_analytical_concepts: string[];
  problem_solved: string;
  transferable_capabilities: string[];
  industry_translation: Record<string, IndustryTranslation>;
  prohibited_overclaims: string[];
  concept_nodes: string[];
  claim_boundary: string;
  cv_eligible: boolean;
  retrieval_text: string;
};

export type ConceptEdge = {
  edge_id: string;
  family_id: string;
  from: string;
  to: string;
  type: "exact_synonym" | "statistical_parent_concept" | "statistical_child_concept" | "functional_equivalent" | "transferable_industry_interpretation" | "adjacent_concept";
  retrieval_weight: number;
  claim_strength: string;
  evidence: string[];
  guardrail: string;
  attribution: string;
};

export type RequirementRule = {
  label: string;
  category: string;
  aliases: string[];
  projectTerms?: string[];
};

export type JdRequirement = {
  requirementId: string;
  label: string;
  category: string;
  sourceText: string;
  literalTerms: string[];
  normalizedConcepts: string[];
  hardRequirement: boolean;
  importance: "critical" | "high" | "medium" | "low";
  scopes: Array<"production" | "regulatory" | "causal" | "client_facing">;
  namedTool: boolean;
};

export type GraphPath = {
  nodes: string[];
  edgeTypes: string[];
  score: number;
  adjacentPath: boolean;
  transferablePath: boolean;
};

export type HybridCandidate = {
  fact: FactIndexRecord;
  retrievalChannels: string[];
  bm25Score: number;
  embeddingScore: number;
  exactMethodOverlap: number;
  statisticalConceptSimilarity: number;
  problemSolvedSimilarity: number;
  industryFunctionalSimilarity: number;
  graphPath: GraphPath | null;
  preverificationScore: number;
  classification: MatchClassification;
  why: string;
  limitation: string;
  overclaimFlags: string[];
  hardScopeConflict: boolean;
  recommendedForCv: boolean | "conditional";
};

export type HybridMatch = {
  requirement: JdRequirement;
  classification: MatchClassification;
  candidates: HybridCandidate[];
  recommendedForCv: boolean | "conditional";
};

const ENGLISH_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "of", "on", "or", "that", "the", "to", "use", "using", "with",
  "ability", "candidate", "experience", "preferred", "required", "responsibilities", "responsibility", "skills", "work",
]);

const SCOPE_TERMS = {
  production: ["production", "deployment", "deploy", "serving", "mlops", "上线", "部署", "生产环境"],
  regulatory: ["regulatory", "fda", "ema", "submission", "监管", "申报"],
  causal: ["causal", "causality", "treatment effect", "因果", "处理效应"],
  client_facing: ["client-facing", "client facing", "client delivery", "客户交付", "客户沟通"],
} as const;

const GUARDRAIL_GROUPS = [
  ["production", "deployment", "deploy", "mlops", "serving", "生产", "部署"],
  ["regulatory", "fda", "ema", "submission", "监管", "申报"],
  ["causal", "causality", "因果"],
  ["trading", "alpha", "factor", "backtest", "portfolio", "交易", "回测", "因子", "投资组合"],
  ["client", "market access", "pricing", "reimbursement", "客户", "市场准入", "定价", "报销"],
  ["bayesian", "贝叶斯"],
  ["llm", "large language model", "foundation model", "大模型", "基础模型"],
];

export function parseJsonl<T>(value: string): T[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line) as T);
}

function normalized(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[–—_/]+/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsPhrase(text: string, phrase: string) {
  const source = normalized(text);
  const target = normalized(phrase);
  if (!target) return false;
  if (/[\u3400-\u9fff]/u.test(target)) return source.includes(target);
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(target)}(?=$|[^a-z0-9])`, "i").test(source);
}

function stem(token: string) {
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export function tokenize(value: string) {
  const source = normalized(value);
  const tokens: string[] = [];
  for (const token of source.match(/[a-z0-9][a-z0-9+#.-]*/g) ?? []) {
    if (!ENGLISH_STOP_WORDS.has(token)) tokens.push(stem(token));
  }
  for (const block of source.match(/[\u3400-\u9fff]+/gu) ?? []) {
    if (block.length === 1) tokens.push(block);
    for (let index = 0; index < block.length - 1; index += 1) tokens.push(block.slice(index, index + 2));
  }
  return tokens;
}

function tokenSet(value: string | string[]) {
  return new Set(Array.isArray(value) ? value.flatMap(tokenize) : tokenize(value));
}

function setSimilarity(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const value of left) if (right.has(value)) overlap += 1;
  return overlap / Math.sqrt(left.size * right.size);
}

function fnv1a(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// This deterministic local embedding keeps the retrieval channel available in Workers without an external model key.
export function localEmbedding(value: string, dimensions = 384) {
  const vector = new Float32Array(dimensions);
  const source = normalized(value);
  const features = [...tokenize(source)];
  const compact = source.replace(/\s+/g, " ");
  for (let index = 0; index < compact.length - 2; index += 1) features.push(compact.slice(index, index + 3));
  for (const feature of features) {
    const hash = fnv1a(feature);
    vector[hash % dimensions] += (hash & 1) === 0 ? 1 : -1;
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  if (norm > 0) {
    const scale = 1 / Math.sqrt(norm);
    for (let index = 0; index < vector.length; index += 1) vector[index] *= scale;
  }
  return vector;
}

function cosine(left: Float32Array, right: Float32Array) {
  let score = 0;
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index];
  return Math.max(0, score);
}

function splitJdUnits(jd: string) {
  return jd.replace(/\r/g, "").split(/\n+/)
    .flatMap((line) => line.match(/[^.!?。！？；;]+(?:[.!?。！？；;]+|$)/g) ?? [line])
    .flatMap((unit) => unit.split(/(?:(?:,|，)\s*(?:and|or|以及|并且|同时|及)\s*)/i))
    .map((unit) => unit.replace(/^\s*(?:[-*•·]|\d+[.)、])\s*/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function evidenceUnit(jd: string, terms: string[]) {
  const matched = splitJdUnits(jd).filter((unit) => terms.some((term) => containsPhrase(unit, term))).sort((a, b) => a.length - b.length)[0];
  const source = matched || jd;
  const maxLength = /[\u3400-\u9fff]/u.test(source) ? 150 : 220;
  if (source.length <= maxLength) return source;
  const term = terms.find((value) => containsPhrase(source, value)) || "";
  const index = normalized(source).indexOf(normalized(term));
  const start = Math.max(0, index - Math.floor(maxLength * 0.4));
  const end = Math.min(source.length, index + term.length + Math.floor(maxLength * 0.55));
  return `${start > 0 ? "…" : ""}${source.slice(start, end).trim()}${end < source.length ? "…" : ""}`;
}

function requirementScopes(sourceText: string) {
  return (Object.entries(SCOPE_TERMS) as Array<[keyof typeof SCOPE_TERMS, readonly string[]]>)
    .filter(([, terms]) => terms.some((term) => containsPhrase(sourceText, term)))
    .map(([scope]) => scope);
}

function dynamicVocabulary(facts: FactIndexRecord[], edges: ConceptEdge[]) {
  const methods = stableUnique(facts.flatMap((fact) => fact.exact_methods_tools)).filter((value) => normalized(value).length >= 2);
  const concepts = stableUnique(edges.flatMap((edge) => [edge.from, edge.to])).map((value) => value.replace(/_/g, " "));
  return { methods, concepts };
}

function stableUnique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function extractJdRequirements(jd: string, rules: RequirementRule[], facts: FactIndexRecord[], edges: ConceptEdge[]) {
  const requirements: Omit<JdRequirement, "requirementId">[] = [];
  const coveredTerms = new Set<string>();
  const graphNodes = stableUnique(edges.flatMap((edge) => [edge.from, edge.to]));

  for (const rule of rules) {
    const literalTerms = rule.aliases.filter((alias) => containsPhrase(jd, alias));
    if (!literalTerms.length) continue;
    literalTerms.forEach((term) => coveredTerms.add(normalized(term)));
    const sourceText = evidenceUnit(jd, literalTerms);
    const normalizedConcepts = graphNodes.filter((node) => {
      const phrase = node.replace(/_/g, " ");
      return containsPhrase(sourceText, phrase) || setSimilarity(tokenSet(phrase), tokenSet([rule.label, ...(rule.projectTerms ?? [])])) >= 0.72;
    });
    const hardRequirement = /\b(must|required|requirement|minimum|need to)\b|必须|要求|任职资格|需具备/i.test(sourceText);
    requirements.push({
      label: rule.label,
      category: rule.category,
      sourceText,
      literalTerms,
      normalizedConcepts: stableUnique([normalized(rule.label).replace(/ /g, "_"), ...normalizedConcepts]),
      hardRequirement,
      importance: hardRequirement ? "high" : "medium",
      scopes: requirementScopes(sourceText),
      namedTool: rule.category === "Programming and Data" || literalTerms.some((term) => /^[a-z0-9+#.-]{1,16}$/i.test(term)),
    });
  }

  const vocabulary = dynamicVocabulary(facts, edges);
  for (const item of [...vocabulary.methods.map((value) => ({ value, category: "Methods" })), ...vocabulary.concepts.map((value) => ({ value, category: "Analytical Concept" }))]) {
    if (coveredTerms.has(normalized(item.value)) || !containsPhrase(jd, item.value)) continue;
    const sourceText = evidenceUnit(jd, [item.value]);
    const hardRequirement = /\b(must|required|requirement|minimum|need to)\b|必须|要求|任职资格|需具备/i.test(sourceText);
    requirements.push({
      label: item.value.replace(/\b\w/g, (value) => value.toUpperCase()),
      category: item.category,
      sourceText,
      literalTerms: [item.value],
      normalizedConcepts: [normalized(item.value).replace(/ /g, "_")],
      hardRequirement,
      importance: hardRequirement ? "high" : "medium",
      scopes: requirementScopes(sourceText),
      namedTool: item.category === "Methods" && /^[a-z0-9+#.-]{1,16}$/i.test(item.value),
    });
    coveredTerms.add(normalized(item.value));
  }

  return requirements
    .filter((item, index, all) => all.findIndex((candidate) => normalized(candidate.label) === normalized(item.label)) === index)
    .slice(0, 45)
    .map((item, index) => ({ ...item, requirementId: `JD-R${String(index + 1).padStart(3, "0")}` }));
}

type Bm25Index = { documentTokens: string[][]; documentLengths: number[]; documentFrequency: Map<string, number>; averageLength: number };

function buildBm25Index(facts: FactIndexRecord[]): Bm25Index {
  const documentTokens = facts.map((fact) => tokenize(fact.retrieval_text));
  const documentFrequency = new Map<string, number>();
  for (const tokens of documentTokens) for (const token of new Set(tokens)) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
  const documentLengths = documentTokens.map((tokens) => tokens.length);
  return {
    documentTokens,
    documentLengths,
    documentFrequency,
    averageLength: documentLengths.reduce((sum, value) => sum + value, 0) / Math.max(1, documentLengths.length),
  };
}

function bm25Score(query: string, documentIndex: number, index: Bm25Index) {
  const queryTokens = tokenize(query);
  const documentTokens = index.documentTokens[documentIndex];
  const frequencies = new Map<string, number>();
  for (const token of documentTokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  const k1 = 1.5;
  const b = 0.75;
  let score = 0;
  for (const token of queryTokens) {
    const frequency = frequencies.get(token) ?? 0;
    if (!frequency) continue;
    const documentFrequency = index.documentFrequency.get(token) ?? 0;
    const inverseDocumentFrequency = Math.log(1 + (index.documentTokens.length - documentFrequency + 0.5) / (documentFrequency + 0.5));
    const denominator = frequency + k1 * (1 - b + b * index.documentLengths[documentIndex] / Math.max(1, index.averageLength));
    score += inverseDocumentFrequency * (frequency * (k1 + 1)) / denominator;
  }
  return score;
}

function exactMethodOverlap(requirement: JdRequirement, fact: FactIndexRecord) {
  const terms = stableUnique([...requirement.literalTerms, ...requirement.normalizedConcepts.map((value) => value.replace(/_/g, " "))]);
  const methods = fact.exact_methods_tools;
  if (terms.some((term) => methods.some((method) => containsPhrase(method, term) || containsPhrase(term, method)))) return 1;
  return setSimilarity(tokenSet(terms), tokenSet(methods));
}

function industryTrack(track: IndustryTrack) {
  if (track === "clinical_neuro") return "pharma";
  return track;
}

function graphExpansion(requirement: JdRequirement, edges: ConceptEdge[]) {
  const queryText = `${requirement.sourceText} ${requirement.normalizedConcepts.join(" ")}`;
  const nodes = stableUnique(edges.flatMap((edge) => [edge.from, edge.to]));
  const starts = nodes.filter((node) => containsPhrase(queryText, node.replace(/_/g, " ")) || setSimilarity(tokenSet(queryText), tokenSet(node.replace(/_/g, " "))) >= 0.62);
  const adjacency = new Map<string, Array<{ edge: ConceptEdge; next: string }>>();
  for (const edge of edges) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), { edge, next: edge.to }]);
    adjacency.set(edge.to, [...(adjacency.get(edge.to) ?? []), { edge, next: edge.from }]);
  }
  const results = new Map<string, GraphPath>();
  const queue = starts.map((node) => ({ node, nodes: [node], edgeTypes: [] as string[], score: 1, adjacentPath: false, transferablePath: false, depth: 0 }));
  const visited = new Map<string, number>();
  while (queue.length) {
    const current = queue.shift()!;
    if (current.depth >= 2) continue;
    for (const { edge, next } of adjacency.get(current.node) ?? []) {
      const adjacentPath = current.adjacentPath || edge.type === "adjacent_concept";
      const transferablePath = current.transferablePath || edge.type === "functional_equivalent" || edge.type === "transferable_industry_interpretation";
      if (current.adjacentPath && edge.type === "transferable_industry_interpretation") continue;
      const score = current.score * Math.max(0.01, edge.retrieval_weight || 0.4);
      const path: GraphPath = { nodes: [...current.nodes, next], edgeTypes: [...current.edgeTypes, edge.type], score, adjacentPath, transferablePath };
      for (const factId of edge.evidence) {
        const previous = results.get(factId);
        if (!previous || score > previous.score) results.set(factId, path);
      }
      const visitKey = `${next}:${current.depth + 1}:${adjacentPath}`;
      if ((visited.get(visitKey) ?? 0) >= score) continue;
      visited.set(visitKey, score);
      queue.push({ ...path, node: next, depth: current.depth + 1 });
    }
  }
  return results;
}

function evidenceStrengthScore(fact: FactIndexRecord) {
  if (fact.evidence_strength === "high" && fact.source_tier === "primary") return 1;
  if (fact.evidence_strength === "high") return 0.9;
  if (fact.evidence_strength === "medium") return 0.6;
  return 0.3;
}

function attributionScore(value: string) {
  return ({ explicit_primary_evidence: 1, authorship_plus_project_evidence: 0.9, user_confirmed_plus_project_evidence: 0.85, user_confirmed: 0.7, project_level_only: 0.15 } as Record<string, number>)[value] ?? 0.2;
}

function statusScore(value: string) {
  return ({ completed: 1, implemented: 1, reported_result: 1, in_progress: 0.45, planned: 0.25, project_context: 0.2 } as Record<string, number>)[value] ?? 0.3;
}

function guardrailFlags(requirement: JdRequirement, fact: FactIndexRecord) {
  return fact.prohibited_overclaims.filter((guardrail) => GUARDRAIL_GROUPS.some((group) => {
    const requirementHasGroup = group.some((term) => containsPhrase(requirement.sourceText, term));
    return requirementHasGroup && group.some((term) => containsPhrase(guardrail, term));
  }));
}

function scopeConflict(requirement: JdRequirement, fact: FactIndexRecord) {
  const evidenceText = `${fact.verified_fact} ${fact.exact_methods_tools.join(" ")} ${fact.problem_solved}`;
  return requirement.scopes.some((scope) => !SCOPE_TERMS[scope].some((term) => containsPhrase(evidenceText, term)));
}

function verifyCandidate(candidate: Omit<HybridCandidate, "classification" | "why" | "limitation" | "overclaimFlags" | "hardScopeConflict" | "recommendedForCv">, requirement: JdRequirement): HybridCandidate {
  const fact = candidate.fact;
  const overclaimFlags = guardrailFlags(requirement, fact);
  const hardScopeConflict = scopeConflict(requirement, fact);
  const embeddingOnly = candidate.retrievalChannels.length === 1 && candidate.retrievalChannels[0] === "embedding";
  let classification: MatchClassification = "No Evidence";

  if (fact.cv_eligible && candidate.exactMethodOverlap >= 0.78 && !hardScopeConflict && !overclaimFlags.length) classification = "Direct";
  else if (fact.cv_eligible && candidate.preverificationScore >= 42 && (candidate.problemSolvedSimilarity >= 0.34 || candidate.industryFunctionalSimilarity >= 0.42 || candidate.graphPath?.transferablePath)) classification = "Strong Transferable";
  else if (candidate.preverificationScore >= 16 || candidate.graphPath || candidate.bm25Score > 0 || candidate.embeddingScore > 0.12) classification = "Adjacent";

  if (!fact.cv_eligible) classification = "No Evidence";
  if (["planned", "project_context"].includes(fact.fact_status) && classification !== "No Evidence") classification = "Adjacent";
  if (fact.fact_status === "in_progress" && classification === "Direct") classification = "Strong Transferable";
  if (candidate.graphPath?.adjacentPath && candidate.exactMethodOverlap < 0.78) classification = "Adjacent";
  if (embeddingOnly && (classification === "Direct" || classification === "Strong Transferable")) classification = "Adjacent";
  if (requirement.namedTool && candidate.exactMethodOverlap < 0.78 && classification === "Direct") classification = "Adjacent";
  if ((hardScopeConflict || overclaimFlags.length) && classification === "Direct") classification = "Adjacent";

  const why = classification === "Direct"
    ? "The fact directly evidences the named method, tool, task, or substantially the same analytical function."
    : classification === "Strong Transferable"
      ? "The verified analytical function is strongly aligned, but the domain or responsibility wording differs."
      : classification === "Adjacent"
        ? "The retrieval signals are relevant, but a key method, ownership, completion, or scope element is missing."
        : "The record is contextual or cannot support a personal CV claim for this requirement.";
  const limitations = stableUnique([
    fact.claim_boundary,
    hardScopeConflict ? "The JD scope is not directly evidenced by this fact." : "",
    ...overclaimFlags,
    fact.fact_status === "planned" ? "Planned work cannot be written as completed experience." : "",
    fact.fact_status === "in_progress" ? "In-progress work must retain in-progress wording." : "",
    !fact.cv_eligible ? "Project-level context is not eligible for a personal CV bullet." : "",
  ]);
  const recommendedForCv = classification === "Direct" ? true : classification === "Strong Transferable" ? "conditional" : false;
  return { ...candidate, classification, why, limitation: limitations.join(" "), overclaimFlags, hardScopeConflict, recommendedForCv };
}

export function runHybridRag(jd: string, track: IndustryTrack, rules: RequirementRule[], facts: FactIndexRecord[], edges: ConceptEdge[]) {
  const requirements = extractJdRequirements(jd, rules, facts, edges);
  const bm25 = buildBm25Index(facts);
  const factEmbeddings = facts.map((fact) => localEmbedding(fact.retrieval_text));
  const matches: HybridMatch[] = [];

  for (const requirement of requirements) {
    const queryText = `${requirement.sourceText} ${requirement.normalizedConcepts.join(" ")}`;
    const queryEmbedding = localEmbedding(queryText);
    const graphResults = graphExpansion(requirement, edges);
    const raw = facts.map((fact, index) => {
      const bm25Value = bm25Score(queryText, index, bm25);
      const embeddingScore = cosine(queryEmbedding, factEmbeddings[index]);
      const exactOverlap = exactMethodOverlap(requirement, fact);
      const conceptSimilarity = setSimilarity(tokenSet(queryText), tokenSet(fact.statistical_analytical_concepts));
      const problemSimilarity = cosine(queryEmbedding, localEmbedding(fact.problem_solved));
      const translation = fact.industry_translation[industryTrack(track)] ?? { translation_type: "no_evidence", valid_transferable_interpretation: [], invalid_overclaim: [] };
      const industrySimilarity = setSimilarity(tokenSet(queryText), tokenSet(translation.valid_transferable_interpretation));
      const graphPath = graphResults.get(fact.fact_id) ?? null;
      const retrievalChannels = stableUnique([
        exactOverlap >= 0.45 ? "exact" : "",
        bm25Value > 0 ? "bm25" : "",
        embeddingScore > 0.08 ? "embedding" : "",
        graphPath ? "concept_graph" : "",
        industrySimilarity > 0 ? "industry_translation" : "",
      ]);
      const preverificationScore = Math.min(100,
        24 * Math.min(1, exactOverlap) +
        16 * Math.min(1, conceptSimilarity) +
        22 * Math.min(1, problemSimilarity) +
        12 * Math.min(1, industrySimilarity) +
        10 * evidenceStrengthScore(fact) +
        10 * attributionScore(fact.personal_attribution) +
        6 * statusScore(fact.fact_status));
      return {
        fact,
        retrievalChannels,
        bm25Score: bm25Value,
        embeddingScore,
        exactMethodOverlap: exactOverlap,
        statisticalConceptSimilarity: conceptSimilarity,
        problemSolvedSimilarity: problemSimilarity,
        industryFunctionalSimilarity: industrySimilarity,
        graphPath,
        preverificationScore,
      };
    });

    const bm25Cutoff = [...raw].sort((a, b) => b.bm25Score - a.bm25Score)[19]?.bm25Score ?? 0;
    const embeddingCutoff = [...raw].sort((a, b) => b.embeddingScore - a.embeddingScore)[19]?.embeddingScore ?? 0;
    const candidates = raw
      .filter((candidate) => candidate.exactMethodOverlap > 0 || candidate.graphPath || candidate.industryFunctionalSimilarity > 0 || candidate.bm25Score >= bm25Cutoff || candidate.embeddingScore >= embeddingCutoff)
      .map((candidate) => verifyCandidate(candidate, requirement))
      .sort((a, b) => b.preverificationScore - a.preverificationScore)
      .slice(0, 8);
    const classificationRank: Record<MatchClassification, number> = { Direct: 3, "Strong Transferable": 2, Adjacent: 1, "No Evidence": 0 };
    const bestEligible = candidates
      .filter((candidate) => candidate.classification !== "No Evidence")
      .sort((left, right) => classificationRank[right.classification] - classificationRank[left.classification] || right.preverificationScore - left.preverificationScore)[0];
    const classification = bestEligible?.classification ?? "No Evidence";
    matches.push({ requirement, classification, candidates, recommendedForCv: bestEligible?.recommendedForCv ?? false });
  }

  return {
    matches,
    diagnostics: {
      factCount: facts.length,
      conceptEdgeCount: edges.length,
      requirementCount: requirements.length,
      embeddingBackend: "local_subword_hash_v1",
      embeddingDimensions: 384,
      bm25Parameters: { k1: 1.5, b: 0.75 },
    },
  };
}
