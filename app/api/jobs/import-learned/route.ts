import { NextRequest } from "next/server";

import { POST as importJobs } from "../import/route";
import {
  getApprovedScreeningRules,
  learnedRuleAdjustment,
} from "../../../lib/screening-learning-store";

export const dynamic = "force-dynamic";

type ImportRow = Record<string, unknown>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function adjustRow(row: ImportRow, rules: Awaited<ReturnType<typeof getApprovedScreeningRules>>) {
  const region = clean(row.region) || "美国";
  if (region !== "美国") return row;
  const content = [
    row.title,
    row.description,
    row.full_description,
    row.evidence,
    Array.isArray(row.skills) ? row.skills.join(" ") : row.skills,
  ].map(clean).filter(Boolean).join(" ");
  const adjustment = learnedRuleAdjustment(content, rules);
  if (!adjustment.includeMatches.length && !adjustment.excludeMatches.length) return row;

  const currentScore = Number(row.score ?? 0);
  const learnedNote = adjustment.blocked
    ? `人工监督规则命中排除项：${adjustment.excludeMatches.map((item) => item.term).join("、")}`
    : `人工监督规则加分：${adjustment.includeMatches.map((item) => item.term).join("、")}（+${adjustment.boost}）`;
  return {
    ...row,
    score: adjustment.blocked ? 0 : Math.min(100, Math.max(0, currentScore) + adjustment.boost),
    evidence: [clean(row.evidence), learnedNote].filter(Boolean).join("；"),
  };
}

export async function POST(request: NextRequest) {
  const payload = await request.json() as unknown;
  const rules = await getApprovedScreeningRules();
  let adjusted: unknown = payload;
  if (Array.isArray(payload)) {
    adjusted = payload.map((row) => adjustRow(row as ImportRow, rules));
  } else if (payload && typeof payload === "object") {
    const envelope = payload as Record<string, unknown>;
    adjusted = {
      ...envelope,
      jobs: Array.isArray(envelope.jobs)
        ? envelope.jobs.map((row) => adjustRow(row as ImportRow, rules))
        : envelope.jobs,
    };
  }

  const forwarded = new NextRequest(new URL("/api/jobs/import", request.url), {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(adjusted),
  });
  return importJobs(forwarded);
}
