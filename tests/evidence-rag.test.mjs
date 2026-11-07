import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";

const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
const { retrieveEvidence, answerLocally, generateGroundedAnswer } = await vite.ssrLoadModule("/app/lib/evidence-rag.ts");
const { answerWithModelRag } = await vite.ssrLoadModule("/app/lib/model-rag.ts");
after(async () => { await vite.close(); });

function fact(id, text, eligible = true) {
  return {
    fact_id: id, verified_fact: text, retrieval_text: text, cv_eligible: eligible,
    project_name: "Asthma simulation", project_id: "asthma", exact_methods_tools: ["negative binomial"],
    fact_status: "completed", personal_attribution: "explicit_primary_evidence", claim_boundary: "Simulation only",
    source: "Fact Master", evidence_location: "Section 2",
  };
}

test("retrieval excludes ineligible facts and retains lexical evidence", () => {
  const results = retrieveEvidence("negative binomial asthma simulation", [
    fact("F1", "I used a negative binomial model for asthma exacerbation simulation."),
    fact("F2", "I used a negative binomial model for asthma exacerbation simulation.", false),
  ]);
  assert.equal(results[0].fact.fact_id, "F1");
  assert.ok(results[0].retrievalChannels.includes("bm25"));
  assert.ok(!results.some((item) => item.fact.fact_id === "F2"));
});

test("default answer uses exact source text without sending facts to a model", () => {
  const result = answerLocally("negative binomial", [fact("F1", "I used a negative binomial model for asthma exacerbation simulation.")]);
  assert.equal(result.citations[0].excerpt, "I used a negative binomial model for asthma exacerbation simulation.");
  assert.match(result.answer, /\[F1\]/);
  assert.equal(result.diagnostics.reranker, "未使用");
});

test("Chinese method query retrieves the English method instead of unrelated models", () => {
  const results = answerLocally("我有没有做过负二项模型？", [
    fact("F1", "I used a negative-binomial-derived Gamma frailty model for asthma exacerbation simulation."),
    { ...fact("F2", "I used a generalized Gamma survival model for non-proportional hazards."), exact_methods_tools: ["negative binomial"] },
  ]);
  assert.equal(results.citations[0].factId, "F1");
  assert.ok(!results.citations.some((item) => item.factId === "F2"));
});

test("model RAG uses learned embeddings and a dedicated reranker before grounded generation", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let deepseekCalls = 0;
  const vector = Array.from({ length: 1024 }, (_, i) => i === 0 ? 1 : 0);
  const objects = new Map();
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    if (String(url).includes("qwen3-embedding")) {
      const { text } = JSON.parse(options.body);
      return { ok: true, json: async () => ({ success: true, result: { data: text.map(() => vector) } }) };
    }
    if (String(url).includes("bge-reranker")) return { ok: true, json: async () => ({ success: true, result: { response: [{ id: 0, score: 0.95 }] } }) };
    deepseekCalls += 1;
    const output = deepseekCalls % 2 === 1
      ? { supportingIds: ["INVENTED", "F1"] }
      : { answer: "I used a negative binomial model [F1]", evidence: [{ factId: "F1", excerpt: "I used a negative binomial model" }] };
    return { ok: true, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }] }) };
  };
  try {
    const config = { accountId: "test-account", token: "test-token", deepseekKey: "test-key", generatorModel: "test-model", bucket: {
      get: async (key) => objects.has(key) ? { text: async () => objects.get(key) } : null,
      put: async (key, body) => { objects.set(key, body); },
    } };
    const facts = [fact("F1", "I used a negative binomial model for asthma exacerbation simulation.")];
    const result = await answerWithModelRag("negative binomial", facts, config);
    assert.equal(result.diagnostics.reranked, 1);
    assert.deepEqual(result.diagnostics.retrievedFactIds, ["F1"]);
    assert.deepEqual(result.diagnostics.rerankedFactIds, ["F1"]);
    assert.equal(result.citations[0].factId, "F1");
    assert.equal(result.answer, "I used a negative binomial model [F1]");
    assert.equal(calls.filter((url) => url.includes("qwen3-embedding")).length, 2);
    assert.equal(calls.filter((url) => url.includes("bge-reranker")).length, 1);
    assert.equal(calls.filter((url) => url.includes("deepseek")).length, 2);
    await answerWithModelRag("negative binomial", facts, config);
    assert.equal(calls.filter((url) => url.includes("qwen3-embedding")).length, 3, "cached index only embeds query");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model RAG abstains when candidates do not prove the requested experience", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ supportingIds: [] }) } }] }) };
  };
  try {
    const item = { fact: fact("F1", "Built a rule-based job ranking system."), bm25: 1, vectorSimilarity: 0.2, rankScore: 1, retrievalChannels: ["bm25"] };
    const result = await generateGroundedAnswer("Did I fine-tune BGE?", [item], ["F1"], "test-key", "test-model");
    assert.match(result.answer, /没有足够证据/);
    assert.deepEqual(result.citations, []);
    assert.equal(calls, 1, "generation is skipped without direct support");
  } finally { globalThis.fetch = originalFetch; }
});

test("unsupported generated claims fall back to verified source text after support checking", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    const output = calls === 1
      ? { supportingIds: ["F1"] }
      : { answer: "I deployed 700 models in production. [F1]", evidence: [{ factId: "F1", excerpt: "I used a negative binomial model" }] };
    return { ok: true, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }] }) };
  };
  try {
    const item = { fact: fact("F1", "I used a negative binomial model for asthma simulation."), bm25: 1, vectorSimilarity: 0.2, rankScore: 1, retrievalChannels: ["bm25"] };
    const result = await generateGroundedAnswer("negative binomial", [item], ["F1"], "test-key", "test-model");
    assert.match(result.answer, /原文/);
    assert.ok(!result.answer.includes("700"));
    assert.equal(result.citations[0].factId, "F1");
    assert.equal(result.diagnostics.generator, "原文摘录（生成答案未过核验）");
  } finally { globalThis.fetch = originalFetch; }
});

test("citation validation keeps trailing citations and decimal values with their sentences", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    const output = calls === 1
      ? { supportingIds: ["F1"] }
      : { answer: "XGBoost achieved an AUC of 0.745. [F1]", evidence: [{ factId: "F1", excerpt: "XGBoost achieved an AUC of 0.745" }] };
    return { ok: true, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }] }) };
  };
  try {
    const item = { fact: fact("F1", "XGBoost achieved an AUC of 0.745 in temporal validation."), bm25: 1, vectorSimilarity: 0.2, rankScore: 1, retrievalChannels: ["bm25"] };
    const result = await generateGroundedAnswer("What was the AUC?", [item], ["F1"], "test-key", "test-model");
    assert.equal(result.answer, "XGBoost achieved an AUC of 0.745. [F1]");
    assert.equal(result.diagnostics.generator, "test-model");
  } finally { globalThis.fetch = originalFetch; }
});
