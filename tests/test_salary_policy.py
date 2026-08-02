import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_module(name: str, module_path: Path):
    spec = importlib.util.spec_from_file_location(name, module_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class SalaryPolicyTests(unittest.TestCase):
    def test_company_portal_keeps_low_salary_role(self):
        scanner = load_module(
            "ivy_company_portal_salary_policy_test",
            ROOT / "scripts" / "company_portal_scan.py",
        )
        eligible, salary_floor = scanner.china_job_eligible(
            "数据科学家",
            "统计学博士，经验不限，使用 Python 开展医疗数据分析。",
            "15-18K",
        )
        self.assertTrue(eligible)
        self.assertEqual(salary_floor, 15)

    def test_no_salary_rejection_keys_or_thresholds_remain(self):
        paths = [
            ROOT / "local-collector" / "boss_radar.py",
            ROOT / "scripts" / "china_scan.py",
            ROOT / "scripts" / "company_portal_scan.py",
            ROOT / "app" / "api" / "jobs" / "import" / "route.ts",
            ROOT / "app" / "job-radar.tsx",
        ]
        combined = "\n".join(item.read_text(encoding="utf-8") for item in paths)
        retired_key = "salary_" + "below_20k"
        retired_threshold = "salary_floor" + r"[^\n]*(?:<\s*20|>=\s*20)"
        retired_copy = "工资下限" + "不足 20K"
        self.assertNotIn(retired_key, combined)
        self.assertNotRegex(combined, retired_threshold)
        self.assertNotIn(retired_copy, combined)


if __name__ == "__main__":
    unittest.main()
