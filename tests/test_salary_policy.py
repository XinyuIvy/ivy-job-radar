import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
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

    def test_public_filter_stats_have_no_salary_rejection_lane(self):
        scanner = load_module(
            "ivy_china_salary_policy_test",
            ROOT / "scripts" / "china_scan.py",
        )
        self.assertNotIn("salary_below_20k", scanner.empty_filter_stats())

    def test_website_import_has_no_salary_gate(self):
        route = (ROOT / "app" / "api" / "jobs" / "import" / "route.ts").read_text(encoding="utf-8")
        self.assertNotIn("function monthlySalaryFloorK", route)
        self.assertNotIn("salaryFloor >= 20", route)
        self.assertNotIn("salaryFloor < 20", route)


if __name__ == "__main__":
    unittest.main()
