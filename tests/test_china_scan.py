import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "china_scan.py"
SPEC = importlib.util.spec_from_file_location("china_scan", MODULE_PATH)
assert SPEC and SPEC.loader
CHINA_SCAN = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHINA_SCAN)


class ChinaScanFilterTest(unittest.TestCase):
    def test_scientific_algorithm_role_is_kept(self):
        stats = {
            "missing_title_or_url": 0,
            "title_not_targeted": 0,
            "excluded_seniority_or_role": 0,
            "degree_experience_or_skill_gap": 0,
            "score_below_discovery_threshold": 0,
        }
        row = CHINA_SCAN.normalize_result(
            {
                "title": "创新算法研究员",
                "url": "https://example.cn/jobs/algorithm-scientist",
                "description": (
                    "博士，应用数学、人工智能或生命科学背景；使用 Python "
                    "开展生物信息、新药研发和分子模拟研究。经验不限。"
                ),
            },
            {"source": "中国公司官网", "query": "生物统计"},
            "2026-08-01T00:00:00+00:00",
            stats,
        )

        self.assertIsNotNone(row)
        self.assertEqual(row["title"], "创新算法研究员")
        self.assertEqual(row["region"], "中国")

    def test_unrelated_result_records_rejection_reason(self):
        stats = {
            "missing_title_or_url": 0,
            "title_not_targeted": 0,
            "excluded_seniority_or_role": 0,
            "degree_experience_or_skill_gap": 0,
            "score_below_discovery_threshold": 0,
        }
        row = CHINA_SCAN.normalize_result(
            {
                "title": "物流统计员",
                "url": "https://example.cn/jobs/logistics",
                "description": "负责仓库日报。",
            },
            {"source": "公开索引", "query": "生物统计"},
            "2026-08-01T00:00:00+00:00",
            stats,
        )

        self.assertIsNone(row)
        self.assertEqual(stats["title_not_targeted"], 1)


if __name__ == "__main__":
    unittest.main()
