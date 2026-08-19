export type FitMatchInput = {
  keyword?: string;
  status?: string;
  evidenceClassification?: string;
  confidence?: number;
};

export type ApplicationFactFitScore = {
  score: number;
  label: string;
  evidenceCoverage: number;
  directCoverage: number;
  transferableCoverage: number;
  cvCoverage: number;
  gapRisk: number;
  confidence: number;
  counts: {
    total: number;
    direct: number;
    transferable: number;
    coursework: number;
    adjacent: number;
    unsupported: number;
  };
  topMatches: string[];
  gaps: string[];
};

const evidencePoints: Record<string, number> = {
  Direct: 1,
  "Credential Direct": 1,
  "Strong Transferable": 0.76,
  "Coursework Match": 0.58,
  Adjacent: 0.28,
  "Credential Status Gap": 0.16,
  "No Evidence": 0,
};

function percentage(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreLabel(score: number) {
  if (score >= 85) return "强匹配";
  if (score >= 75) return "较强匹配";
  if (score >= 65) return "中等匹配";
  if (score >= 50) return "有明显缺口";
  return "低匹配";
}

export function calculateApplicationFactFit(matches: FitMatchInput[]): ApplicationFactFitScore {
  const usable = matches.filter((match) => Boolean(match.keyword || match.status || match.evidenceClassification));
  const total = usable.length;
  if (!total) {
    return {
      score: 0,
      label: "待分析",
      evidenceCoverage: 0,
      directCoverage: 0,
      transferableCoverage: 0,
      cvCoverage: 0,
      gapRisk: 100,
      confidence: 0,
      counts: { total: 0, direct: 0, transferable: 0, coursework: 0, adjacent: 0, unsupported: 0 },
      topMatches: [],
      gaps: [],
    };
  }

  let direct = 0;
  let transferable = 0;
  let coursework = 0;
  let adjacent = 0;
  let unsupported = 0;
  let evidenceTotal = 0;
  let covered = 0;
  let confidenceTotal = 0;

  for (const match of usable) {
    const classification = String(match.evidenceClassification || "No Evidence");
    evidenceTotal += evidencePoints[classification] ?? 0;
    confidenceTotal += Math.max(0, Math.min(100, Number(match.confidence || 0)));
    if (match.status === "covered") covered += 1;

    if (classification === "Direct" || classification === "Credential Direct") direct += 1;
    else if (classification === "Strong Transferable") transferable += 1;
    else if (classification === "Coursework Match") coursework += 1;
    else if (classification === "Adjacent" || classification === "Credential Status Gap") adjacent += 1;
    else unsupported += 1;
  }

  const evidenceCoverage = percentage((evidenceTotal / total) * 100);
  const directCoverage = percentage((direct / total) * 100);
  const transferableCoverage = percentage(((direct + transferable + coursework) / total) * 100);
  const cvCoverage = percentage((covered / total) * 100);
  const gapRisk = percentage(((unsupported + adjacent * 0.45) / total) * 100);
  const confidence = percentage(confidenceTotal / total);

  let score = percentage(
    evidenceCoverage * 0.55
      + directCoverage * 0.15
      + cvCoverage * 0.10
      + confidence * 0.10
      + (100 - gapRisk) * 0.10,
  );

  // A large unsupported share should not be hidden by many weak transferable hits.
  if (unsupported / total >= 0.4) score = Math.min(score, 64);
  if (unsupported / total >= 0.6) score = Math.min(score, 49);

  const supported = usable
    .filter((match) => ["Direct", "Credential Direct", "Strong Transferable"].includes(String(match.evidenceClassification || "")))
    .sort((left, right) => {
      const pointDiff = (evidencePoints[String(right.evidenceClassification || "")] ?? 0)
        - (evidencePoints[String(left.evidenceClassification || "")] ?? 0);
      return pointDiff || Number(right.confidence || 0) - Number(left.confidence || 0);
    })
    .map((match) => String(match.keyword || "").trim())
    .filter(Boolean);

  const gaps = usable
    .filter((match) => match.status === "unsupported_gap" || match.status === "adjacent_gap")
    .sort((left, right) => Number(left.confidence || 0) - Number(right.confidence || 0))
    .map((match) => String(match.keyword || "").trim())
    .filter(Boolean);

  return {
    score,
    label: scoreLabel(score),
    evidenceCoverage,
    directCoverage,
    transferableCoverage,
    cvCoverage,
    gapRisk,
    confidence,
    counts: { total, direct, transferable, coursework, adjacent, unsupported },
    topMatches: [...new Set(supported)].slice(0, 4),
    gaps: [...new Set(gaps)].slice(0, 4),
  };
}
