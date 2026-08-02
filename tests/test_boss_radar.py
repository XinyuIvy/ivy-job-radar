import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "local-collector" / "boss_radar.py"
SPEC = importlib.util.spec_from_file_location("boss_radar", MODULE_PATH)
assert SPEC and SPEC.loader
BOSS_RADAR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BOSS_RADAR)


class BossRadarTransformTest(unittest.TestCase):
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
                    "salary": "20-30K·13薪",
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
                    "salary": "30-45K",
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
                    "salary": "25-35K",
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

    def test_keeps_scientific_algorithm_role_found_by_biostatistics_search(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            result_dir = Path(temporary_dir)
            jobs_path = result_dir / "boss_jobs_algorithm.json"
            details_path = result_dir / "boss_details_algorithm.json"
            jobs_path.write_text(json.dumps({"jobs": [{
                "title": "创新算法研究员",
                "boss_name": "示例生命科学公司",
                "salary_source": "api",
                "salary": "20-30K",
                "company_link": "https://www.zhipin.com/gongsi/algorithm.html",
                "job_id": "algorithm-1",
                "job_link": "https://www.zhipin.com/job_detail/algorithm-1.html",
            }]}, ensure_ascii=False), encoding="utf-8")
            details_path.write_text(json.dumps([{
                "job_id": "algorithm-1",
                "company": "示例生命科学公司",
                "jd": "使用 Python 开展 AI for Science、生物信息和新药研发算法研究，接受博士申请。",
            }], ensure_ascii=False), encoding="utf-8")

            transformed = BOSS_RADAR.transform_result_files([(jobs_path, details_path)])

            self.assertEqual(len(transformed), 1)
            self.assertEqual(transformed[0]["title"], "创新算法研究员")

    def test_rejects_unrelated_algorithm_role(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            result_dir = Path(temporary_dir)
            jobs_path = result_dir / "boss_jobs_recommendation.json"
            details_path = result_dir / "boss_details_recommendation.json"
            jobs_path.write_text(json.dumps({"jobs": [{
                "title": "算法研究员",
                "boss_name": "示例互联网公司",
                "salary_source": "api",
                "salary": "25-40K",
                "company_link": "https://www.zhipin.com/gongsi/recommendation.html",
                "job_id": "algorithm-2",
                "job_link": "https://www.zhipin.com/job_detail/algorithm-2.html",
            }]}, ensure_ascii=False), encoding="utf-8")
            details_path.write_text(json.dumps([{
                "job_id": "algorithm-2",
                "company": "示例互联网公司",
                "jd": "负责推荐算法与广告算法优化。",
            }], ensure_ascii=False), encoding="utf-8")

            transformed = BOSS_RADAR.transform_result_files([(jobs_path, details_path)])

            self.assertEqual(transformed, [])

    def test_prefilters_deduplicates_and_skips_unchanged_cached_jobs(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            first = root / "first.json"
            second = root / "second.json"
            cache_path = root / "cache.json"

            relevant = {
                "title": "生物统计师",
                "boss_name": "示例药企",
                "salary_source": "api",
                "salary": "30-50K",
                "company_link": "https://www.zhipin.com/gongsi/company-1.html",
                "job_id": "job-1",
                "job_link": "https://www.zhipin.com/job_detail/job-1.html",
            }
            cached = {
                "title": "数据科学家",
                "boss_name": "示例科技公司",
                "salary_source": "api",
                "salary": "25-40K",
                "company_link": "https://www.zhipin.com/gongsi/company-2.html",
                "job_id": "job-2",
                "job_link": "https://www.zhipin.com/job_detail/job-2.html",
            }
            irrelevant = {
                "title": "资深数据科学家",
                "boss_name": "示例科技公司",
                "salary_source": "api",
                "salary": "20-30K",
                "company_link": "https://www.zhipin.com/gongsi/company-3.html",
                "job_id": "job-3",
                "job_link": "https://www.zhipin.com/job_detail/job-3.html",
            }
            first.write_text(
                json.dumps({"jobs": [relevant, cached, irrelevant]}, ensure_ascii=False),
                encoding="utf-8",
            )
            second.write_text(
                json.dumps({"jobs": [relevant]}, ensure_ascii=False),
                encoding="utf-8",
            )
            cache_path.write_text(json.dumps({
                "version": 1,
                "jobs": {
                    "job-2": {"fingerprint": BOSS_RADAR.listing_fingerprint(cached)}
                },
            }), encoding="utf-8")

            candidates, stats = BOSS_RADAR.collect_detail_candidates(
                [first, second],
                cache_path=cache_path,
            )

        self.assertEqual([BOSS_RADAR.row_key(row) for row in candidates], ["job-1"])
        self.assertEqual(stats["jobs_discovered"], 4)
        self.assertEqual(stats["jobs_duplicate_listings"], 1)
        self.assertEqual(stats["jobs_filtered_before_detail"], 1)
        self.assertEqual(stats["jobs_skipped_cached"], 1)
        self.assertEqual(stats["jobs_detail_candidates"], 1)

    def test_run_searches_collects_lists_before_one_detail_pass(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            scraper_dir = root / "scraper"
            result_dir = root / "results"
            plan_path = root / "plan.json"
            state_path = root / "state.json"
            plan_path.write_text(json.dumps({"pages": 1}), encoding="utf-8")
            candidate = {
                "title": "生物统计师",
                "boss_name": "示例药企",
                "salary_source": "api",
                "salary": "25-35K",
                "company_link": "https://www.zhipin.com/gongsi/company-1.html",
                "job_id": "job-1",
                "job_link": "https://www.zhipin.com/job_detail/job-1.html",
            }
            commands = []

            def fake_run(command, check=False):
                commands.append(command)
                if "--input" in command:
                    detail_path = Path(command[command.index("--detail-output") + 1])
                    detail_path.write_text(json.dumps([{
                        "job_id": "job-1",
                        "company": "示例药企",
                        "jd": "负责临床试验统计分析。",
                    }], ensure_ascii=False), encoding="utf-8")
                return SimpleNamespace(returncode=0)

            stats = {
                "jobs_discovered": 60,
                "jobs_unique": 30,
                "jobs_duplicate_listings": 30,
                "jobs_filtered_before_detail": 20,
                "jobs_skipped_cached": 9,
                "jobs_detail_candidates": 1,
            }
            with patch.object(BOSS_RADAR, "APP_DIR", root / "app"), \
                    patch.object(BOSS_RADAR, "STATE_FILE", state_path), \
                    patch.object(BOSS_RADAR, "ensure_scraper", return_value=Path("/python")), \
                    patch.object(BOSS_RADAR, "next_batch", return_value=([
                        ("生物统计", "上海"),
                        ("数据科学家", "上海"),
                    ], 0, 2)), \
                    patch.object(BOSS_RADAR, "collect_detail_candidates", return_value=([candidate], stats)), \
                    patch.object(BOSS_RADAR.subprocess, "run", side_effect=fake_run):
                outputs = BOSS_RADAR.run_searches(scraper_dir, plan_path, result_dir)

            state = json.loads(state_path.read_text(encoding="utf-8"))

        self.assertEqual(len(outputs), 1)
        self.assertEqual(len(commands), 3)
        self.assertTrue(all("--no-detail" in command for command in commands[:2]))
        self.assertIn("--input", commands[2])
        self.assertEqual(state["status"], "completed")
        self.assertEqual(state["jobs_detail_candidates"], 1)

    def test_records_cache_only_for_synced_jobs(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            jobs_path = root / "jobs.json"
            cache_path = root / "cache.json"
            row = {
                "title": "生物统计师",
                "boss_name": "示例药企",
                "salary_source": "api",
                "salary": "25-35K",
                "company_link": "https://www.zhipin.com/gongsi/company-1.html",
                "job_id": "job-1",
                "job_link": "https://www.zhipin.com/job_detail/job-1.html",
            }
            jobs_path.write_text(json.dumps({"jobs": [row]}, ensure_ascii=False), encoding="utf-8")

            BOSS_RADAR.record_synced_jobs(
                [{"application_id": "job-1"}],
                [(jobs_path, None)],
                cache_path=cache_path,
            )
            cache = json.loads(cache_path.read_text(encoding="utf-8"))

        self.assertEqual(
            cache["jobs"]["job-1"]["fingerprint"],
            BOSS_RADAR.listing_fingerprint(row),
        )

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

    def test_salary_floor_and_hard_exclusions_control_china_retention(self):
        self.assertEqual(BOSS_RADAR.monthly_salary_floor_k("20-30K·13薪"), 20)
        self.assertEqual(BOSS_RADAR.monthly_salary_floor_k("30-50万/年"), 25)
        self.assertEqual(BOSS_RADAR.monthly_salary_floor_k("15000-30000元/月"), 15)
        self.assertIsNone(BOSS_RADAR.monthly_salary_floor_k("面议"))
        self.assertIsNone(BOSS_RADAR.required_experience("经验不限"))
        self.assertEqual(BOSS_RADAR.required_experience("要求 5 年相关经验"), 5)

        base = {
            "boss_name": "示例公司",
            "salary_source": "api",
            "company_link": "https://www.zhipin.com/gongsi/example.html",
            "job_link": "https://www.zhipin.com/job_detail/example.html",
            "salary": "20-30K",
        }
        self.assertTrue(BOSS_RADAR.title_prefilter({**base, "job_id": "ok", "title": "统计建模研究员"}))
        self.assertFalse(BOSS_RADAR.title_prefilter({**base, "job_id": "intern", "title": "生物统计实习生"}))
        self.assertFalse(BOSS_RADAR.title_prefilter({**base, "job_id": "senior", "title": "资深统计科学家"}))
        self.assertFalse(BOSS_RADAR.title_prefilter({**base, "job_id": "eng", "title": "算法工程师"}))
        self.assertFalse(BOSS_RADAR.title_prefilter({**base, "job_id": "low", "title": "统计建模研究员", "salary": "15-30K"}))
        self.assertTrue(BOSS_RADAR.title_prefilter({**base, "job_id": "unknown", "title": "统计建模研究员", "salary": "面议"}))
        self.assertEqual(
            BOSS_RADAR.title_prefilter_reason({**base, "job_id": "low", "title": "统计建模研究员", "salary": "15-30K"}),
            "salary_below_20k",
        )
        self.assertTrue(BOSS_RADAR.title_prefilter({**base, "job_id": "postdoc", "title": "生物统计博士后"}))

    def test_sync_reports_a_completed_source_for_expiration_reconciliation(self):
        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps({"received": 1, "created": 0, "updated": 1, "skipped": 0}).encode()

        requests = []

        def fake_urlopen(request, timeout):
            requests.append(request)
            return FakeResponse()

        env = {
            "IVY_JOB_RADAR_URL": "https://example.test",
            "IVY_JOB_RADAR_SYNC_TOKEN": "sync-secret",
            "IVY_JOB_RADAR_SITES_BYPASS_TOKEN": "sites-secret",
        }
        job = {
            "source": "BOSS直聘（本地采集）",
            "job_url": "https://example.test/job/1",
            "canonical_url": "https://example.test/job/1",
        }
        with patch.dict(os.environ, env, clear=False), patch.object(BOSS_RADAR.urllib.request, "urlopen", side_effect=fake_urlopen):
            BOSS_RADAR.sync_jobs([job], completed_source="BOSS直聘（本地采集）")

        self.assertEqual(len(requests), 2)
        reconciliation = json.loads(requests[-1].data.decode("utf-8"))
        self.assertEqual(reconciliation["complete_source"], "BOSS直聘（本地采集）")
        self.assertEqual(reconciliation["seen_urls"], ["https://example.test/job/1"])


if __name__ == "__main__":
    unittest.main()
