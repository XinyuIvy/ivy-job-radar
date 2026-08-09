import assert from "node:assert/strict";
import test from "node:test";

import { latexToPlainText } from "../app/lib/latex-text.ts";

test("preserves a project title after noindent and textbf commands", () => {
  const latex = String.raw`\noindent\textbf{Ivy Job Radar 多源岗位情报平台} $\mid$ 独立开发者`;
  const plain = latexToPlainText(latex);

  assert.match(plain, /Ivy Job Radar 多源岗位情报平台/);
  assert.doesNotMatch(plain, /noindentIvy/);
});

test("preserves extracted link labels without joining adjacent commands", () => {
  const latex = String.raw`\noindent\textbf{Project} $\mid$ \href{https://example.com}{GitHub} \hfill 2026`;
  const plain = latexToPlainText(latex);

  assert.match(plain, /Project/);
  assert.match(plain, /GitHub/);
});
