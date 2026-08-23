import assert from "node:assert/strict";
import test, { after } from "node:test";

import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const { scoreStoredJob } = await vite.ssrLoadModule("/app/lib/job-scoring.ts");

after(async () => {
  await vite.close();
});

test("saved jobs are rescored from their JD instead of inheriting a five-star application score", () => {
  const statisticalRole = scoreStoredJob({
    title: "数据科学家",
    region: "中国",
    content: "统计学博士，负责统计建模、因果推断和机器学习，使用 Python 与 R 完成数据分析。",
  });
  const engineeringRole = scoreStoredJob({
    title: "Agentic Coding 算法研究员",
    region: "中国",
    content: "负责大语言模型、LLM、强化学习、分布式训练、模型服务和软件工程系统研发。",
  });

  assert.ok(statisticalRole.score < 100);
  assert.ok(engineeringRole.score < 100);
  assert.notEqual(statisticalRole.score, engineeringRole.score);
  assert.ok(statisticalRole.score > engineeringRole.score);
});
