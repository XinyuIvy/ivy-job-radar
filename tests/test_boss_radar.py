import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
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


if __name__ == "__main__":
    unittest.main()
