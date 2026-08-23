import assert from "node:assert/strict";
import test, { after } from "node:test";

import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const { extractCoreJobDescription } = await vite.ssrLoadModule("/app/lib/job-description.ts");

after(async () => {
  await vite.close();
});

test("keeps the core English JD and removes page chrome and compliance footer", () => {
  const result = extractCoreJobDescription(`
    Careers\nSearch Jobs\nSign In\nData Scientist\nBoston, MA\nApply Now
    Job Description
    About the role
    Build statistical models for clinical and product decisions.
    Responsibilities
    Partner with scientists and deploy reproducible analyses.
    Qualifications
    PhD in statistics or a related field. Python and R required.
    Benefits
    Health insurance and retirement plan.
    We are an equal opportunity employer.
    Applicant Privacy Notice\nSimilar Jobs\nMarketing Analyst
  `);

  assert.equal(result.method, "section-markers");
  assert.match(result.text, /^Job Description/);
  assert.match(result.text, /Qualifications/);
  assert.match(result.text, /Benefits/);
  assert.doesNotMatch(result.text, /Search Jobs|equal opportunity|Similar Jobs/i);
});

test("extracts a Chinese JD from a single-line campus portal page", () => {
  const result = extractCoreJobDescription(
    "快手校园招聘 首页 招聘动态 薪酬福利 职位描述 数据科学家 岗位职责 负责实验设计与统计建模，支持业务决策。 任职要求 统计学博士，熟悉 Python、R 和因果推断。 推荐职位 算法工程师 用户协议 隐私政策",
  );

  assert.match(result.text, /^职位描述/);
  assert.match(result.text, /岗位职责/);
  assert.match(result.text, /任职要求/);
  assert.doesNotMatch(result.text, /首页|薪酬福利|推荐职位|用户协议/);
});

test("preserves a clean structured description without a section title", () => {
  const clean = "Build and validate statistical models for clinical studies. Partner with cross-functional teams. PhD in Biostatistics required.";
  const result = extractCoreJobDescription(clean);
  assert.equal(result.method, "unchanged");
  assert.equal(result.text, clean);
});
