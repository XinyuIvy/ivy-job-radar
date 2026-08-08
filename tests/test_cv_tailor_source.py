import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CvTailorSourceTests(unittest.TestCase):
    def test_cv_workspace_uses_canonical_cv_repository_sources(self):
        source = (ROOT / "app" / "api" / "cv-tailor" / "source" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("XinyuIvy/CV", source)
        self.assertIn("master/FACT_MASTER.md", source)
        self.assertIn("KEYWORD_ANALYSIS.md", source)
        self.assertIn("cv_pharma.md", source)
        self.assertIn("cv_tech.md", source)
        self.assertIn("cv_quant.md", source)
        self.assertIn("cv_healthcare_consulting.md", source)

    def test_cv_analysis_separates_supported_and_unsupported_gaps(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        self.assertIn('"supported_gap"', route)
        self.assertIn('"unsupported_gap"', route)
        self.assertIn("supportEvidence", route)

    def test_cv_publish_writes_markdown_and_latex_to_cv_repo(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "publish" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("CV_GITHUB_TOKEN", route)
        self.assertIn("generated/", route)
        self.assertIn("main.tex", route)
        self.assertIn("cv.md", route)
        self.assertIn('/pulls', route)

    def test_workspace_is_linked_from_pending_application_actions(self):
        layout = (ROOT / "app" / "layout.tsx").read_text(encoding="utf-8")
        actions = (ROOT / "app" / "application-cv-actions.tsx").read_text(encoding="utf-8")
        self.assertIn("<ApplicationCvActions />", layout)
        self.assertIn("/cv-tailor?applicationId=", actions)
        self.assertIn("定制 CV", actions)
        self.assertNotIn('href="/cv-tailor"', layout)


if __name__ == "__main__":
    unittest.main()
