from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "china_scan.py"
SPEC = importlib.util.spec_from_file_location("china_scan", MODULE_PATH)
assert SPEC and SPEC.loader
CHINA_SCAN = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHINA_SCAN)


class ChinaScanEligibilityTests(unittest.TestCase):
    def normalize(self, title: str, description: str):
        reasons = {
            "missing_title_or_url": 0,
            "title_not_targeted": 0,
            "excluded_seniority_or_role": 0,
            "degree_experience_or_skill_gap": 0,
            "score_below_discovery_threshold": 0,
            "salary_below_20k": 0,
            "salary_missing_or_negotiable": 0,
        }
        result = CHINA_SCAN.normalize_result(
            {"title": title, "url": "https://jobs.example.cn/1", "description": description},
            {"source": "test", "query": "test"},
            "2026-08-02T00:00:00+00:00",
            reasons,
        )
        return result, reasons

    def test_keeps_postdoc_and_research_methods_without_score_gate(self):
        result, reasons = self.normalize(
            "生物统计博士后",
            "开展统计建模与深度学习架构研究，工资面议。",
        )
        self.assertIsNotNone(result)
        self.assertEqual(reasons["salary_missing_or_negotiable"], 1)

    def test_excludes_explicit_llm_core(self):
        result, reasons = self.normalize(
            "数据科学家",
            "核心工作是大语言模型与 NLP 研发，月薪 30-50K。",
        )
        self.assertIsNone(result)
        self.assertEqual(reasons["degree_experience_or_skill_gap"], 1)

    def test_excludes_more_than_three_years(self):
        result, reasons = self.normalize(
            "统计建模研究员",
            "要求 5 年相关经验，月薪 30-50K。",
        )
        self.assertIsNone(result)
        self.assertEqual(reasons["degree_experience_or_skill_gap"], 1)


if __name__ == "__main__":
    unittest.main()
