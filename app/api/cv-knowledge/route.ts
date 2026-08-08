import { NextRequest, NextResponse } from "next/server";

import { KNOWLEDGE_FILES, loadKnowledgeBase, retrieveKnowledgeFacts } from "../../lib/cv-knowledge";

export const dynamic = "force-dynamic";

async function token() {
  const { env } = await import("cloudflare:workers");
  return String(env.CV_GITHUB_TOKEN || "").trim();
}

function fileStatus(file: { sha?: string; size?: number } | null, path: string) {
  return { path, present: Boolean(file), sha: file?.sha || "", size: file?.size || 0 };
}

export async function GET() {
  const githubToken = await token();
  if (!githubToken) return NextResponse.json({ error: "CV_GITHUB_TOKEN 未配置。" }, { status: 503 });
  try {
    const base = await loadKnowledgeBase(githubToken);
    const projects = new Set(base.facts.map((fact) => typeof fact.project === "string" ? fact.project : fact.project?.name).filter(Boolean));
    const concepts = new Set(base.facts.flatMap((fact) => fact.statistical_concepts ?? []));
    const capabilities = new Set(base.facts.flatMap((fact) => fact.transferable_capabilities ?? []));
    const translations = ["tech", "quant", "pharma", "consulting"].reduce<Record<string, number>>((result, track) => {
      result[track] = base.facts.reduce((count, fact) => count + (fact.industry_translation?.[track]?.length ?? 0), 0);
      return result;
    }, {});
    return NextResponse.json({
      ready: base.facts.length > 0,
      mode: base.facts.length > 0 ? "structured-knowledge" : "fact-master-fallback",
      files: {
        facts: fileStatus(base.files.facts, KNOWLEDGE_FILES.facts),
        ontology: fileStatus(base.files.ontology, KNOWLEDGE_FILES.ontology),
        translations: fileStatus(base.files.translations, KNOWLEDGE_FILES.translations),
      },
      counts: { facts: base.facts.length, projects: projects.size, concepts: concepts.size, capabilities: capabilities.size, translations },
      note: base.facts.length > 0
        ? "结构化知识库已可用于 JD 证据检索。"
        : "一级证据仍在构建时保持现有 FACT_MASTER 分析；添加 FACT_INDEX.json 后自动启用结构化检索。",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "知识库读取失败。" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { jd?: string; track?: string };
  const jd = String(body.jd || "").trim();
  const track = ["tech", "quant", "pharma", "consulting"].includes(String(body.track)) ? String(body.track) : "tech";
  if (!jd) return NextResponse.json({ error: "请提供 JD。" }, { status: 400 });
  const githubToken = await token();
  if (!githubToken) return NextResponse.json({ error: "CV_GITHUB_TOKEN 未配置。" }, { status: 503 });
  try {
    const base = await loadKnowledgeBase(githubToken);
    if (!base.facts.length) {
      return NextResponse.json({ ready: false, mode: "fact-master-fallback", matches: [], message: "FACT_INDEX.json 尚未建立。现有 CV 分析仍可继续使用 FACT_MASTER。" });
    }
    return NextResponse.json({
      ready: true,
      mode: "structured-hybrid-retrieval",
      track,
      matches: retrieveKnowledgeFacts(base.facts, jd, track),
      guardrail: "相似度只用于召回候选事实；最终 CV wording 必须受 verified_fact、evidence_strength 与 prohibited_overclaims 约束。",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "知识库检索失败。" }, { status: 502 });
  }
}
