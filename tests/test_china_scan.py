import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


LEGACY_PATH = Path(__file__).with_name("_test_china_scan_legacy.py")
SPEC = importlib.util.spec_from_file_location("_ivy_test_china_scan_legacy", LEGACY_PATH)
assert SPEC and SPEC.loader
LEGACY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LEGACY)
CHINA_SCAN = LEGACY.CHINA_SCAN


def test_partial_fallback_results_keep_primary_rate_limit_status(self):
    with tempfile.TemporaryDirectory() as directory:
        config_path = Path(directory) / "config.json"
        config_path.write_text(json.dumps({"queries": []}), encoding="utf-8")
        original_fetch = CHINA_SCAN.fetch_bing_rss

        def partial_fetch(query):
            CHINA_SCAN.LAST_SEARCH_STATUS = "rate_limited"
            CHINA_SCAN.LAST_SEARCH_DETAIL = "Brave returned HTTP 429; Yahoo returned partial results."
            return [{
                "title": "数据分析师",
                "url": "https://jobs.51job.com/shanghai/123456789.html",
                "description": "统计学专业，月薪10-15K。",
            }]

        CHINA_SCAN.fetch_bing_rss = partial_fetch
        try:
            _, stats = CHINA_SCAN.run_scan(
                config_path,
                query_override={"source": "前程无忧", "query": "site:jobs.51job.com 数据分析师"},
            )
        finally:
            CHINA_SCAN.fetch_bing_rss = original_fetch

    self.assertEqual(stats[0]["source_status"], "rate_limited")
    self.assertEqual(stats[0]["matched"], 1)
    self.assertNotIn("salary_below_20k", stats[0]["rejected"])


def test_low_chinese_platform_salary_is_kept(self):
    stats = CHINA_SCAN.empty_filter_stats()
    row = CHINA_SCAN.normalize_result(
        {
            "title": "数据分析师招聘 | 广州 | 1-1.5万 | 某科技股份有限公司",
            "url": "https://jobs.51job.com/guangzhou/172962369.html",
            "description": "统计学专业，熟练使用 SQL。",
        },
        {"source": "前程无忧", "query": "site:jobs.51job.com 数据分析师"},
        "2026-08-02T00:00:00+00:00",
        stats,
    )

    self.assertIsNotNone(row)
    self.assertEqual(row["salary_min_monthly_k"], 10)
    self.assertNotIn("salary_below_20k", stats)


def test_low_daily_rate_is_kept_when_role_is_otherwise_eligible(self):
    stats = CHINA_SCAN.empty_filter_stats()
    row = CHINA_SCAN.normalize_result(
        {
            "title": "数据分析师",
            "url": "https://jobs.51job.com/shanghai/172962370.html",
            "description": "统计学专业，熟练使用 SQL，300元/天。",
        },
        {"source": "前程无忧", "query": "site:jobs.51job.com 数据分析师"},
        "2026-08-02T00:00:00+00:00",
        stats,
    )

    self.assertIsNotNone(row)
    self.assertAlmostEqual(row["salary_min_monthly_k"], 6.525)
    self.assertNotIn("salary_below_20k", stats)


LEGACY.ChinaScanFilterTest.test_partial_fallback_results_keep_primary_rate_limit_status = (
    test_partial_fallback_results_keep_primary_rate_limit_status
)
LEGACY.ChinaScanFilterTest.test_low_chinese_platform_salary_is_rejected = (
    test_low_chinese_platform_salary_is_kept
)
LEGACY.ChinaScanFilterTest.test_low_daily_rate_is_kept_when_role_is_otherwise_eligible = (
    test_low_daily_rate_is_kept_when_role_is_otherwise_eligible
)
ChinaScanFilterTest = LEGACY.ChinaScanFilterTest


if __name__ == "__main__":
    unittest.main()
