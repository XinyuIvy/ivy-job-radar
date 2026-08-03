import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type KeywordRule = { label: string; patterns: RegExp[]; category: string };

const rules: Record<string, KeywordRule[]> = {
  pharma: [
    { label: "R", patterns: [/\br\b/i, /r programming/i], category: "Programming" },
    { label: "SAS", patterns: [/\bsas\b/i], category: "Programming" },
    { label: "Python", patterns: [/\bpython\b/i], category: "Programming" },
    { label: "Clinical trials", patterns: [/clinical trials?/i, /study design/i], category: "Methods" },
    { label: "Experimental design", patterns: [/experimental design/i], category: "Methods" },
    { label: "Longitudinal analysis", patterns: [/longitudinal/i, /repeated measures/i], category: "Methods" },
    { label: "Survival analysis", patterns: [/survival analysis/i, /time-to-event/i], category: "Methods" },
    { label: "Real-world evidence", patterns: [/real[- ]world evidence/i, /\brwe\b/i], category: "Methods" },
    { label: "Regulatory knowledge", patterns: [/regulatory/i, /submission/i], category: "Research Practice" },
    { label: "Statistical analysis plans", patterns: [/statistical analysis plan/i, /\bsap\b/i], category: "Research Practice" },
  ],
  tech: [
    { label: "Python", patterns: [/\bpython\b/i], category: "Programming and Data" },
    { label: "Machine learning", patterns: [/machine learning/i], category: "Machine Learning and Statistics" },
    { label: "SQL", patterns: [/\bsql\b/i], category: "Programming and Data" },
    { label: "Experimentation / A/B testing", patterns: [/a\/b test/i, /experimentation/i], category: "Machine Learning and Statistics" },
    { label: "R", patterns: [/\br\b/i], category: "Programming and Data" },
    { label: "Statistical modeling", patterns: [/statistical model/i, /statistical analysis/i], category: "Machine Learning and Statistics" },
    { label: "Causal inference", patterns: [/causal inference/i], category: "Machine Learning and Statistics" },
    { label: "Cloud", patterns: [/cloud/i, /aws/i, /azure/i, /gcp/i], category: "Engineering" },
    { label: "C++", patterns: [/c\+\+/i], category: "Programming and Data" },
    { label: "Product analytics", patterns: [/product analytics/i], category: "Machine Learning and Statistics" },
  ],
  quant: [
    { label: "Python", patterns: [/\bpython\b/i], category: "Programming" },
    { label: "Machine learning", patterns: [/machine learning/i], category: "Methods" },
    { label: "C++", patterns: [/c\+\+/i], category: "Programming" },
    { label: "Time-series analysis", patterns: [/time series/i], category: "Methods" },
    { label: "Statistical modeling", patterns: [/statistical model/i, /statistical analysis/i], category: "Methods" },
    { label: "Quantitative investment research", patterns: [/investment research/i, /quantitative research/i], category: "Methods" },
    { label: "R", patterns: [/\br\b/i], category: "Programming" },
    { label: "SQL", patterns: [/\bsql\b/i], category: "Programming" },
    { label: "Factor / alpha research", patterns: [/factor research/i, /alpha research/i], category: "Methods" },
    { label: "Optimization", patterns: [/optimization/i, /portfolio optimization/i], category: "Methods" },
  ],
  consulting: [
    { label: "R", patterns: [/\br\b/i], category: "Analytics" },
    { label: "Python", patterns: [/\bpython\b/i], category: "Analytics" },
    { label: "SAS", patterns: [/\bsas\b/i], category: "Analytics" },
    { label: "SQL", patterns: [/\bsql\b/i], category: "Analytics" },
    { label: "Communication", patterns: [/communication/i, /present/i], category: "Collaboration" },
    { label: "Cross-functional collaboration", patterns: [/cross[- ]functional/i, /stakeholder/i], category: "Collaboration" },
    { label: "Regulatory knowledge", patterns: [/regulatory/i], category: "Decision Support" },
    { label: "Evidence synthesis", patterns: [/evidence synthesis/i, /literature review/i], category: "Decision Support" },
    { label: "Causal inference", patterns: [/causal inference/i], category: "Analytics" },
    { label: "Real-world evidence", patterns: [/real[- ]world/i, /\brwe\b/i], category: "Analytics" },
  ],
};

function context(text: string, label: string) {
  const index = text.toLowerCase().indexOf(label.toLowerCase());
  if (index < 0) return "";
  return text.slice(Math.max(0, index - 120), Math.min(text.length, index + label.length + 220)).replace(/\s+/g, " ").trim();
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { track?: string; jd?: string; template?: string; facts?: string };
  const track = body.track || "pharma";
  const jd = body.jd || "";
  const template = body.template || "";
  const facts = body.facts || "";
  const matches = (rules[track] || rules.pharma)
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(jd)))
    .map((rule) => {
      const covered = rule.patterns.some((pattern) => pattern.test(template));
      const factSupported = rule.patterns.some((pattern) => pattern.test(facts));
      return {
        keyword: rule.label,
        category: rule.category,
        status: covered ? "covered" : factSupported ? "supported_gap" : "unsupported_gap",
        factEvidence: factSupported ? context(facts, rule.label.split(" /")[0]) : "",
      };
    });
  return NextResponse.json({ track, matches, summary: {
    required: matches.length,
    covered: matches.filter((item) => item.status === "covered").length,
    supportedGaps: matches.filter((item) => item.status === "supported_gap").length,
    unsupportedGaps: matches.filter((item) => item.status === "unsupported_gap").length,
  } });
}
