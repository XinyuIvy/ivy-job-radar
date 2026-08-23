import assert from "node:assert/strict";
import test, { after } from "node:test";

import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const { resolveBookmarkCaptureFields } = await vite.ssrLoadModule("/app/lib/bookmark-capture.ts");

after(async () => {
  await vite.close();
});

test("prefers structured job fields over portal chrome", () => {
  const result = resolveBookmarkCaptureFields({
    jobUrl: "https://www.zhipin.com/job_detail/1234567890.html",
    sourcePageTitle: "数据科学家招聘 | BOSS直聘",
    titleCandidates: [
      { source: "h1", value: "职位详情" },
      { source: "boss-title", value: "高级数据科学家" },
    ],
    companyCandidates: [
      { source: "site-name", value: "BOSS直聘" },
      { source: "boss-company", value: "星河医药科技有限公司" },
    ],
  });

  assert.deepEqual(result, {
    title: "高级数据科学家",
    company: "星河医药科技有限公司",
  });
});

test("never turns a job title or recruiting platform into the company", () => {
  const result = resolveBookmarkCaptureFields({
    jobUrl: "https://www.zhipin.com/job_detail/1234567890.html",
    title: "生物统计总监",
    sourcePageTitle: "生物统计总监 | BOSS直聘",
    companyCandidates: [{ source: "site-name", value: "BOSS直聘" }],
  });

  assert.equal(result.title, "生物统计总监");
  assert.equal(result.company, "待补充公司");
});

test("prefers an exact Workday title over the mixed posting header", () => {
  const result = resolveBookmarkCaptureFields({
    jobUrl: "https://acme.wd5.myworkdayjobs.com/jobs/job/12345",
    sourcePageTitle: "Principal Statistician | Acme Careers",
    titleCandidates: [
      { source: "h1", value: "Principal Statistician Acme Boston, MA" },
      { source: "workday-title", value: "Principal Statistician" },
    ],
    companyCandidates: [{ source: "ats-company", value: "Acme" }],
  });

  assert.deepEqual(result, {
    title: "Principal Statistician",
    company: "Acme",
  });
});

test("preserves fields explicitly confirmed by the user", () => {
  const result = resolveBookmarkCaptureFields({
    jobUrl: "https://www.linkedin.com/jobs/view/1234567890",
    title: "我确认的岗位名称",
    company: "我确认的公司",
    confirmedFields: true,
    titleCandidates: [{ source: "jsonld", value: "错误的结构化标题" }],
    companyCandidates: [{ source: "jsonld", value: "错误的结构化公司" }],
  });

  assert.deepEqual(result, {
    title: "我确认的岗位名称",
    company: "我确认的公司",
  });
});

test("uses the official Xiaomi host when a bad selector repeats the job title as company", () => {
  const result = resolveBookmarkCaptureFields({
    jobUrl: "https://xiaomi.jobs.f.mioffice.cn/campus/position/7670935478141470985/detail?spread=J7NS6YR",
    sourcePageTitle: "数据科学家",
    titleCandidates: [{ source: "job-title", value: "数据科学家" }],
    companyCandidates: [{ source: "company-name", value: "数据科学家" }],
  });

  assert.deepEqual(result, { title: "数据科学家", company: "小米" });
});

test("prefers a Kuaishou role heading over campus portal SEO chrome", () => {
  const result = resolveBookmarkCaptureFields({
    jobUrl: "https://campus.kuaishou.cn/recruit/campus/e/#/campus/job-info/12727",
    sourcePageTitle: "快手校园招聘",
    titleCandidates: [
      { source: "job-title", value: "快手校园、快手校招、快手校园招聘、快手薪酬福利、快手工作环境" },
      { source: "role-heading", value: "【快Star】数据科学家" },
    ],
    companyCandidates: [{ source: "company-name", value: "Campus" }],
  });

  assert.deepEqual(result, { title: "【快Star】数据科学家", company: "快手" });
});
