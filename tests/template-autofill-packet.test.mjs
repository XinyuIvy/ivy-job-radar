import assert from "node:assert/strict";
import test, { after } from "node:test";

import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const {
  buildTemplateAutofillPacket,
  hasTemplateAutofillProjects,
} = await vite.ssrLoadModule("/app/lib/template-autofill-packet.ts");

after(async () => {
  await vite.close();
});

const latex = String.raw`
\section*{\Large 专业技能}
\noindent \textbf{编程与报告：} R；SAS；Python；SQL\\
\noindent \textbf{统计建模：} GEE；混合效应模型；生存分析

\section*{\Large 行业经历}
\noindent\textbf{辉瑞（Pfizer）} $\mid$ 统计实习生，炎症与免疫统计组 \hfill 波士顿，美国 $\mid$ 2026 年 5 月 - 8 月\par
\begin{itemize}
\item 构建临床试验模拟与复合终点评估流程。
\item 比较多种终点框架并完成样本量分析。
\end{itemize}

\section*{\Large AI Agent 应用与工作流开发}
\noindent\textbf{Job Radar：证据约束的 RAG 岗位筛选工作流} $\mid$ 项目负责人 \hfill 2026 年 7 月 - 至今\par
\begin{itemize}
\item 负责产品需求与系统设计，并实现可解释筛选。
\item 设计混合检索增强生成与人工确认流程。
\end{itemize}

\noindent\textbf{多来源距离模型} $\mid$ 第一作者 \hfill 2024 年 8 月 - 2026 年 5 月\par
\begin{itemize}
\item 构建半参数 GEE 方法。
\item 通过模拟检查第一类错误率和统计功效。
\end{itemize}

\section*{\Large 软件实现与跨领域协作}
\begin{itemize}
\item 这不是独立项目记录，不应进入项目表单。
\end{itemize}
`;

test("builds structured employment and project records from a frozen CV template", () => {
  const packet = buildTemplateAutofillPacket({
    archiveId: "APP-2026-XMI-0116",
    templateFile: "CV_AI_Agent_Applied_Scientist_中文.tex",
    cvCommit: "0123456789abcdef",
    latex,
  });
  assert.equal(packet.authority, "final_customized_cv_only");
  assert.equal(packet.provenance, "frozen_submitted_template");
  assert.equal(packet.experience.length, 1);
  assert.equal(packet.experience[0].organization, "辉瑞（Pfizer）");
  assert.equal(packet.experience[0].start_year, "2026");
  assert.equal(packet.experience[0].start_month, "05");
  assert.equal(packet.experience[0].end_year, "2026");
  assert.equal(packet.experience[0].end_month, "08");
  assert.equal(packet.projects.length, 2);
  assert.equal(packet.projects[0].name, "Job Radar：证据约束的 RAG 岗位筛选工作流");
  assert.equal(packet.projects[0].role, "项目负责人");
  assert.equal(packet.projects[0].current, true);
  assert.equal(packet.projects[0].bullets.length, 2);
  assert.equal(packet.projects[1].end_month, "05");
  assert.deepEqual(packet.skills, [
    { category: "编程与报告", items: ["R", "SAS", "Python", "SQL"] },
    { category: "统计建模", items: ["GEE", "混合效应模型", "生存分析"] },
  ]);
});

test("parses English technical skills into individual autofill values", () => {
  const packet = buildTemplateAutofillPacket({
    archiveId: "TEMPLATE:CV_RWE_AI_EN.tex",
    templateFile: "CV_RWE_AI_EN.tex",
    cvCommit: "abcdef1234567890",
    latex: String.raw`\section*{Technical Skills}
\noindent\textbf{Programming and Productivity:} R; Python; SQL; SAS; Git/GitHub\\
\noindent\textbf{Statistics and Machine Learning:} Logistic regression; XGBoost; survival analysis`,
    authority: "live_cv_template",
    provenance: "live_template",
  });

  assert.deepEqual(packet.skills, [
    { category: "Programming and Productivity", items: ["R", "Python", "SQL", "SAS", "Git/GitHub"] },
    { category: "Statistics and Machine Learning", items: ["Logistic regression", "XGBoost", "survival analysis"] },
  ]);
});

test("preserves English month ranges from frozen templates", () => {
  const packet = buildTemplateAutofillPacket({
    archiveId: "APP-2026-DAT-0123",
    templateFile: "cv_data_scientist.tex",
    cvCommit: "abcdef1234567890",
    latex: String.raw`\section*{Project Experience}
\noindent\textbf{Forecasting Platform} $\mid$ Data Scientist \hfill May 2024 - Aug 2025\par
\begin{itemize}
\item Built a forecasting system.
\item Validated it on held-out data.
\end{itemize}`,
  });

  assert.deepEqual(
    [packet.projects[0].start_year, packet.projects[0].start_month, packet.projects[0].end_year, packet.projects[0].end_month],
    ["2024", "05", "2025", "08"],
  );
});

test("parses compact same-year English month ranges from a frozen master CV", () => {
  const packet = buildTemplateAutofillPacket({
    archiveId: "APP-2026-IQV-0130",
    templateFile: "CV_RWE_AI_EN.tex",
    cvCommit: "db114bc64a046aa89860c62543029869f642d8eb",
    latex: String.raw`\section*{Industry Experience}
\noindent\textbf{Pfizer} $\mid$ Statistics Intern, Statistical Inflammation and Immunology \hfill Boston, MA $\mid$ May--Aug. 2026\par
\begin{itemize}
\item Built a configurable clinical-trial simulation workflow.
\item Evaluated operating characteristics with Monte Carlo experiments.
\end{itemize}`,
  });

  assert.deepEqual(
    [packet.experience[0].start_year, packet.experience[0].start_month, packet.experience[0].end_year, packet.experience[0].end_month],
    ["2026", "05", "2026", "08"],
  );
});

test("parses English project headings that omit an explicit role", () => {
  const packet = buildTemplateAutofillPacket({
    archiveId: "APP-2026-1I7-0120",
    templateFile: "CV_AI_Agent_Applied_Scientist_EN.tex",
    cvCommit: "bb6b76ae3bd5fd2077bd99d2a381e8f9708b7fd2",
    latex: String.raw`\section*{AI Agent Applications and Workflow Development}
\noindent\textbf{Job Radar: Evidence-Grounded RAG and Application Workflows} \hfill Jul. 2026-Present\par
\begin{itemize}
\item Owned product and system design for an AI-assisted workflow.
\item Diagnosed RAG failures and tested revisions.
\end{itemize}`,
  });

  assert.equal(packet.projects.length, 1);
  assert.equal(packet.projects[0].name, "Job Radar: Evidence-Grounded RAG and Application Workflows");
  assert.equal(packet.projects[0].role, "");
  assert.equal(packet.projects[0].start_year, "2026");
  assert.equal(packet.projects[0].start_month, "07");
  assert.equal(packet.projects[0].current, true);
});

test("parses current template entries without an explicit par before itemize", () => {
  const packet = buildTemplateAutofillPacket({
    archiveId: "APP-2026-APP-0122",
    templateFile: "CV_Applied_DS_互联网_中文.tex",
    cvCommit: "bb6b76ae3bd5fd2077bd99d2a381e8f9708b7fd2",
    latex: String.raw`\section*{\Large 行业经历}
\noindent\textbf{辉瑞（Pfizer）} $\mid$ 统计实习生 \hfill 波士顿，美国 $\mid$ 2026 年 5 月--2026 年 8 月
\begin{itemize}
\item 构建临床试验模拟流程。
\item 完成敏感性分析。
\end{itemize}

\section*{\Large 应用机器学习与数据产品}
\noindent\textbf{Job Radar：多源岗位数据与智能筛选平台} $\mid$ 项目负责人 $\mid$ \href{https://github.com/XinyuIvy/ivy-job-radar}{GitHub} \hfill 2026 年 7 月--至今
\begin{itemize}
\item 设计多来源数据流程。
\item 建立验证与人工审核机制。
\end{itemize}`,
  });

  assert.equal(packet.experience.length, 1);
  assert.equal(packet.projects.length, 1);
  assert.equal(packet.projects[0].name, "Job Radar：多源岗位数据与智能筛选平台");
  assert.equal(packet.projects[0].role, "项目负责人");
  assert.equal(packet.projects[0].links[0].url, "https://github.com/XinyuIvy/ivy-job-radar");
  assert.equal(packet.projects[0].bullets.length, 2);
  assert.equal(packet.projects[0].current, true);
  assert.equal(hasTemplateAutofillProjects(packet), true);
  assert.equal(hasTemplateAutofillProjects({ experience: packet.experience, projects: [] }), false);
});

test("marks a directly selected current template as a live source", () => {
  const packet = buildTemplateAutofillPacket({
    archiveId: "TEMPLATE:CV_AppliedDataScientist_Internet_EN.tex",
    templateFile: "CV_AppliedDataScientist_Internet_EN.tex",
    cvCommit: "abcdef1234567890",
    latex: String.raw`\section*{Project Experience}
\noindent\textbf{Experimentation Platform} $\mid$ Data Scientist \hfill May 2024 - Present\par
\begin{itemize}
\item Designed the evaluation workflow.
\item Validated the results across cohorts.
\end{itemize}`,
    authority: "live_cv_template",
    provenance: "live_template",
  });

  assert.equal(packet.authority, "live_cv_template");
  assert.equal(packet.provenance, "live_template");
  assert.match(packet.application_id, /^TEMPLATE:/);
  assert.equal(packet.projects.length, 1);
});
