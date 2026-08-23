import assert from "node:assert/strict";
import test, { after } from "node:test";

import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const {
  buildCvPrebuildBundleFiles,
  createCvPrebuildIdentity,
  recommendCvPrebuildTemplate,
} = await vite.ssrLoadModule("/app/lib/cv-prebuild-bundle.ts");

after(async () => {
  await vite.close();
});

const job = {
  id: 42,
  company: "Example Health",
  title: "Clinical Data Scientist",
  region: "中国",
  location: "上海",
  track: "Healthcare AI",
  jobUrl: "https://example.com/jobs/42",
  canonicalUrl: "https://example.com/jobs/42",
  applicationId: "REQ-42",
  source: "公司官网",
};

test("temporary template selection follows region and job track", () => {
  assert.deepEqual({ ...recommendCvPrebuildTemplate(job) }, {
    language: "zh",
    track: "pharma",
    templateFile: "cv_pharma_cn.tex",
    templatePath: "master/template-cv/cv_pharma_cn.tex",
  });
  assert.equal(
    recommendCvPrebuildTemplate({ ...job, region: "美国", track: "Quant" }).templateFile,
    "cv_quant.tex",
  );
  assert.equal(
    recommendCvPrebuildTemplate({ ...job, region: "美国", track: "Medical Device" }).templateFile,
    "cv_pharma.tex",
  );
});

test("generation key is stable and changes with every frozen authority", async () => {
  const base = {
    job,
    jd: "Complete JD",
    cvCommit: "1".repeat(40),
    factMasterSha: "2".repeat(40),
    promptVersion: "cv-prebuilder-v1",
    date: new Date("2026-08-22T12:00:00Z"),
  };
  const first = await createCvPrebuildIdentity(base);
  const duplicate = await createCvPrebuildIdentity(base);
  assert.equal(first.generationKey, duplicate.generationKey);
  assert.match(first.prebuildId, /^PRECV-2026-JOB-42-[A-F0-9]{8}$/);

  for (const changed of [
    { ...base, jd: "Changed JD" },
    { ...base, cvCommit: "3".repeat(40) },
    { ...base, factMasterSha: "4".repeat(40) },
    { ...base, promptVersion: "cv-prebuilder-v2" },
  ]) {
    assert.notEqual((await createCvPrebuildIdentity(changed)).generationKey, first.generationKey);
  }
});

test("PRECV bundle freezes only temporary inputs and never creates APP artifacts", async () => {
  const identity = await createCvPrebuildIdentity({
    job,
    jd: "Complete JD",
    cvCommit: "1".repeat(40),
    factMasterSha: "2".repeat(40),
    date: new Date("2026-08-22T12:00:00Z"),
  });
  const sourceNames = [
    "fact_master_snapshot.md",
    "cv_display_rules_snapshot.yaml",
    "canonical_project_index.jsonl",
    "canonical_fact_index.jsonl",
    "canonical_capability_index.jsonl",
    "canonical_concept_index.jsonl",
    "canonical_relation_index.jsonl",
    "canonical_retrieval_index.jsonl",
    "cv_base.tex",
  ];
  const sources = Object.fromEntries(sourceNames.map((name) => [name, { text: `${name} content`, sha: `${name}-sha` }]));
  const files = buildCvPrebuildBundleFiles({
    job,
    identity,
    jd: "Complete JD",
    capturedAt: "2026-08-22T12:00:00.000Z",
    sources,
  });
  const filenames = Object.keys(files).map((path) => path.split("/").at(-1));
  assert.deepEqual(filenames.sort(), [
    ...sourceNames,
    "job_record.yaml",
    "jd_snapshot.md",
    "prebuild_prompt.txt",
  ].sort());
  assert.equal(filenames.some((name) => name.startsWith("application_record")), false);
  assert.equal(filenames.some((name) => name.startsWith("cv_customized_")), false);
  assert.equal(filenames.some((name) => name.startsWith("cv_submitted_")), false);

  const record = files[`${identity.bundlePath}/job_record.yaml`];
  const prompt = files[`${identity.bundlePath}/prebuild_prompt.txt`];
  assert.match(record, /application_id: null/);
  assert.match(record, /application_row_id: null/);
  assert.match(record, new RegExp(`cv_commit: "${identity.cvCommit}"`));
  assert.match(prompt, /LuaLaTeX/);
  assert.match(prompt, /以第一作者身份在九个学术会议作报告/);
  assert.match(prompt, /禁止创建 application\/APP ID/);
});
