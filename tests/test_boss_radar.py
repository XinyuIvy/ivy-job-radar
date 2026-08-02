import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


LEGACY_PATH = Path(__file__).with_name("_test_boss_radar_legacy.py")
SPEC = importlib.util.spec_from_file_location("_ivy_test_boss_radar_legacy", LEGACY_PATH)
assert SPEC and SPEC.loader
LEGACY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LEGACY)
BOSS_RADAR = LEGACY.BOSS_RADAR


def test_salary_is_diagnostic_and_non_salary_exclusions_remain(self):
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
    low_salary = {**base, "job_id": "low", "title": "统计建模研究员", "salary": "15-30K"}
    self.assertTrue(BOSS_RADAR.title_prefilter(low_salary))
    self.assertEqual(BOSS_RADAR.title_prefilter_reason(low_salary), "")
    self.assertTrue(BOSS_RADAR.title_prefilter({**base, "job_id": "unknown", "title": "统计建模研究员", "salary": "面议"}))

    with tempfile.TemporaryDirectory() as temporary_dir:
        root = Path(temporary_dir)
        jobs_path = root / "jobs.json"
        details_path = root / "details.json"
        jobs_path.write_text(json.dumps({"jobs": [{
            "title": "生物统计师",
            "boss_name": "示例药企",
            "salary_source": "api",
            "salary": "15-18K",
            "company_link": "https://www.zhipin.com/gongsi/company-1.html",
            "job_id": "job-low",
            "job_link": "https://www.zhipin.com/job_detail/job-low.html",
        }]}, ensure_ascii=False), encoding="utf-8")
        details_path.write_text(json.dumps([{
            "job_id": "job-low",
            "company": "示例药企",
            "jd": "负责临床试验统计分析，使用 R 和 SAS，经验不限。",
        }], ensure_ascii=False), encoding="utf-8")

        transformed = BOSS_RADAR.transform_result_files([(jobs_path, details_path)])

    self.assertEqual(len(transformed), 1)
    self.assertEqual(transformed[0]["salary"], "15-18K")
    self.assertEqual(transformed[0]["salary_min_monthly_k"], 15)


LEGACY.BossRadarTransformTest.test_salary_floor_and_hard_exclusions_control_china_retention = (
    test_salary_is_diagnostic_and_non_salary_exclusions_remain
)
BossRadarTransformTest = LEGACY.BossRadarTransformTest


if __name__ == "__main__":
    unittest.main()
