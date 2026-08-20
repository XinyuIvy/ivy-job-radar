import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PendingFactFitScoreTests(unittest.TestCase):
    def test_score_uses_explainable_fact_classifications(self):
        source = (ROOT / "app" / "lib" / "application-fit-score.ts").read_text(encoding="utf-8")
        for classification in [
            'Direct: 1',
            '"Credential Direct": 1',
            '"Strong Transferable": 0.76',
            '"Coursework Match": 0.58',
            'Adjacent: 0.28',
            '"No Evidence": 0',
        ]:
            self.assertIn(classification, source)
        self.assertIn("evidenceCoverage", source)
        self.assertIn("directCoverage", source)
        self.assertIn("transferableCoverage", source)
        self.assertIn("cvCoverage", source)
        self.assertIn("gapRisk", source)
        self.assertIn("unsupported / total >= 0.4", source)

    def test_scores_only_pending_application_cards_and_reuses_cv_analysis(self):
        component = (ROOT / "app" / "pending-application-fit-scores.tsx").read_text(encoding="utf-8")
        layout = (ROOT / "app" / "layout.tsx").read_text(encoding="utf-8")
        self.assertIn("候选岗位", component)
        self.assertIn('section.application-list article.application-card', component)
        self.assertIn('/api/cv-tailor/application?applicationId=', component)
        self.assertIn('fetch("/api/cv-tailor/analyze"', component)
        self.assertIn("FACT MASTER MATCH", component)
        self.assertIn("事实库匹配", component)
        self.assertIn("Direct 覆盖", component)
        self.assertIn("可迁移覆盖", component)
        self.assertIn("当前 CV 覆盖", component)
        self.assertIn("Gap 风险", component)
        self.assertIn("MAX_CONCURRENT = 2", component)
        self.assertIn("CACHE_TTL_MS = 24 * 60 * 60 * 1000", component)
        self.assertIn("待补完整 JD", component)
        self.assertIn("<PendingApplicationFitScores />", layout)

    def test_legacy_manual_fit_is_hidden_only_when_fact_score_panel_is_active(self):
        component = (ROOT / "app" / "pending-application-fit-scores.tsx").read_text(encoding="utf-8")
        self.assertIn('=== "匹配度"', component)
        self.assertIn('legacy.style.setProperty("display", "none", "important")', component)


if __name__ == "__main__":
    unittest.main()
