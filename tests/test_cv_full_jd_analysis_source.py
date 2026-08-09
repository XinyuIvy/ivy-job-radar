import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CvFullJdAnalysisSourceTests(unittest.TestCase):
    def test_analysis_covers_alibaba_atomic_requirements(self):
        ontology = (ROOT / "app" / "lib" / "cv-capability-ontology.ts").read_text(encoding="utf-8")
        for phrase in [
            "Statistics background",
            "STEM research domain",
            "Interdisciplinary background",
            "Peer-reviewed publications",
            "Python",
            "PyTorch",
            "Reinforcement learning",
            "PPO",
            "DPO",
            "GRPO",
            "Reward design",
            "Training stability",
            "Exploration efficiency",
            "Generalization",
            "Agent system",
            "Tool calling",
            "Code execution",
            "Experiment validation",
            "Data cleaning",
            "Data filtering",
            "Data augmentation",
            "Data mixture",
            "Data pipeline",
            "Problem definition",
            "Independent research",
            "Literature review",
            "Paper reproduction",
            "Experiment design",
            "Result analysis",
            "Scientific writing",
            "Cross-disciplinary collaboration",
        ]:
            self.assertIn(phrase, ontology)

    def test_analysis_uses_dual_corpus_semantic_matching(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("runCompleteHybridRag", route)
        self.assertIn("verifiedSupportEvidence", route)
        self.assertIn("buildCvTemplateIndex", route)
        self.assertIn("searchCvTemplate", route)
        self.assertIn("supportEvidence", route)
        self.assertIn("templateMatches", route)
        self.assertNotIn("hasAlias(templateText, rule.literalTerms)", route)

    def test_analysis_ranks_verified_projects(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("projectRecommendations", route)
        self.assertIn("matchedRequirements", route)
        self.assertIn("alreadyInTemplate", route)
        self.assertIn("projects,", route)


if __name__ == "__main__":
    unittest.main()
