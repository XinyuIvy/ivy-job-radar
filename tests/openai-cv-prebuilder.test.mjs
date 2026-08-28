import assert from "node:assert/strict";
import test, { after } from "node:test";

import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const {
  compactCvBundleFilesForAgent,
  citedOpenAiContainerFiles,
  FALLBACK_CV_MAX_OUTPUT_TOKENS,
  MAX_CV_AGENT_INPUT_CHARS,
  MAX_CV_FALLBACK_INPUT_CHARS,
  openAiContainerId,
  openAiOutputText,
  openAiUsage,
  orderedCvBundleFiles,
} = await vite.ssrLoadModule("/app/lib/openai-cv-prebuilder.ts");

after(async () => {
  await vite.close();
});

test("fallback CV runs have enough output budget for shell compilation", () => {
  assert.equal(FALLBACK_CV_MAX_OUTPUT_TOKENS, 32_000);
});

test("static CV authorities precede job-specific files for cache reuse", () => {
  const ordered = orderedCvBundleFiles([
    { filename: "jd_snapshot.md", text: "jd" },
    { filename: "cv_base.tex", text: "template" },
    { filename: "canonical_current_addendum.jsonl", text: "current amendment" },
    { filename: "fact_master_snapshot.md", text: "facts" },
    { filename: "job_record.yaml", text: "job" },
  ]);
  assert.deepEqual(ordered.map((file) => file.filename), [
    "fact_master_snapshot.md",
    "canonical_current_addendum.jsonl",
    "cv_base.tex",
    "job_record.yaml",
    "jd_snapshot.md",
  ]);
});

test("response helpers recover chat text, container files, and token usage", () => {
  const response = {
    output: [{
      container_id: "cntr_123",
      content: [{
        text: "Draft ready",
        annotations: [{
          file_id: "file_pdf",
          container_id: "cntr_123",
          filename: "cv_draft.pdf",
        }],
      }],
    }],
    usage: {
      input_tokens: 100,
      output_tokens: 40,
      input_tokens_details: { cached_tokens: 80 },
    },
  };
  assert.equal(openAiOutputText(response), "Draft ready");
  assert.equal(openAiContainerId(response), "cntr_123");
  assert.deepEqual(citedOpenAiContainerFiles(response), [{
    id: "file_pdf",
    containerId: "cntr_123",
    filename: "cv_draft.pdf",
  }]);
  assert.deepEqual(openAiUsage(response), {
    inputTokens: 100,
    cachedInputTokens: 80,
    outputTokens: 40,
  });
});

test("initial agent context keeps fixed authorities and selects JD-relevant evidence", () => {
  const relevantFact = "# Agentic analytics\nBuilt production agentic analytics and machine learning systems.\n";
  const unrelatedFact = "# Unrelated operations\nManaged unrelated inventory operations.\n";
  const relevantIndex = JSON.stringify({ id: "ml", text: "agentic machine learning analytics" }) + "\n";
  const unrelatedIndex = JSON.stringify({ id: "other", text: "unrelated inventory operations" }) + "\n";
  const files = [
    { filename: "jd_snapshot.md", text: "Complete JD requires agentic machine learning and analytics." },
    { filename: "cv_base.tex", text: "COMPLETE TEMPLATE" },
    { filename: "job_record.yaml", text: "job_id: 42" },
    { filename: "prebuild_prompt.txt", text: "Complete prompt" },
    {
      filename: "fact_master_snapshot.md",
      text: relevantFact.repeat(2_000) + unrelatedFact.repeat(8_000),
    },
    ...[
      "canonical_project_index.jsonl",
      "canonical_fact_index.jsonl",
      "canonical_capability_index.jsonl",
      "canonical_concept_index.jsonl",
      "canonical_relation_index.jsonl",
      "canonical_retrieval_index.jsonl",
      "canonical_current_addendum.jsonl",
    ].map((filename) => ({
      filename,
      text: relevantIndex.repeat(100) + unrelatedIndex.repeat(8_000),
    })),
  ];

  const compacted = compactCvBundleFilesForAgent(files);
  const byName = new Map(compacted.map((file) => [file.filename, file.text]));
  const totalChars = compacted.reduce((total, file) => total + file.text.length, 0);
  assert.ok(totalChars <= MAX_CV_AGENT_INPUT_CHARS + 2_000);
  assert.equal(byName.get("jd_snapshot.md"), files[0].text);
  assert.equal(byName.get("cv_base.tex"), "COMPLETE TEMPLATE");
  assert.match(byName.get("fact_master_snapshot.md"), /Agentic analytics/);
  assert.match(byName.get("canonical_fact_index.jsonl"), /agentic machine learning analytics/);
  assert.match(byName.get("canonical_current_addendum.jsonl"), /agentic machine learning analytics/);
  assert.match(byName.get("agent_context_manifest.md"), /private archive retains every complete frozen source file/i);
  assert.match(byName.get("agent_context_manifest.md"), /canonical_current_addendum\.jsonl/);
  assert.ok(byName.get("fact_master_snapshot.md").length < files[4].text.length);
  assert.ok(byName.get("canonical_current_addendum.jsonl").length < files.at(-1).text.length);

  const fallback = compactCvBundleFilesForAgent(files, MAX_CV_FALLBACK_INPUT_CHARS);
  const fallbackChars = fallback.reduce((total, file) => total + file.text.length, 0);
  assert.ok(fallbackChars <= MAX_CV_FALLBACK_INPUT_CHARS + 2_000);
});