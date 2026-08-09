import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CvFullJdAnalysisSourceTests(unittest.TestCase):
    def test_analysis_covers_full_research_scientist_requirements(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        for phrase in [
            "Scientific study design",
            "Human-subjects research",
            "Wearable data",
            "Physiological data",
            "Clinical data",
            "Multimodal data",
            "Time-series analysis",
            "Regression",
            "Mixed-effects models",
            "Bayesian methods",
            "Reproducible computational workflows",
            "Manuscript development",
            "Scientific dissemination",
            "Cross-functional collaboration",
            "Industry-academia experience",
            "UAE research experience",
        ]:
            self.assertIn(phrase, route)

    def test_analysis_uses_aliases_and_structured_fact_evidence(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("hasAlias(templateText, rule.literalTerms)", route)
        self.assertIn("latexToPlainText(template)", route)
        self.assertIn("runHybridRag(jd", route)
        self.assertIn("verifiedSupportEvidence", route)
        self.assertIn("supportEvidence", route)
        self.assertIn("jdEvidence", route)

    def test_analysis_ranks_fact_master_projects(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("recommendVerifiedProjects", route)
        self.assertIn("matchedRequirements", route)
        self.assertIn("alreadyInTemplate", route)
        self.assertIn("projects,", route)


if __name__ == "__main__":
    unittest.main()
