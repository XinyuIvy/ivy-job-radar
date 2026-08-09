import assert from "node:assert/strict";
import test from "node:test";

import { runHybridRag } from "../app/lib/hybrid-rag.ts";

const noTranslation = {
  translation_type: "no_evidence",
  valid_transferable_interpretation: [],
  invalid_overclaim: [],
};

function fact(overrides = {}) {
  return {
    fact_id: "F-001",
    project_id: "project",
    project_name: "Verified Project",
    project_type: "research",
    role: "lead researcher",
    verified_fact: "Implemented a verified analytical workflow.",
    fact_status: "completed",
    personal_attribution: "explicit_primary_evidence",
    evidence_strength: "high",
    source_tier: "primary",
    source: "repository",
    evidence_location: "README",
    exact_methods_tools: [],
    statistical_analytical_concepts: [],
    problem_solved: "Evaluate analytical model performance.",
    transferable_capabilities: [],
    industry_translation: { pharma: noTranslation, tech: noTranslation, quant: noTranslation, consulting: noTranslation },
    prohibited_overclaims: [],
    concept_nodes: [],
    claim_boundary: "Use only the verified wording.",
    cv_eligible: true,
    retrieval_text: "Implemented a verified analytical workflow to evaluate model performance.",
    ...overrides,
  };
}

function rule(label, aliases, category = "Methods") {
  return { label, aliases, category };
}

test("exact named method can produce Direct evidence", () => {
  const result = runHybridRag(
    "Experience with Monte Carlo simulation is required.",
    "pharma",
    [rule("Monte Carlo simulation", ["monte carlo simulation", "monte carlo"])],
    [fact({ exact_methods_tools: ["Monte Carlo simulation"], retrieval_text: "Implemented Monte Carlo simulation for trial design." })],
    [],
  );
  assert.equal(result.matches[0].classification, "Direct");
  assert.ok(result.matches[0].candidates[0].retrievalChannels.includes("exact"));
});

test("an adjacent concept path never becomes Bayesian experience", () => {
  const result = runHybridRag(
    "Bayesian methods are required.",
    "pharma",
    [rule("Bayesian methods", ["bayesian"])],
    [fact({ fact_id: "MIXED-001", exact_methods_tools: ["linear mixed-effects model"], retrieval_text: "Implemented a linear mixed-effects model." })],
    [{
      edge_id: "bayesian-to-mixed",
      family_id: "modeling",
      from: "bayesian_methods",
      to: "mixed_effects_models",
      type: "adjacent_concept",
      retrieval_weight: 0.4,
      claim_strength: "adjacent_only",
      evidence: ["MIXED-001"],
      guardrail: "Do not claim Bayesian experience.",
      attribution: "",
    }],
  );
  assert.equal(result.matches[0].classification, "Adjacent");
  assert.equal(result.matches[0].recommendedForCv, false);
});

test("project-level facts cannot support personal CV bullets", () => {
  const result = runHybridRag(
    "Bayesian modeling experience.",
    "quant",
    [rule("Bayesian modeling", ["bayesian modeling", "bayesian"])],
    [fact({
      exact_methods_tools: ["Bayesian modeling"],
      personal_attribution: "project_level_only",
      cv_eligible: false,
      retrieval_text: "The project used Bayesian modeling.",
    })],
    [],
  );
  assert.equal(result.matches[0].classification, "No Evidence");
  assert.equal(result.matches[0].recommendedForCv, false);
});

test("planned and in-progress facts preserve readiness limits", () => {
  const planned = runHybridRag(
    "Experience with reinforcement learning.",
    "tech",
    [rule("Reinforcement learning", ["reinforcement learning"])],
    [fact({ fact_status: "planned", exact_methods_tools: ["reinforcement learning"], retrieval_text: "Planned reinforcement learning experiments." })],
    [],
  );
  assert.equal(planned.matches[0].classification, "Adjacent");

  const inProgress = runHybridRag(
    "Experience with reinforcement learning.",
    "tech",
    [rule("Reinforcement learning", ["reinforcement learning"])],
    [fact({ fact_status: "in_progress", exact_methods_tools: ["reinforcement learning"], retrieval_text: "Implementing reinforcement learning experiments." })],
    [],
  );
  assert.equal(inProgress.matches[0].classification, "Strong Transferable");
});

test("production scope cannot be inferred from a research prototype", () => {
  const result = runHybridRag(
    "Production deployment experience is required.",
    "tech",
    [rule("Production deployment", ["production deployment", "deployment"], "Engineering")],
    [fact({ fact_id: "PROTO-001", verified_fact: "Built a research software prototype.", retrieval_text: "Built a research software prototype." })],
    [{
      edge_id: "deployment-to-prototype",
      family_id: "software",
      from: "production_deployment",
      to: "research_software_prototype",
      type: "adjacent_concept",
      retrieval_weight: 0.35,
      claim_strength: "adjacent_only",
      evidence: ["PROTO-001"],
      guardrail: "A research prototype is not production deployment.",
      attribution: "",
    }],
  );
  assert.notEqual(result.matches[0].classification, "Direct");
  assert.equal(result.matches[0].recommendedForCv, false);
});

test("diagnostics expose BM25 and the deterministic dense backend", () => {
  const result = runHybridRag("Python", "tech", [rule("Python", ["python"], "Programming and Data")], [fact({ exact_methods_tools: ["Python"], retrieval_text: "Python analytics." })], []);
  assert.deepEqual(result.diagnostics.bm25Parameters, { k1: 1.5, b: 0.75 });
  assert.equal(result.diagnostics.embeddingBackend, "local_subword_hash_v1");
  assert.equal(result.diagnostics.embeddingDimensions, 384);
});
