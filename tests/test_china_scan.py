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
            "salary_below_20k": 0,
            "salary_missing_or_negotiable": 0,
        }
        row = CHINA_SCAN.normalize_result(
            {
                "title": "创新算法研究员",
                "url": "https://example.cn/jobs/algorithm-scientist",
                "description": (
                    "博士，应用数学、人工智能或生命科学背景；使用 Python "
                    "开展生物信息、新药研发和分子模拟研究。经验不限。月薪 20-35K。"
                ),
            },
            {"source": "中国公司官网", "query": "生物统计"},
            "2026-08-01T00:00:00+00:00",
            stats,
        )

        self.assertIsNotNone(row)
        self.assertEqual(row["title"], "创新算法研究员")
        self.assertEqual(row["region"], "中国")

    def test_targeted_query_keeps_incomplete_platform_snippet(self):
        stats = {
            "missing_title_or_url": 0,
            "title_not_targeted": 0,
            "excluded_seniority_or_role": 0,
            "degree_experience_or_skill_gap": 0,
            "score_below_discovery_threshold": 0,
            "salary_below_20k": 0,
            "salary_missing_or_negotiable": 0,
        }
        row = CHINA_SCAN.normalize_result(
            {
                "title": "研究员",
                "url": "https://www.liepin.com/job/123456",
                "description": "招聘平台仅返回截断摘要，完整职位信息待核验。",
            },
            {"source": "猎聘", "query": "site:liepin.com 生物统计"},
            "2026-08-02T00:00:00+00:00",
            stats,
        )

        self.assertIsNotNone(row)
        self.assertEqual(stats["title_not_targeted"], 0)
        self.assertIn("需打开具体 JD 核验", row["evidence"])

    def test_untargeted_direct_page_still_rejects_unrelated_result(self):
        stats = {
            "missing_title_or_url": 0,
            "title_not_targeted": 0,
            "excluded_seniority_or_role": 0,
            "degree_experience_or_skill_gap": 0,
            "score_below_discovery_threshold": 0,
            "salary_below_20k": 0,
            "salary_missing_or_negotiable": 0,
        }
        row = CHINA_SCAN.normalize_result(
            {
                "title": "普通研究员",
                "url": "https://example.cn/jobs/researcher",
                "description": "负责一般事务。",
            },
            {"source": "直接招聘页", "query": "https://example.cn/careers"},
            "2026-08-02T00:00:00+00:00",
            stats,
        )

        self.assertIsNone(row)
        self.assertEqual(stats["title_not_targeted"], 1)

    def test_unrelated_result_records_rejection_reason(self):
        stats = {
            "missing_title_or_url": 0,
            "title_not_targeted": 0,
            "excluded_seniority_or_role": 0,
            "degree_experience_or_skill_gap": 0,
            "score_below_discovery_threshold": 0,
            "salary_below_20k": 0,
            "salary_missing_or_negotiable": 0,
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
        self.assertEqual(stats["excluded_seniority_or_role"], 1)

    def test_salary_experience_and_role_exclusions_are_hard_filters(self):
        base = {
            "url": "https://example.cn/jobs/role",
            "description": "统计建模，月薪 20-30K，要求 2 年经验。",
        }
        query = {"source": "中国公司官网", "query": "统计"}
        scanned_at = "2026-08-01T00:00:00+00:00"

        kept = CHINA_SCAN.normalize_result({**base, "title": "统计建模研究员"}, query, scanned_at)
        salary_missing = CHINA_SCAN.normalize_result(
            {**base, "title": "统计建模研究员", "description": "统计建模，工资面议。"},
            query,
            scanned_at,
        )
        low_salary = CHINA_SCAN.normalize_result(
            {**base, "title": "统计建模研究员", "description": "统计建模，月薪 15-30K。"},
            query,
            scanned_at,
        )
        too_experienced = CHINA_SCAN.normalize_result(
            {**base, "title": "统计建模研究员", "description": "统计建模，月薪 25-35K，要求 5 年经验。"},
            query,
            scanned_at,
        )
        senior = CHINA_SCAN.normalize_result({**base, "title": "资深统计科学家"}, query, scanned_at)
        postdoc = CHINA_SCAN.normalize_result({**base, "title": "生物统计博士后"}, query, scanned_at)

        self.assertIsNotNone(kept)
        self.assertIsNotNone(salary_missing)
        self.assertIn("已保留待核验", salary_missing["evidence"])
        self.assertIsNone(low_salary)
        self.assertIsNone(too_experienced)
        self.assertIsNone(senior)
        self.assertIsNotNone(postdoc)


if __name__ == "__main__":
    unittest.main()
