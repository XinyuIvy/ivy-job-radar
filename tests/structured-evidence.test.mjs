import assert from "node:assert/strict";
import test from "node:test";

import { runHybridRag } from "../app/lib/hybrid-rag.ts";
import { matchStructuredEvidence } from "../app/lib/structured-evidence.ts";

const translation = { translation_type: "no_evidence", valid_transferable_interpretation: [], invalid_overclaim: [] };
const placeholderFact = {
  record_type: "project_fact",
  fact_id: "P-001",
  project_id: "project",
  project_name: "Project",
  project_type: "research",
  role: "researcher",
  verified_fact: "Verified research work.",
  fact_status: "completed",
  personal_attribution: "explicit_primary_evidence",
  evidence_strength: "high",
  source_tier: "primary",
  source: "source",
  evidence_location: "location",
  exact_methods_tools: [],
  statistical_analytical_concepts: [],
  problem_solved: "",
  transferable_capabilities: [],
  industry_translation: { pharma: translation, tech: translation, quant: translation, consulting: translation },
  prohibited_overclaims: [],
  concept_nodes: [],
  claim_boundary: "",
  cv_eligible: true,
  retrieval_text: "verified research",
};

function requirement(jd, rule) {
  return runHybridRag(jd, "tech", [rule], [placeholderFact], []).matches[0].requirement;
}

test("biostatistics degree is a structured credential direct match", () => {
  const req = requirement("PhD in Statistics, Biostatistics, or a related quantitative field.", {
    label: "Education credential",
    category: "Education",
    aliases: ["phd"],
    projectTerms: ["biostatistics", "statistics", "quantitative field"],
  });
  const result = matchStructuredEvidence(req, [{
    record_type: "education_credential",
    fact_id: "EDU-VU-PHD-BIOSTAT",
    verified_fact: "Enrolled in a doctoral Biostatistics program.",
    evidence_strength: "high",
    source_tier: "primary_record",
    source: "transcript",
    cv_eligible: true,
    match_class: "credential_direct",
    institution: "Vanderbilt University",
    degree_level: "PhD",
    degree_status: "candidate / in progress",
    field: "Biostatistics",
    retrieval_text: "PhD candidate Biostatistics Vanderbilt",
  }]);
  assert.equal(result[0].classification, "Credential Direct");
});

test("coursework remains coursework and cannot become implementation experience", () => {
  const req = requirement("Background in causal inference preferred.", {
    label: "Causal inference",
    category: "Methods",
    aliases: ["causal inference"],
  });
  const result = matchStructuredEvidence(req, [{
    record_type: "coursework",
    fact_id: "COURSE-YALE-CAUSAL",
    verified_fact: "Completed Causal Inference.",
    evidence_strength: "high",
    source_tier: "primary_record",
    source: "transcript",
    cv_eligible: true,
    match_class: "coursework_exposure",
    institution: "Yale University",
    course: "Causal Inference",
    course_status: "completed",
    normalized_concepts: ["causal_inference"],
    retrieval_text: "Causal Inference causal_inference",
  }]);
  assert.equal(result[0].classification, "Coursework Match");
  assert.match(result[0].limitation, /does not by itself establish professional implementation/i);
});

test("demonstrated skills use profile evidence directly", () => {
  const req = requirement("Python is required.", { label: "Python", category: "Programming and Data", aliases: ["python"] });
  const result = matchStructuredEvidence(req, [{
    record_type: "skill",
    fact_id: "SKILL-PYTHON",
    verified_fact: "Uses Python in software and modeling workflows.",
    evidence_strength: "high",
    source_tier: "stage3_cross_project",
    source: "Stage 3",
    cv_eligible: true,
    match_class: "demonstrated_skill",
    skill: "Python",
    retrieval_text: "Python software modeling workflows",
  }]);
  assert.equal(result[0].classification, "Direct");
});

test("literature review is direct but does not imply meta-analysis", () => {
  const record = {
    record_type: "research_literature",
    fact_id: "LIT-NPH-REVIEW-001",
    verified_fact: "First-authored a structured oncology literature review and evidence synthesis.",
    evidence_strength: "high",
    source_tier: "primary_published_paper",
    source: "accepted paper",
    cv_eligible: true,
    match_class: "systematic_review_direct",
    capability: "systematic_literature_review_and_method_comparison",
    normalized_concepts: ["systematic_review", "literature_review", "evidence_synthesis"],
    retrieval_text: "systematic review literature review evidence synthesis oncology",
  };
  const literature = requirement("Conduct a systematic review.", { label: "Literature review", category: "Research", aliases: ["systematic review"], projectTerms: ["literature review"] });
  assert.equal(matchStructuredEvidence(literature, [record])[0].classification, "Direct");
  const meta = requirement("Conduct a meta-analysis.", { label: "Meta-analysis", category: "Methods", aliases: ["meta-analysis"] });
  assert.equal(matchStructuredEvidence(meta, [record]).length, 0);
});
