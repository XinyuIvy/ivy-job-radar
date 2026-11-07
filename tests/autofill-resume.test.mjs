import assert from "node:assert/strict";
import test, { after } from "node:test";

import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const {
  buildAutofillResumeCandidates,
  selectedTemplateTexFile,
  selectedTemplateVersion,
} = await vite.ssrLoadModule("/app/lib/autofill-resume.ts");

after(async () => {
  await vite.close();
});

test("selected template versions resolve to their matching PDF", () => {
  assert.equal(selectedTemplateTexFile("CV_Biostatistician_EN.tex"), "CV_Biostatistician_EN.tex");
  assert.equal(selectedTemplateTexFile("CV_Biostatistician_EN.tex@4ce59d902d39"), "CV_Biostatistician_EN.tex");
  assert.equal(selectedTemplateTexFile("master/template-cv/CV_Biostatistician_EN.tex"), "");
  assert.equal(selectedTemplateTexFile("Clinical Biostats"), "");
  assert.deepEqual(selectedTemplateVersion("CV_Biostatistician_EN.tex@4ce59d902d39"), {
    fileName: "CV_Biostatistician_EN.tex",
    commitRef: "4ce59d902d39",
  });
});

test("submitted PDF wins, followed by customized PDF and the pinned template fallback", () => {
  const candidates = buildAutofillResumeCandidates({
    archiveId: "APP-2026-ABC-0123",
    resumeVersion: "CV_Applied_DS_Internet_EN.tex@4ce59d902d39",
    archiveRepository: "XinyuIvy/job-application-archive",
  });
  assert.deepEqual(candidates.map((candidate) => candidate.source), ["submitted", "customized", "template"]);
  assert.equal(candidates[0].fileName, "cv_submitted_APP-2026-ABC-0123.pdf");
  assert.equal(candidates[1].fileName, "cv_customized_APP-2026-ABC-0123.pdf");
  assert.equal(candidates[2].fileName, "CV_Applied_DS_Internet_EN.pdf");
  assert.equal(candidates[2].path, "master/template-cv/CV_Applied_DS_Internet_EN.pdf");
  assert.equal(candidates[2].ref, "4ce59d902d39");
});

test("a selected template works without an APP archive id", () => {
  const candidates = buildAutofillResumeCandidates({
    archiveId: "",
    resumeVersion: "CV_通用版_中文.tex",
    archiveRepository: "XinyuIvy/job-application-archive",
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].source, "template");
  assert.equal(candidates[0].fileName, "CV_通用版_中文.pdf");
});
