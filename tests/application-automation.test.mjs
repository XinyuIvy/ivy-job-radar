import assert from "node:assert/strict";
import test, { after } from "node:test";

import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const {
  defaultAutomationConfig,
  detectAutomationAts,
  evaluateAutomationCandidate,
  maximumRequiredExperience,
} = await vite.ssrLoadModule("/app/lib/application-automation.ts");

after(async () => {
  await vite.close();
});

const baseJob = {
  id: 1,
  company: "Example Health",
  title: "Applied Scientist, Healthcare AI",
  region: "美国",
  location: "Boston, MA",
  track: "Healthcare AI",
  score: 88,
  visa: "JD 未明确",
  description: `We are hiring an Applied Scientist to build and validate machine learning methods for clinical data.
Candidates should have a PhD in statistics, biostatistics, computer science, or a related field. Zero to two years of industry experience is welcome. The role partners with clinicians and engineers to evaluate models, design experiments, and communicate results. Experience with Python, R, statistical inference, and healthcare data is preferred. This is a full-time role in Boston.`,
  jobUrl: "https://boards.greenhouse.io/example/jobs/123",
  status: "开放",
  discoveredAt: "2026-08-26T10:00:00.000Z",
};

test("high-confidence target roles pass deterministic hard filters", () => {
  const result = evaluateAutomationCandidate(baseJob, defaultAutomationConfig());
  assert.equal(result.eligible, true);
  assert.equal(result.atsProvider, "greenhouse");
  assert.equal(result.templateTrack, "clinical_neuro");
  assert.deepEqual(result.blockers, []);
});

test("sponsorship, citizenship, seniority, and experience requirements block automation", () => {
  const result = evaluateAutomationCandidate({
    ...baseJob,
    title: "Senior Applied Scientist",
    description: `${baseJob.description} Applicants must be U.S. citizens, hold an active security clearance, and have at least 6 years of experience. Visa sponsorship will not be provided.`,
  }, defaultAutomationConfig());
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.some((value) => value.includes("6 年")));
  assert.ok(result.blockers.some((value) => value.includes("sponsorship")));
  assert.ok(result.blockers.some((value) => value.includes("公民身份")));
  assert.ok(result.blockers.some((value) => value.includes("排除")));
});

test("ATS detection and experience extraction stay conservative", () => {
  assert.equal(detectAutomationAts("https://jobs.lever.co/example/abc"), "lever");
  assert.equal(detectAutomationAts("https://example.wd5.myworkdayjobs.com/job/1"), "workday");
  assert.equal(maximumRequiredExperience("Minimum 2 years of relevant experience."), 2);
  assert.equal(maximumRequiredExperience("Requires 5+ years experience."), 5);
});

test("automation rejects ambiguous titles and unsupported ATS pages before CV generation", () => {
  const ambiguous = evaluateAutomationCandidate({
    ...baseJob,
    title: "Campus Recruitment",
    jobUrl: "https://careers.example.com/campus/position/123",
  }, defaultAutomationConfig());
  assert.equal(ambiguous.eligible, false);
  assert.ok(ambiguous.blockers.some((value) => value.includes("岗位标题")));
  assert.ok(ambiguous.blockers.some((value) => value.includes("申请系统")));
});
