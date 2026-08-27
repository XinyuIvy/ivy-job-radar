import assert from "node:assert/strict";
import test, { after } from "node:test";

import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const { extractStableJobId, sameCompanyRole, sameLogicalJob } = await vite.ssrLoadModule("/app/lib/job-identity.ts");

after(async () => {
  await vite.close();
});

test("extracts Xiaomi position IDs before the detail path segment", () => {
  assert.equal(
    extractStableJobId("https://xiaomi.jobs.f.mioffice.cn/campus/position/7670891108536977710/detail?spread=J7NS6YR"),
    "xiaomi.jobs.f.mioffice.cn:path:7670891108536977710",
  );
});

test("same official posting identity ignores bad scraped company names", () => {
  assert.equal(sameLogicalJob(
    {
      company: "数据科学家",
      title: "数据科学家",
      jobUrl: "https://xiaomi.jobs.f.mioffice.cn/campus/position/7670935478141470985/detail?spread=J7NS6YR",
      applicationId: "APP-2026-1F4-0038",
    },
    {
      company: "小米",
      title: "数据科学家",
      jobUrl: "https://xiaomi.jobs.f.mioffice.cn/campus/position/7670935478141470985/detail?spread=J7NS6YR",
      applicationId: "APP-2026-1F4-0038",
    },
  ), true);
});

test("different stable requisition IDs remain separate", () => {
  assert.equal(sameLogicalJob(
    {
      company: "Datadog",
      title: "Data Scientist",
      jobUrl: "https://careers.datadoghq.com/detail/6572669/?gh_jid=6572669",
    },
    {
      company: "Datadog",
      title: "Data Scientist",
      jobUrl: "https://careers.datadoghq.com/detail/6652564/?gh_jid=6652564",
    },
  ), false);
});

test("same company and role matches application history across accents and changed requisition IDs", () => {
  assert.equal(sameCompanyRole(
    {
      company: "OURA",
      title: "Research Scientist",
      jobUrl: "https://linkedin.com/jobs/view/4445542598",
    },
    {
      company: "Ōura",
      title: "Research Scientist",
      jobUrl: "https://job-boards.greenhouse.io/oura/jobs/4239300009",
    },
  ), true);
});

test("Greenhouse host aliases and proxy links share one posting identity", () => {
  assert.equal(sameLogicalJob(
    {
      company: "Point72",
      title: "Equity Quantitative Researcher",
      jobUrl: "https://boards.greenhouse.io/point72/jobs/7297561002?gh_jid=7297561002",
    },
    {
      company: "point72",
      title: "Equity Quantitative Researcher",
      jobUrl: "https://job-boards.greenhouse.io/point72/jobs/7297561002?gh_jid=7297561002",
    },
  ), true);
  assert.equal(sameLogicalJob(
    {
      company: "Lyft",
      title: "Data Scientist",
      jobUrl: "https://app.careerpuck.com/job-board/lyft/job/8378473002?gh_jid=8378473002",
    },
    {
      company: "Lyft",
      title: "Data Scientist",
      jobUrl: "https://job-boards.greenhouse.io/lyft/jobs/8378473002?gh_jid=8378473002",
    },
  ), true);
});
