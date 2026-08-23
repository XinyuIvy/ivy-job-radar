import assert from "node:assert/strict";
import test, { after } from "node:test";

import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const { isBaiduTalentJobUrl, parseBaiduTalentJobHtml } = await vite.ssrLoadModule("/app/lib/baidu-job-page.ts");

after(async () => {
  await vite.close();
});

test("parses Baidu's server-rendered graduate job page", () => {
  const html = `
    <div class="detail-title__abc"><span>2027AIDU-Agent应用全栈工程师(J99974)</span></div>
    <span class="post-subtitle-item__xyz">北京市</span>
    <span class="post-subtitle-item__xyz">AIDU项目</span>
    <div class="post-content-title__one">工作职责：</div>
    <div class="post-content-desc__two">1. 构建 Autonomous Agent 系统；<br/>2. 设计 Planning—Acting—Reflection 闭环并提升自主决策能力。</div>
    <div class="post-content-title__one">职责要求：</div>
    <div class="post-content-desc__two">深度使用过大模型，做过 AI Agent 项目，使用过 LangChain，并对复杂任务自动化有强烈兴趣。</div>
  `;
  assert.deepEqual(parseBaiduTalentJobHtml(html), {
    title: "2027AIDU-Agent应用全栈工程师(J99974)",
    company: "百度",
    location: "北京市",
    description: "工作职责：\n1. 构建 Autonomous Agent 系统；\n2. 设计 Planning—Acting—Reflection 闭环并提升自主决策能力。\n\n职责要求：\n深度使用过大模型，做过 AI Agent 项目，使用过 LangChain，并对复杂任务自动化有强烈兴趣。",
    applicationId: "J99974",
  });
  assert.equal(isBaiduTalentJobUrl("https://talent.baidu.com/jobs/detail/GRADUATE/abc"), true);
  assert.equal(isBaiduTalentJobUrl("https://example.com/jobs/abc"), false);
});
