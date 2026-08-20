import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CvTailorSourceTests(unittest.TestCase):
    def test_cv_workspace_uses_canonical_cv_repository_sources(self):
        source = (ROOT / "app" / "api" / "cv-tailor" / "source" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("XinyuIvy/CV", source)
        self.assertIn("master/FACT_MASTER.md", source)
        self.assertIn("KEYWORD_ANALYSIS.md", source)
        self.assertIn("cv_pharma.tex", source)
        self.assertIn("cv_tech.tex", source)
        self.assertIn("cv_quant.tex", source)
        self.assertIn("cv_healthcare_consulting.tex", source)
        self.assertIn("cv_pharma_cn.tex", source)
        self.assertIn("cv_tech_cn.tex", source)
        self.assertIn("cv_quant_cn.tex", source)
        self.assertIn("cv_healthcare_consulting_cn.tex", source)
        self.assertIn("cv_clinical_data_neuro_cn.tex", source)
        self.assertIn("FACT_INDEX.jsonl", source)
        self.assertIn("CONCEPT_EDGES.jsonl", source)
        self.assertIn("PROJECT_INDEX.jsonl", source)
        self.assertNotIn("cv_pharma.md", source)
        self.assertNotIn("cv_tech.md", source)
        self.assertNotIn("cv_quant.md", source)
        self.assertNotIn("cv_healthcare_consulting.md", source)

    def test_cv_analysis_separates_supported_and_unsupported_gaps(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("cv_pharma.tex", route)
        self.assertIn("cv_tech.tex", route)
        self.assertIn("cv_quant.tex", route)
        self.assertIn("cv_healthcare_consulting.tex", route)
        self.assertNotIn("cv_tech.md", route)
        self.assertIn('"supported_gap"', route)
        self.assertIn('"adjacent_gap"', route)
        self.assertIn('"unsupported_gap"', route)
        self.assertIn("supportEvidence", route)

    def test_cv_publish_endpoint_is_fail_closed(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "publish" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("AUTOMATIC_CV_PUBLISH_DISABLED", route)
        self.assertIn("人工分类与内容确认", route)
        self.assertNotIn("CV_GITHUB_TOKEN", route)
        self.assertNotIn('/pulls', route)

    def test_workspace_is_linked_from_pending_application_actions(self):
        layout = (ROOT / "app" / "layout.tsx").read_text(encoding="utf-8")
        actions = (ROOT / "app" / "application-cv-actions.tsx").read_text(encoding="utf-8")
        self.assertIn("<ApplicationCvActions />", layout)
        self.assertIn("/cv-tailor?applicationId=", actions)
        self.assertIn("定制 CV", actions)
        self.assertNotIn('href="/cv-tailor"', layout)

    def test_tailor_requires_explicit_template_selection_before_archive(self):
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        self.assertIn("请选择 CV 母版", client)
        self.assertIn("selectedTemplateKey", client)
        self.assertIn("recommendedTemplateKey", client)
        self.assertIn("Job Radar 只给建议，不会自动替你确认", client)
        self.assertIn("disabled={!jdDraft.trim() || !selectedTemplateKey}", client)
        self.assertIn("确认母版与 JD 并生成申请档案", client)
        self.assertIn("cv_tech_cn.tex", client)
        self.assertIn("cv_quant_cn.tex", client)
        self.assertIn("cv_pharma_cn.tex", client)
        self.assertIn("cv_healthcare_consulting_cn.tex", client)
        self.assertIn("cv_clinical_data_neuro_cn.tex", client)
        self.assertIn("cv_tech.tex", client)
        self.assertIn("cv_quant.tex", client)


if __name__ == "__main__":
    unittest.main()
