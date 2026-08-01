import importlib.util
import json
import os
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "local-collector" / "boss_radar.py"
SPEC = importlib.util.spec_from_file_location("boss_radar", MODULE_PATH)
assert SPEC and SPEC.loader
BOSS_RADAR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BOSS_RADAR)

PAGE_MODULE_PATH = Path(__file__).resolve().parents[1] / "local-collector" / "boss_page_dom.py"
PAGE_SPEC = importlib.util.spec_from_file_location("boss_page_dom", PAGE_MODULE_PATH)
assert PAGE_SPEC and PAGE_SPEC.loader
BOSS_PAGE_DOM = importlib.util.module_from_spec(PAGE_SPEC)
with patch.dict("sys.modules", {"websocket": types.ModuleType("websocket")}):
    PAGE_SPEC.loader.exec_module(BOSS_PAGE_DOM)


class BossRadarTransformTest(unittest.TestCase):
    def test_render_timeout_reports_safe_page_diagnostics(self):
        class FakePage:
            def evaluate(self, expression):
                if "document.body.innerText" in expression:
                    return {
                        "url": "https://www.zhipin.com/web/geek/job?query=test&city=1",
                        "title": "BOSS Search",
                        "text": "",
                    }
                if expression.startswith("document.readyState"):
                    return False
                return {
                    "url": "https://www.zhipin.com/web/geek/job?query=test&city=1",
                    "title": "BOSS Search",
                    "ready_state": "complete",
                    "expected_selector_matches": 0,
                    "job_detail_links": 0,
                    "job_card_wrappers": 0,
                    "job_card_boxes": 0,
                    "search_results": 0,
                }

        expected = "https://www.zhipin.com/web/geek/job?query=test&city=1"
        with self.assertRaises(BOSS_PAGE_DOM.PageCollectionError) as caught:
            BOSS_PAGE_DOM.wait_for_render(
                FakePage(),
                'a[href*="/job_detail/"]',
                timeout=0,
                expected_url=expected,
            )

        message = str(caught.exception)
        self.assertIn('"expected_url_match": true', message)
        self.assertIn('"job_detail_links": 0', message)
        self.assertNotIn("text", message)

    def test_navigation_url_must_match_path_and_search_parameters(self):
        expected = "https://www.zhipin.com/web/geek/job?query=%E7%94%9F%E7%89%A9%E7%BB%9F%E8%AE%A1&city=101020100"

        self.assertTrue(BOSS_PAGE_DOM.urls_match(expected + "&page=1", expected))
        self.assertFalse(BOSS_PAGE_DOM.urls_match("https://www.zhipin.com/", expected))
        self.assertFalse(BOSS_PAGE_DOM.urls_match(
            "https://www.zhipin.com/web/geek/job?query=%E6%97%85%E6%B8%B8&city=101020100",
            expected,
        ))

    def test_city_landing_url_uses_the_public_city_page(self):
        self.assertEqual(
            BOSS_PAGE_DOM.city_landing_url("上海"),
            "https://www.zhipin.com/shanghai/",
        )

    def test_visible_search_fills_input_then_clicks_button(self):
        class FakePage:
            def __init__(self):
                self.expressions = []

            def evaluate(self, expression):
                self.expressions.append(expression)
                if "setter.call" in expression:
                    return {"ok": True}
                return {"ok": True, "method": "button"}

        page = FakePage()
        with patch.object(BOSS_PAGE_DOM.time, "sleep"):
            BOSS_PAGE_DOM.submit_visible_search(page, "生物统计")

        self.assertEqual(len(page.expressions), 2)
        self.assertIn('"生物统计"', page.expressions[0])
        self.assertIn("button.click()", page.expressions[1])

    def test_requested_keyword_cards_are_prioritized(self):
        jobs = [
            {"title": "旅游地陪", "card_text": "旅游地陪 50-150元/时"},
            {"title": "生物统计师", "card_text": "生物统计师 上海"},
        ]

        ordered = BOSS_PAGE_DOM.prioritize_jobs(jobs, "生物统计")

        self.assertEqual(ordered[0]["title"], "生物统计师")

    def test_transforms_api_rows_and_removes_recruiter_fields(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            result_dir = Path(temporary_dir)
            jobs = {"jobs": [
                {
                    "title": "生物统计师",
                    "boss_name": "示例药企",
                    "boss_title": "招聘经理",
                    "boss_active_status": "刚刚活跃",
                    "salary_source": "api",
                    "company_link": "https://www.zhipin.com/gongsi/company-1.html",
                    "location": "上海·浦东新区",
                    "skills": "R | SAS | 临床试验",
                    "job_id": "job-1",
                    "job_link": "https://www.zhipin.com/job_detail/job-1.html",
                },
                {
                    "title": "高级软件工程师",
                    "boss_name": "示例科技公司",
                    "salary_source": "api",
                    "company_link": "https://www.zhipin.com/gongsi/company-2.html",
                    "job_id": "job-2",
                    "job_link": "https://www.zhipin.com/job_detail/job-2.html",
                },
            ]}
            details = [{
                "job_id": "job-1",
                "company": "示例药企",
                "jd": "负责临床试验统计分析，使用 R 和 SAS。",
                "skill_tags": ["CDISC"],
                "boss_active_status": "刚刚活跃",
            }]
            (result_dir / "boss_jobs_20260801_1200.json").write_text(json.dumps(jobs, ensure_ascii=False), encoding="utf-8")
            (result_dir / "boss_details_20260801_1200.json").write_text(json.dumps(details, ensure_ascii=False), encoding="utf-8")

            transformed = BOSS_RADAR.transform_result_files([(
                result_dir / "boss_jobs_20260801_1200.json",
                result_dir / "boss_details_20260801_1200.json",
            )])

            self.assertEqual(len(transformed), 1)
            self.assertEqual(transformed[0]["company"], "示例药企")
            self.assertEqual(transformed[0]["track"], "Pharma")
            self.assertEqual(transformed[0]["description"], "负责临床试验统计分析，使用 R 和 SAS。")
            self.assertNotIn("boss_title", transformed[0])
            self.assertNotIn("boss_active_status", transformed[0])
            self.assertIn("R", transformed[0]["skills"])
            self.assertIn("CDISC", transformed[0]["skills"])

    def test_rejects_dom_fallback_recruiter_name_as_company(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            result_dir = Path(temporary_dir)
            jobs_path = result_dir / "boss_jobs_dom.json"
            jobs_path.write_text(json.dumps({"jobs": [{
                "title": "数据科学家",
                "boss_name": "王女士",
                "salary_source": "dom_untrusted",
                "job_id": "job-dom",
                "job_link": "https://www.zhipin.com/job_detail/job-dom.html",
            }]}, ensure_ascii=False), encoding="utf-8")

            transformed = BOSS_RADAR.transform_result_files([(jobs_path, None)])

            self.assertEqual(transformed, [])

    def test_combines_every_successful_search_file(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            result_dir = Path(temporary_dir)
            pairs = []
            for index, (job_id, title, company) in enumerate([
                ("job-1", "量化研究员", "示例量化"),
                ("job-2", "医疗咨询顾问", "示例咨询"),
            ]):
                jobs_path = result_dir / f"boss_jobs_{index}.json"
                details_path = result_dir / f"boss_details_{index}.json"
                jobs_path.write_text(json.dumps({"jobs": [{
                    "title": title,
                    "boss_name": company,
                    "salary_source": "api",
                    "company_link": f"https://www.zhipin.com/gongsi/{job_id}.html",
                    "job_id": job_id,
                    "job_link": f"https://www.zhipin.com/job_detail/{job_id}.html",
                }]}, ensure_ascii=False), encoding="utf-8")
                details_path.write_text(json.dumps([{
                    "job_id": job_id,
                    "company": company,
                    "jd": "统计建模与研究工作。",
                }], ensure_ascii=False), encoding="utf-8")
                pairs.append((jobs_path, details_path))

            transformed = BOSS_RADAR.transform_result_files(pairs)

            self.assertEqual({item["application_id"] for item in transformed}, {"job-1", "job-2"})

    def test_sync_uses_private_site_header_and_chunks_payloads(self):
        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps({"received": 1, "created": 1, "updated": 0, "skipped": 0}).encode()

        requests = []

        def fake_urlopen(request, timeout):
            requests.append((request, timeout))
            return FakeResponse()

        env = {
            "IVY_JOB_RADAR_URL": "https://example.test",
            "IVY_JOB_RADAR_SYNC_TOKEN": "sync-secret",
            "IVY_JOB_RADAR_SITES_BYPASS_TOKEN": "sites-secret",
        }
        with patch.dict(os.environ, env, clear=False), patch.object(BOSS_RADAR.urllib.request, "urlopen", side_effect=fake_urlopen):
            result = BOSS_RADAR.sync_jobs([{"application_id": str(index)} for index in range(51)])

        self.assertEqual(len(requests), 2)
        self.assertEqual(requests[0][0].get_header("Authorization"), "Bearer sync-secret")
        self.assertEqual(requests[0][0].get_header("Oai-sites-authorization"), "Bearer sites-secret")
        self.assertEqual(result["received"], 2)

    def test_searches_use_the_rendered_page_collector(self):
        class Result:
            returncode = 0

        commands = []

        def fake_run(command, check):
            commands.append(command)
            Path(command[command.index("--output") + 1]).write_text(
                json.dumps({"jobs": []}), encoding="utf-8"
            )
            Path(command[command.index("--detail-output") + 1]).write_text(
                json.dumps([]), encoding="utf-8"
            )
            return Result()

        with tempfile.TemporaryDirectory() as temporary_dir, \
                patch.object(BOSS_RADAR, "ensure_scraper", return_value=Path("/usr/bin/python3")), \
                patch.object(BOSS_RADAR, "next_batch", return_value=([("生物统计", "上海")], 0, 1)), \
                patch.object(BOSS_RADAR, "write_state"), \
                patch.object(BOSS_RADAR.subprocess, "run", side_effect=fake_run):
            outputs, ok = BOSS_RADAR.run_searches(
                Path(temporary_dir), MODULE_PATH.parent / "search-plan.json", Path(temporary_dir)
            )

        self.assertTrue(ok)
        self.assertEqual(len(outputs), 1)
        self.assertTrue(str(commands[0][1]).endswith("boss_page_dom.py"))
        self.assertNotIn("--pages", commands[0])

    def test_failed_page_search_is_not_reported_as_success(self):
        class Result:
            returncode = 1

        with tempfile.TemporaryDirectory() as temporary_dir, \
                patch.object(BOSS_RADAR, "ensure_scraper", return_value=Path("/usr/bin/python3")), \
                patch.object(BOSS_RADAR, "next_batch", return_value=([("生物统计", "上海")], 0, 1)), \
                patch.object(BOSS_RADAR, "write_state"), \
                patch.object(BOSS_RADAR.subprocess, "run", return_value=Result()):
            outputs, ok = BOSS_RADAR.run_searches(
                Path(temporary_dir), MODULE_PATH.parent / "search-plan.json", Path(temporary_dir)
            )

        self.assertFalse(ok)
        self.assertEqual(outputs, [])


if __name__ == "__main__":
    unittest.main()
