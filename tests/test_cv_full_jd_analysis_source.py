import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CvFullJdAnalysisSourceTests(unittest.TestCase):
    def test_analysis_covers_full_research_scientist_requirements(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        for phrase in [
            "Scientific study design",
            "Human-subjects research",
            "Wearable and physiological data",
            "Time-series analysis",
            "Regression and mixed models",
            "Bayesian methods",
            "Reproducible computational workflows",
            "Manuscripts and scientific dissemination",
            "Cross-functional collaboration",
            "Industry-academia experience",
            "UAE research experience",
        ]:
            self.assertIn(phrase, route)

    def test_analysis_uses_aliases_and_structured_fact_evidence(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("hasAlias(template, rule.aliases)", route)
        self.assertIn("collectSupportEvidence(facts, rule)", route)
        self.assertIn("supportEvidence", route)
        self.assertIn("jdEvidence", route)

    def test_analysis_ranks_fact_master_projects(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("recommendProjects", route)
        self.assertIn("matchedRequirements", route)
        self.assertIn("alreadyInTemplate", route)
        self.assertIn("projects,", route)


if __name__ == "__main__":
    unittest.main()
