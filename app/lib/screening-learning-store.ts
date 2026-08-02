type RuleKind = "include" | "exclude";
type DecisionStatus = "approved" | "rejected";

export type ScreeningRule = {
  kind: RuleKind;
  term: string;
  label: string;
  positiveCount: number;
  negativeCount: number;
  status: DecisionStatus | "suggested";
  reason: string;
};

const CANDIDATES: Array<{ term: string; label: string; kind: RuleKind; pattern: RegExp }> = [
  { term: "research scientist", label: "Research Scientist", kind: "include", pattern: /\bresearch scientist\b/i },
  { term: "applied scientist", label: "Applied Scientist", kind: "include", pattern: /\bapplied scientist\b/i },
  { term: "digital health", label: "Digital Health", kind: "include", pattern: /\bdigital health\b/i },
  { term: "health data", label: "Health Data", kind: "include", pattern: /\bhealth data\b/i },
  { term: "behavioral science", label: "Behavioral Science", kind: "include", pattern: /\bbehaviou?ral sciences?\b/i },
  { term: "neuroscience", label: "Neuroscience", kind: "include", pattern: /\bneuroscience\b/i },
  { term: "sleep science", label: "Sleep and Circadian Science", kind: "include", pattern: /\bsleep\b|\bcircadian\b/i },
  { term: "physiology", label: "Physiology", kind: "include", pattern: /\bphysiology\b/i },
  { term: "women's health", label: "Women’s Health", kind: "include", pattern: /\bwomen(?:'s|s)? health\b/i },
  { term: "wearable", label: "Wearables and Digital Biomarkers", kind: "include", pattern: /\bwearable|digital biomarker/i },
  { term: "biostatistics", label: "Biostatistics", kind: "include", pattern: /\bbiostatistics?\b/i },
  { term: "data science", label: "Data Science", kind: "include", pattern: /\bdata science\b/i },
  { term: "clinical research", label: "Clinical Research", kind: "include", pattern: /\bclinical research\b/i },
  { term: "generative ai", label: "Generative AI", kind: "exclude", pattern: /generative ai|large language model|\bllm\b/i },
  { term: "software engineering", label: "Software Engineering Core", kind: "exclude", pattern: /software engineer|full[- ]stack|production ml|mlops/i },
];

async function database() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("Database binding is unavailable.");
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS screening_rule_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      term TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(kind, term)
    )
  `).run();
  return env.DB;
}

function textOf(row: Record<string, unknown>) {
  return `${String(row.title ?? "")} ${String(row.description ?? "")} ${String(row.evidence ?? "")} ${String(row.skills ?? "")}`;
}

export async function getApprovedScreeningRules() {
  const db = await database();
  const result = await db.prepare(
    "SELECT kind, term FROM screening_rule_decisions WHERE status = 'approved' ORDER BY kind, term",
  ).all<{ kind: RuleKind; term: string }>();
  return result.results ?? [];
}

export async function decideScreeningRule(kind: RuleKind, term: string, status: DecisionStatus) {
  const candidate = CANDIDATES.find((item) => item.kind === kind && item.term === term);
  if (!candidate) throw new Error("Unknown screening rule.");
  const db = await database();
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO screening_rule_decisions (kind, term, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(kind, term) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at
  `).bind(kind, term, status, now, now).run();
}

export async function getScreeningLearningSnapshot() {
  const db = await database();
  const [jobsResult, ignoredResult, decisionsResult] = await Promise.all([
    db.prepare(`
      SELECT j.id, j.title, j.description, j.evidence, j.skills, j.source,
             CASE WHEN s.job_id IS NOT NULL THEN 1 ELSE 0 END AS saved,
             CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END AS application,
             CASE WHEN a.status IN ('已申请','一面','二面','终面','Offer') THEN 1 ELSE 0 END AS submitted
      FROM jobs j
      LEFT JOIN saved_jobs s ON s.job_id = j.id
      LEFT JOIN applications a ON (a.job_url <> '' AND a.job_url = j.job_url)
        OR (lower(trim(a.company)) = lower(trim(j.company)) AND lower(trim(a.title)) = lower(trim(j.title)))
    `).all<Record<string, unknown>>(),
    db.prepare("SELECT title, company, reason FROM ignored_jobs").all<Record<string, unknown>>(),
    db.prepare("SELECT kind, term, status FROM screening_rule_decisions").all<{ kind: RuleKind; term: string; status: DecisionStatus }>(),
  ]);

  const positives = (jobsResult.results ?? []).filter((row) => {
    const source = String(row.source ?? "");
    return source.includes("Chrome 书签手动加入")
      || source.includes("人工确认")
      || Number(row.saved) === 1
      || Number(row.application) === 1;
  });
  const negatives = ignoredResult.results ?? [];
  const decisions = new Map(
    (decisionsResult.results ?? []).map((row) => [`${row.kind}:${row.term}`, row.status]),
  );

  const rules: ScreeningRule[] = CANDIDATES.map((candidate) => {
    const positiveCount = positives.filter((row) => candidate.pattern.test(textOf(row))).length;
    const negativeCount = negatives.filter((row) => candidate.pattern.test(`${row.title ?? ""} ${row.reason ?? ""}`)).length;
    const status = decisions.get(`${candidate.kind}:${candidate.term}`) ?? "suggested";
    const supportive = candidate.kind === "include" ? positiveCount : negativeCount;
    const contradictory = candidate.kind === "include" ? negativeCount : positiveCount;
    return {
      kind: candidate.kind,
      term: candidate.term,
      label: candidate.label,
      positiveCount,
      negativeCount,
      status,
      reason: supportive === 0
        ? "当前样本还不足，先保留观察。"
        : contradictory === 0
          ? `来自 ${supportive} 个明确反馈样本，暂未发现相反信号。`
          : `有 ${supportive} 个支持样本和 ${contradictory} 个相反样本，需要谨慎判断。`,
    };
  }).filter((rule) => rule.status !== "suggested" || rule.positiveCount + rule.negativeCount > 0);

  return {
    counts: {
      positive: positives.length,
      negative: negatives.length,
      strongPositive: positives.filter((row) => Number(row.submitted) === 1).length,
      approved: rules.filter((rule) => rule.status === "approved").length,
    },
    rules: rules.sort((a, b) => {
      const statusOrder = { suggested: 0, approved: 1, rejected: 2 } as const;
      return statusOrder[a.status] - statusOrder[b.status]
        || (b.positiveCount + b.negativeCount) - (a.positiveCount + a.negativeCount)
        || a.label.localeCompare(b.label);
    }),
  };
}

export function learnedRuleAdjustment(
  content: string,
  rules: Array<{ kind: RuleKind; term: string }>,
) {
  const lower = content.toLowerCase();
  const includeMatches = rules.filter((rule) => rule.kind === "include" && lower.includes(rule.term));
  const excludeMatches = rules.filter((rule) => rule.kind === "exclude" && lower.includes(rule.term));
  return {
    includeMatches,
    excludeMatches,
    boost: Math.min(15, includeMatches.length * 5),
    blocked: excludeMatches.length > 0,
  };
}
