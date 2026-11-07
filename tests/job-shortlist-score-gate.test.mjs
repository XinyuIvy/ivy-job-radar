import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
const {
  evaluateTodayShortlistCandidate: evaluate,
  isSpreadsheetApprovedCandidate: isSpreadsheetApproved,
} = await vite.ssrLoadModule("/app/lib/job-shortlist.ts");
after(() => vite.close());
const job = {
  title: "Data Scientist", region: "美国", status: "开放", score: 0,
  description: "Responsibilities include statistical research and data analysis. Qualifications include statistics and Python. ".repeat(3),
};
test("score never determines shortlist admission, including zero and the former boundary", () => {
  for (const score of [0, 1, 54, 55, 100]) {
    const result = evaluate({ ...job, score });
    assert.equal(result.eligible, true, JSON.stringify(result.blockers));
    assert.equal(result.fitScore, score);
    assert.deepEqual(result.blockers, []);
  }
});

test("verified RWE and medical affairs campus titles pass the target-title gate", () => {
  for (const title of ["HE/RWI Consultant/Analyst", "RWD&T Analyst", "RWE/RWA Analyst", "Medical Affairs Solutions Analyst"]) {
    const result = evaluate({ ...job, title, region: "中国" });
    assert.equal(result.eligible, true, `${title}: ${JSON.stringify(result.blockers)}`);
  }
});
test("removing score gate preserves hard exclusions, status and complete-JD checks", () => {
  for (const changes of [
    { status: "待官网核验" }, { description: "short" },
    { title: "Senior Data Scientist" }, { title: "Accountant" },
    { description: job.description + " Requires 5 years of experience." },
    { description: job.description + " No visa sponsorship." },
  ]) {
    for (const score of [0, 100]) {
      assert.equal(evaluate({ ...job, ...changes, score }).eligible, false);
    }
  }
});

test("spreadsheet-approved jobs bypass the strict shortlist gate while open", () => {
  assert.equal(isSpreadsheetApproved({
    title: "RWD&T Analyst",
    region: "中国",
    score: 20,
    description: "",
    source: "官网ATS · Excel同步",
    evidence: "官网当前可投；Excel结论：条件型可投",
    status: "开放",
  }), true);
});

test("spreadsheet-approved jobs do not bypass the gate after closing", () => {
  assert.equal(isSpreadsheetApproved({
    title: "RWD&T Analyst",
    region: "中国",
    score: 20,
    description: "",
    source: "官网ATS · Excel同步",
    evidence: "官网当前可投；Excel结论：直接可投",
    status: "已过期",
  }), false);
});
