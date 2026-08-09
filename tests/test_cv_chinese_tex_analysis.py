import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTE = ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts"
LATEX_TEXT = ROOT / "app" / "lib" / "latex-text.ts"


class CvChineseTexAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.source = ROUTE.read_text(encoding="utf-8")
        self.latex_source = LATEX_TEXT.read_text(encoding="utf-8")

    def test_chinese_auto_research_requirements_are_recognized(self):
        for phrase in [
            "智能体",
            "工具调用",
            "代码执行",
            "实验验证",
            "强化学习",
            "数据合成",
            "轨迹数据",
            "多模态大模型",
            "论文复现",
            "跨学科",
        ]:
            self.assertIn(phrase, self.source)

    def test_fact_master_uses_project_level_headings(self):
        self.assertIn('facts.matchAll(/^###\\s+(.+)$/gm)', self.source)
        self.assertNotIn('facts.matchAll(/^####\\s+(.+)$/gm)', self.source)
        self.assertIn('!/^#{1,6}\\s/.test(line.trim())', self.source)

    def test_latex_template_is_converted_before_coverage_checks(self):
        self.assertIn('import { latexToPlainText } from "../../../lib/latex-text"', self.source)
        self.assertIn("const templateText = latexToPlainText(template)", self.source)
        self.assertIn("hasAlias(templateText, rule.literalTerms)", self.source)
        self.assertIn('" $1 "', self.latex_source)

    def test_ivy_job_radar_has_chinese_identity_aliases(self):
        self.assertIn('"Ivy Job Radar 多源岗位情报平台"', self.source)
        self.assertIn('"多源岗位情报平台"', self.source)

    def test_short_r_alias_uses_token_boundaries(self):
        self.assertRegex(self.source, re.compile(r"startBoundary.*a-z0-9"))
        self.assertRegex(self.source, re.compile(r"endBoundary.*a-z0-9"))
        self.assertIn('["r", "r programming"', self.source)

    def test_all_latin_aliases_use_complete_token_matching(self):
        matcher = self.source.split("function hasAlias", 1)[1].split("function evidenceContext", 1)[0]
        self.assertIn("escapeRegex(target)", matcher)
        self.assertIn("startBoundary", matcher)
        self.assertIn("endBoundary", matcher)

    def test_chinese_and_english_templates_are_available(self):
        for filename in [
            "cv_tech.tex",
            "cv_tech_cn.tex",
            "cv_quant.tex",
            "cv_quant_cn.tex",
            "cv_pharma.tex",
            "cv_pharma_cn.tex",
            "cv_healthcare_consulting.tex",
            "cv_healthcare_consulting_cn.tex",
            "cv_clinical_data_neuro_cn.tex",
        ]:
            self.assertIn(filename, self.source)


if __name__ == "__main__":
    unittest.main()
