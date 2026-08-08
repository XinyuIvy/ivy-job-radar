import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTE = ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts"


class CvChineseTexAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.source = ROUTE.read_text(encoding="utf-8")

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
        self.assertIn("function latexToPlainText", self.source)
        self.assertIn("const templateText = latexToPlainText(template)", self.source)
        self.assertIn("hasAlias(templateText, rule.aliases)", self.source)

    def test_short_r_alias_uses_token_boundaries(self):
        self.assertRegex(self.source, re.compile(r"target\.length === 1"))
        self.assertIn('["r", "r programming"', self.source)


if __name__ == "__main__":
    unittest.main()
