import { NextRequest, NextResponse } from "next/server";
import { answerLocally } from "../../lib/evidence-rag";
import { answerWithModelRag } from "../../lib/model-rag";
import type { CvPrebuildArtifactBucket } from "../../lib/cv-prebuild-artifacts";
import { parseJsonl, type FactIndexRecord } from "../../lib/hybrid-rag";

export const dynamic = "force-dynamic";

const paths = [
  "master/project-evidence/FACT_INDEX.jsonl",
  "master/project-evidence/FACT_INDEX_STATUS_ADDENDUM.jsonl",
  "master/project-evidence/FACT_INDEX_CURRENT_CLEANUP_2026-08-28.jsonl",
];

function decodeBase64Utf8(value: string) {
  const bytes = Uint8Array.from(atob(value.replace(/\n/g, "")), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function readFacts(path: string, token: string) {
  const response = await fetch(`https://api.github.com/repos/XinyuIvy/CV/contents/${path}?ref=main`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ivy-job-radar-evidence-rag" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`FACT_SOURCE_HTTP_${response.status}`);
  const payload = await response.json() as { content?: string };
  if (!payload.content) throw new Error("FACT_SOURCE_EMPTY");
  return parseJsonl<FactIndexRecord>(decodeBase64Utf8(payload.content));
}

let factCache: { expiresAt: number; promise: Promise<FactIndexRecord[]> } | null = null;

function currentFacts(token: string) {
  if (factCache && factCache.expiresAt > Date.now()) return factCache.promise;
  const promise = Promise.all(paths.map((path) => readFacts(path, token)))
    .then((sources) => {
      const byId = new Map<string, FactIndexRecord>();
      for (const fact of sources.flat()) if (fact.fact_id && (!fact.record_type || fact.record_type === "project_fact")) byId.set(fact.fact_id, fact);
      return [...byId.values()];
    }).catch((error) => { factCache = null; throw error; });
  factCache = { expiresAt: Date.now() + 5 * 60_000, promise };
  return promise;
}

export async function POST(request: NextRequest) {
  let query = "";
  let useModel = false;
  try {
    const body = await request.json() as { question?: unknown; useModel?: unknown };
    query = typeof body.question === "string" ? body.question.trim() : "";
    useModel = body.useModel === true;
  } catch {
    return NextResponse.json({ error: "请输入问题。" }, { status: 400 });
  }
  if (!query || query.length > 1200) return NextResponse.json({ error: "问题不能为空，且不能超过 1200 个字符。" }, { status: 400 });
  const { env } = await import("cloudflare:workers");
  const githubToken = String(env.CV_GITHUB_TOKEN ?? "").trim();
  const apiKey = String(env.DEEPSEEK_API_KEY ?? "").trim();
  const accountId = String(env.CLOUDFLARE_AI_ACCOUNT_ID ?? "").trim();
  const aiToken = String(env.CLOUDFLARE_AI_API_TOKEN ?? "").trim();
  if (!githubToken) return NextResponse.json({ error: "私有证据库尚未配置，暂时无法回答。" }, { status: 503 });
  if (useModel && (!apiKey || !accountId || !aiToken || !env.BUCKET)) return NextResponse.json({ error: "标准 RAG 尚未启用：请配置 CLOUDFLARE_AI_ACCOUNT_ID 和 CLOUDFLARE_AI_API_TOKEN（以及 DeepSeek 与 R2）。可切换到本地原文检索。" }, { status: 503 });
  const model = String(env.RAG_MODEL || env.AUTOFILL_SEMANTIC_MODEL || "deepseek-v4-flash").trim();
  try {
    const facts = await currentFacts(githubToken);
    const result = useModel
      ? await answerWithModelRag(query, facts, { accountId, token: aiToken, deepseekKey: apiKey, generatorModel: model, bucket: env.BUCKET as CvPrebuildArtifactBucket })
      : answerLocally(query, facts);
    return NextResponse.json({ ...result, indexedFacts: facts.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Evidence RAG failed", error);
    return NextResponse.json({ error: "证据检索或模型处理失败，请稍后重试。" }, { status: 502 });
  }
}
