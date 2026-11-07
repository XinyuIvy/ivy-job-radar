import { generateGroundedAnswer, type RagResult, type RetrievedFact } from "./evidence-rag";
import { tokenize, type FactIndexRecord } from "./hybrid-rag";
import type { CvPrebuildArtifactBucket } from "./cv-prebuild-artifacts";

const EMBEDDING_MODEL = "@cf/qwen/qwen3-embedding-0.6b";
const RERANKER_MODEL = "@cf/baai/bge-reranker-base";
const BATCH_SIZE = 16;

export type ModelRagConfig = {
  accountId: string;
  token: string;
  deepseekKey: string;
  generatorModel: string;
  bucket: CvPrebuildArtifactBucket;
};

function eligibleFacts(facts: FactIndexRecord[]) {
  return facts.filter((fact) => fact.fact_id && fact.verified_fact && fact.cv_eligible && fact.fact_status !== "project_context");
}

function factText(fact: FactIndexRecord) {
  return (fact.retrieval_text || fact.verified_fact).slice(0, 6000);
}

async function runAi(config: ModelRagConfig, model: string, payload: unknown) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/ai/run/${model}`, {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`WORKERS_AI_HTTP_${response.status}`);
  const envelope = await response.json() as { success?: boolean; result?: unknown; errors?: unknown };
  if (envelope.success === false || !envelope.result) throw new Error("WORKERS_AI_INVALID_RESPONSE");
  return envelope.result;
}

function vectorsFrom(result: unknown, count: number): number[][] {
  const data = (result as { data?: unknown })?.data;
  if (!Array.isArray(data) || data.length !== count || !data.every((vector) => Array.isArray(vector) && vector.length === 1024 && vector.every((n: unknown) => typeof n === "number" && Number.isFinite(n)))) {
    throw new Error("EMBEDDING_INVALID_RESPONSE");
  }
  return data as number[][];
}

function normalizedDot(left: number[], right: number[]) {
  let product = 0, leftNorm = 0, rightNorm = 0;
  for (let i = 0; i < left.length; i += 1) {
    product += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }
  return product / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm) || 1);
}

async function fingerprint(facts: FactIndexRecord[]) {
  const encoded = new TextEncoder().encode(JSON.stringify([EMBEDDING_MODEL, facts.map((fact) => [fact.fact_id, factText(fact)])]));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function indexedVectors(facts: FactIndexRecord[], config: ModelRagConfig) {
  const hash = await fingerprint(facts);
  const vectors: number[][] = [];
  for (let offset = 0; offset < facts.length; offset += BATCH_SIZE) {
    const batch = facts.slice(offset, offset + BATCH_SIZE);
    const key = `evidence-rag/${hash}/qwen3-embedding-0.6b/${offset}.json`;
    const stored = await config.bucket.get(key);
    let batchVectors: number[][] | null = null;
    if (stored) {
      try { batchVectors = vectorsFrom({ data: JSON.parse(await stored.text()) }, batch.length); } catch { batchVectors = null; }
    }
    if (!batchVectors) {
      batchVectors = vectorsFrom(await runAi(config, EMBEDDING_MODEL, { text: batch.map(factText) }), batch.length);
      await config.bucket.put(key, JSON.stringify(batchVectors), { httpMetadata: { contentType: "application/json" } });
    }
    vectors.push(...batchVectors);
  }
  return vectors;
}

function bm25Scores(query: string, facts: FactIndexRecord[]) {
  const terms = [...new Set(tokenize(query.replace(/[-–]/g, " ")))];
  const docs = facts.map((fact) => tokenize(`${factText(fact)} ${(fact.exact_methods_tools || []).join(" ")}`.replace(/[-–]/g, " ")));
  const average = docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(1, docs.length);
  const frequencies = new Map<string, number>();
  for (const doc of docs) for (const term of new Set(doc)) frequencies.set(term, (frequencies.get(term) || 0) + 1);
  return docs.map((doc) => {
    const counts = new Map<string, number>();
    for (const term of doc) counts.set(term, (counts.get(term) || 0) + 1);
    return terms.reduce((score, term) => {
      const tf = counts.get(term) || 0;
      if (!tf) return score;
      const df = frequencies.get(term) || 0;
      return score + Math.log(1 + (facts.length - df + 0.5) / (df + 0.5)) * tf * 2.5 / (tf + 1.5 * (0.25 + 0.75 * doc.length / Math.max(1, average)));
    }, 0);
  });
}

export async function answerWithModelRag(query: string, allFacts: FactIndexRecord[], config: ModelRagConfig): Promise<RagResult> {
  const facts = eligibleFacts(allFacts);
  const emptyDiagnostics = { retrieved: 0, reranked: 0, retrieval: "BM25 + Qwen3-Embedding-0.6B (RRF)", reranker: "BGE-reranker-base", generator: config.generatorModel, retrievedFactIds: [], rerankedFactIds: [] };
  if (!facts.length) return { answer: "事实索引中没有找到可引用的相关经历。", citations: [], diagnostics: emptyDiagnostics };

  const [vectors, queryVectors] = await Promise.all([
    indexedVectors(facts, config),
    runAi(config, EMBEDDING_MODEL, { text: [query] }).then((result) => vectorsFrom(result, 1)),
  ]);
  const similarities = vectors.map((vector) => normalizedDot(queryVectors[0], vector));
  const bm25 = bm25Scores(query, facts);
  const lexical = facts.map((_, i) => i).filter((i) => bm25[i] > 0).sort((a, b) => bm25[b] - bm25[a]).slice(0, 20);
  const semantic = facts.map((_, i) => i).sort((a, b) => similarities[b] - similarities[a]).slice(0, 20);
  const candidates = new Map<number, RetrievedFact>();
  for (const [channel, list] of [["bm25", lexical], ["qwen3_embedding", semantic]] as const) {
    list.forEach((index, rank) => {
      const prior = candidates.get(index);
      candidates.set(index, {
        fact: facts[index], bm25: bm25[index], vectorSimilarity: similarities[index],
        retrievalChannels: [...(prior?.retrievalChannels || []), channel],
        rankScore: (prior?.rankScore || 0) + 1 / (60 + rank + 1),
      });
    });
  }
  const retrieved = [...candidates.values()].sort((a, b) => b.rankScore - a.rankScore).slice(0, 20);
  if (!retrieved.length) return { answer: "事实索引中没有找到可引用的相关经历。", citations: [], diagnostics: emptyDiagnostics };
  const result = await runAi(config, RERANKER_MODEL, {
    query,
    contexts: retrieved.map(({ fact }) => ({ text: `${fact.verified_fact}\nStatus: ${fact.fact_status}; Attribution: ${fact.personal_attribution}; Boundary: ${fact.claim_boundary}`.slice(0, 6000) })),
    top_k: retrieved.length,
  }) as { response?: Array<{ id?: number; index?: number; score?: number }> };
  if (!Array.isArray(result.response)) throw new Error("RERANKER_INVALID_RESPONSE");
  const seen = new Set<number>();
  const selected = result.response.filter((row) => {
    const index = Number.isInteger(row.id) ? row.id! : row.index;
    if (!Number.isInteger(index) || index! < 0 || index! >= retrieved.length || !Number.isFinite(row.score) || seen.has(index!)) return false;
    seen.add(index!);
    return true;
  }).sort((a, b) => b.score! - a.score!).slice(0, 5).map((row) => retrieved[(Number.isInteger(row.id) ? row.id : row.index)!]);
  if (!selected.length) throw new Error("RERANKER_INVALID_RESPONSE");
  return generateGroundedAnswer(query, selected, retrieved.map((item) => item.fact.fact_id), config.deepseekKey, config.generatorModel);
}
