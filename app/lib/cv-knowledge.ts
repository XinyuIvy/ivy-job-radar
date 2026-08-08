export type KnowledgeFact = {
  fact_id?: string;
  project?: string | { name?: string };
  verified_fact?: string;
  exact_methods?: string[];
  statistical_concepts?: string[];
  problems_solved?: string[];
  transferable_capabilities?: string[];
  domains?: string[];
  industry_translation?: Record<string, string[]>;
  prohibited_overclaims?: string[];
  evidence_strength?: string;
  source_evidence?: unknown;
};

type GitHubFile = { content?: string; encoding?: string; sha?: string; size?: number };

export const KNOWLEDGE_FILES = {
  facts: "knowledge/FACT_INDEX.json",
  ontology: "knowledge/CAPABILITY_ONTOLOGY.json",
  translations: "knowledge/INDUSTRY_TRANSLATION_MAP.json",
} as const;

function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function readCvRepoFile(path: string, token: string) {
  const response = await fetch(`https://api.github.com/repos/XinyuIvy/CV/contents/${path}?ref=main`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Ivy-Job-Radar",
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${path}`);
  const payload = await response.json() as GitHubFile;
  if (payload.encoding !== "base64" || !payload.content) return null;
  return { text: decodeBase64Utf8(payload.content), sha: payload.sha || "", size: payload.size || 0 };
}

function parseJson<T>(text: string | undefined, fallback: T): T {
  if (!text) return fallback;
  try { return JSON.parse(text) as T; } catch { return fallback; }
}

export async function loadKnowledgeBase(token: string) {
  const [factsFile, ontologyFile, translationsFile] = await Promise.all([
    readCvRepoFile(KNOWLEDGE_FILES.facts, token),
    readCvRepoFile(KNOWLEDGE_FILES.ontology, token),
    readCvRepoFile(KNOWLEDGE_FILES.translations, token),
  ]);
  const factPayload = parseJson<KnowledgeFact[] | { facts?: KnowledgeFact[] }>(factsFile?.text, []);
  const facts = Array.isArray(factPayload) ? factPayload : factPayload.facts ?? [];
  const ontology = parseJson<Record<string, unknown>>(ontologyFile?.text, {});
  const translations = parseJson<Record<string, unknown>>(translationsFile?.text, {});
  return { facts, ontology, translations, files: { facts: factsFile, ontology: ontologyFile, translations: translationsFile } };
}

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/[–—_/]/g, " ").replace(/[^a-z0-9\u4e00-\u9fff+.# -]+/g, " ").replace(/\s+/g, " ").trim();
}

function terms(value: string) {
  return new Set(normalize(value).split(" ").filter((item) => item.length >= 2));
}

function projectName(fact: KnowledgeFact) {
  return typeof fact.project === "string" ? fact.project : fact.project?.name || "未命名项目";
}

function overlapScore(query: Set<string>, values: string[] | undefined, weight: number) {
  if (!values?.length) return { score: 0, matches: [] as string[] };
  let score = 0;
  const matches: string[] = [];
  for (const value of values) {
    const valueTerms = terms(value);
    const overlap = [...valueTerms].filter((item) => query.has(item)).length;
    if (overlap > 0) {
      score += weight * Math.min(2, overlap);
      matches.push(value);
    }
  }
  return { score, matches };
}

export function retrieveKnowledgeFacts(facts: KnowledgeFact[], jd: string, track: string) {
  const query = terms(jd);
  return facts.map((fact) => {
    let score = 0;
    const matched: string[] = [];
    const layers: Array<[string, string[] | undefined, number]> = [
      ["exact_method", fact.exact_methods, 5],
      ["statistical_concept", fact.statistical_concepts, 4],
      ["problem_solved", fact.problems_solved, 4],
      ["transferable_capability", fact.transferable_capabilities, 3],
      ["domain", fact.domains, 2],
      ["industry_translation", fact.industry_translation?.[track], 3],
      ["verified_fact", fact.verified_fact ? [fact.verified_fact] : [], 1],
    ];
    for (const [layer, values, weight] of layers) {
      const result = overlapScore(query, values, weight);
      score += result.score;
      matched.push(...result.matches.map((item) => `${layer}: ${item}`));
    }
    const strength = normalize(fact.evidence_strength || "");
    if (strength === "high") score *= 1.12;
    else if (strength === "low") score *= 0.75;
    return {
      factId: fact.fact_id || "",
      project: projectName(fact),
      verifiedFact: fact.verified_fact || "",
      score: Math.round(score * 100) / 100,
      matched: matched.slice(0, 8),
      evidenceStrength: fact.evidence_strength || "unknown",
      prohibitedOverclaims: fact.prohibited_overclaims || [],
      translation: fact.industry_translation?.[track] || [],
    };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 15);
}
