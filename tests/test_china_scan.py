import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "china_scan.py"
SPEC = importlib.util.spec_from_file_location("china_scan", MODULE_PATH)
assert SPEC and SPEC.loader
CHINA_SCAN = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHINA_SCAN)


class ChinaScanFilterTest(unittest.TestCase):
    def test_single_query_override_skips_other_queries_and_direct_pages(self):
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "config.json"
            config_path.write_text(json.dumps({
                "queries": [{"source": "unused", "query": "unused"}],
                "direct_pages": [{"source": "unused page", "url": "https://example.cn"}],
            }), encoding="utf-8")
            original_fetch = CHINA_SCAN.fetch_bing_rss
            CHINA_SCAN.fetch_bing_rss = lambda query: []
            try:
                _, stats = CHINA_SCAN.run_scan(
                    config_path,
                    query_override={"source": "猎聘", "query": "site:liepin.com 生物统计"},
                )
            finally:
                CHINA_SCAN.fetch_bing_rss = original_fetch

        self.assertEqual(len(stats), 1)
        self.assertEqual(stats[0]["source"], "猎聘")

    def test_rate_limit_is_reported_as_source_limit_not_zero_results(self):
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "config.json"
            config_path.write_text(json.dumps({"queries": []}), encoding="utf-8")
            original_fetch = CHINA_SCAN.fetch_bing_rss

            def limited_fetch(query):
                CHINA_SCAN.LAST_SEARCH_STATUS = "rate_limited"
                CHINA_SCAN.LAST_SEARCH_DETAIL = "Both public search providers returned HTTP 429."
                return []

            CHINA_SCAN.fetch_bing_rss = limited_fetch
            try:
                _, stats = CHINA_SCAN.run_scan(
                    config_path,
                    query_override={"source": "国聘", "query": "site:iguopin.com/job/detail 数据分析"},
                )
            finally:
                CHINA_SCAN.fetch_bing_rss = original_fetch

        self.assertEqual(stats[0]["source_status"], "rate_limited")
        self.assertIn("HTTP 429", stats[0]["source_detail"])

    def test_company_and_salary_fields_do_not_copy_javascript_shell_text(self):
        row = CHINA_SCAN.normalize_result(
            {
                "title": "数据分析师-中国电子工程设计院股份有限公司",
                "url": "https://iguopin.com/job/detail?id=116004201351354501",
                "description": "统计学相关专业，You need to enable JavaScript to run this app",
            },
            {"source": "国聘", "query": "site:iguopin.com/job/detail 数据分析"},
            "2026-08-02T00:00:00+00:00",
        )

        self.assertIsNotNone(row)
        self.assertEqual(row["company"], "中国电子工程设计院股份有限公司")
        self.assertEqual(row["salary"], "未公布或面议")

    def test_company_recruiting_index_is_not_saved_as_a_job(self):
        stats = CHINA_SCAN.empty_filter_stats()
        row = CHINA_SCAN.normalize_result(
            {
                "title": "深圳某科技有限公司招聘_最新招聘信息",
                "url": "https://jobs.51job.com/shenzhen/123456789.html",
                "description": "公司另有数据分析和统计岗位，详情请查看招聘列表。",
            },
            {"source": "前程无忧", "query": "site:jobs.51job.com 数据分析师"},
            "2026-08-02T00:00:00+00:00",
            stats,
        )

        self.assertIsNone(row)
        self.assertEqual(stats["title_not_targeted"], 1)

    def test_explicitly_stale_platform_job_is_not_saved(self):
        stats = CHINA_SCAN.empty_filter_stats()
        row = CHINA_SCAN.normalize_result(
            {
                "title": "某集团2020年校园招聘-数据分析师",
                "url": "https://jobs.51job.com/shanghai/123456789.html",
                "description": "统计学专业，经验不限。",
            },
            {"source": "前程无忧", "query": "site:jobs.51job.com 数据分析师"},
            "2026-08-02T00:00:00+00:00",
            stats,
        )

        self.assertIsNone(row)
        self.assertEqual(stats["title_not_targeted"], 1)

    def test_common_chinese_platform_salary_ranges_are_monthly(self):
        self.assertEqual(CHINA_SCAN.monthly_salary_floor_k("广州 | 1-1.5万 | 13薪"), 10)
        self.assertEqual(CHINA_SCAN.monthly_salary_floor_k("苏州 | 9千-1万"), 9)
        self.assertEqual(CHINA_SCAN.monthly_salary_floor_k("西安 | 7千-1.3万·13薪"), 7)

    def test_low_chinese_platform_salary_is_rejected(self):
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

        self.assertIsNone(row)
        self.assertEqual(stats["salary_below_20k"], 1)

    def test_parses_brave_result_without_unrelated_navigation_links(self):
        body = '''
        <a href="/images?q=test">Images</a>
        <div class="snippet abc" data-pos="0" data-type="web">
          <a href="https://www.zhipin.com/job_detail/abc.html" class="hash l1">
            <div class="title search-snippet-title hash" title="生物统计师">生物统计师</div>
          </a>
          <div class="generic-snippet hash"><div class="content desktop line-clamp-dynamic hash">
            博士，统计学相关专业，经验不限。
          </div></div>
        </div>
        '''

        rows = CHINA_SCAN.parse_brave_results(body)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["title"], "生物统计师")
        self.assertEqual(rows[0]["url"], "https://www.zhipin.com/job_detail/abc.html")
        self.assertIn("经验不限", rows[0]["description"])

    def test_parses_yahoo_result_and_decodes_redirect_url(self):
        body = '''
        <div class="dd algo algo-sr relsrch Sr">
          <a href="https://r.search.yahoo.com/x/RU=https%3a%2f%2fm.liepin.com%2fjob%2f1976592433.shtml/RK=2/RS=x">
            <h3 class="title"><span>高级<b>生物统计师</b></span></h3>
          </a>
          <div class="compText aAbs"><p>博士，<b>生物统计</b>或统计学专业。</p></div>
        </div>
        '''

        rows = CHINA_SCAN.parse_yahoo_results(body)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["title"], "高级生物统计师")
        self.assertEqual(rows[0]["url"], "https://m.liepin.com/job/1976592433.shtml")
        self.assertIn("统计学专业", rows[0]["description"])

    def test_scientific_algorithm_role_is_kept(self):
        stats = CHINA_SCAN.empty_filter_stats()
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

    def test_targeted_query_does_not_validate_unrelated_snippet(self):
        stats = CHINA_SCAN.empty_filter_stats()
        row = CHINA_SCAN.normalize_result(
            {
                "title": "研究员",
                "url": "https://www.liepin.com/job/123456.shtml",
                "description": "招聘平台仅返回截断摘要，完整职位信息待核验。",
            },
            {"source": "猎聘", "query": "site:liepin.com 生物统计"},
            "2026-08-02T00:00:00+00:00",
            stats,
        )

        self.assertIsNone(row)
        self.assertEqual(stats["title_not_targeted"], 1)

    def test_targeted_query_keeps_broad_ai_related_snippet(self):
        row = CHINA_SCAN.normalize_result(
            {
                "title": "研究员",
                "url": "https://m.liepin.com/job/123456.shtml",
                "description": "博士应届可申请，使用深度学习和统计分析解决医学影像问题。",
            },
            {"source": "猎聘", "query": "site:liepin.com 人工智能 博士"},
            "2026-08-02T00:00:00+00:00",
        )

        self.assertIsNotNone(row)
        self.assertEqual(row["track"], "Healthcare AI")

    def test_llm_mention_is_not_a_hard_filter_unless_it_is_core(self):
        optional = CHINA_SCAN.normalize_result(
            {
                "title": "数据分析师",
                "url": "https://jobs.example.cn/data-analyst",
                "description": "统计学硕士；熟悉大模型技术应用者优先；月薪 25-35K。",
            },
            {"source": "中国公司官网", "query": "数据分析"},
            "2026-08-02T00:00:00+00:00",
        )
        core = CHINA_SCAN.normalize_result(
            {
                "title": "数据科学家",
                "url": "https://jobs.example.cn/llm-scientist",
                "description": "核心工作是大语言模型与 NLP 研发，月薪 30-50K。",
            },
            {"source": "中国公司官网", "query": "数据科学"},
            "2026-08-02T00:00:00+00:00",
        )

        self.assertIsNotNone(optional)
        self.assertIsNone(core)

    def test_wrong_platform_domain_is_rejected_before_content_filter(self):
        stats = CHINA_SCAN.empty_filter_stats()
        row = CHINA_SCAN.normalize_result(
            {
                "title": "生物统计师",
                "url": "https://accountablehq.com/post/biostatistics",
                "description": "博士，统计分析。",
            },
            {"source": "猎聘", "query": "site:liepin.com 生物统计 博士"},
            "2026-08-02T00:00:00+00:00",
            stats,
        )

        self.assertIsNone(row)
        self.assertEqual(stats["source_domain_mismatch"], 1)
        self.assertEqual(stats["title_not_targeted"], 0)

    def test_platform_listing_page_is_not_treated_as_a_job(self):
        stats = CHINA_SCAN.empty_filter_stats()
        row = CHINA_SCAN.normalize_result(
            {
                "title": "生物统计招聘列表",
                "url": "https://www.liepin.com/zpshengwutongjishi/",
                "description": "生物统计岗位列表。",
            },
            {"source": "猎聘", "query": "site:liepin.com 生物统计 博士"},
            "2026-08-02T00:00:00+00:00",
            stats,
        )

        self.assertIsNone(row)
        self.assertEqual(stats["not_specific_job_page"], 1)

    def test_supported_platform_job_url_shapes(self):
        examples = {
            "BOSS直聘公开索引": "https://m.zhipin.com/job_detail/9ca6b5f59d5514bb1XJ_2t66FFc~.html",
            "猎聘": "https://m.liepin.com/job/1976592433.shtml",
            "智联招聘": "https://www.zhaopin.com/jobdetail/CC302903980J40864591507.htm",
            "拉勾": "https://www.lagou.com/wn/jobs/123456.html",
            "牛客招聘": "https://www.nowcoder.com/jobs/detail/123456",
            "国聘": "https://www.iguopin.com/job/detail?id=123456",
            "应届生求职网": "https://www.yingjiesheng.com/job-123456.html",
        }
        for source, url in examples.items():
            with self.subTest(source=source):
                self.assertIsNone(CHINA_SCAN.platform_url_rejection(url, source))

    def test_untargeted_direct_page_still_rejects_unrelated_result(self):
        stats = CHINA_SCAN.empty_filter_stats()
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
        stats = CHINA_SCAN.empty_filter_stats()
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

    def test_single_explicit_monthly_salary_is_parsed(self):
        self.assertEqual(CHINA_SCAN.monthly_salary_floor_k("数据分析师 薪资8550"), 8.55)


if __name__ == "__main__":
    unittest.main()
