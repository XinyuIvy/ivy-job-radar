from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "validate_china_platform_scan.py"
SPEC = importlib.util.spec_from_file_location("validate_china_platform_scan", MODULE_PATH)
assert SPEC and SPEC.loader
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)


class ChinaPlatformValidationTest(unittest.TestCase):
    def validate_summary(self, status: str, policy: str = "allow-limited") -> list[str]:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            summary = {
                "all_counts_reconcile": True,
                "sources": [{
                    "source": "牛客招聘",
                    "query": "site:nowcoder.com/jobs/detail 数据分析师",
                    "scanned": 7,
                    "valid_platform_urls": 7,
                    "matched": 0,
                    "accounted_for": True,
                    "source_status": status,
                }],
            }
            summary_path = root / "summary.json"
            jobs_path = root / "jobs.json"
            summary_path.write_text(json.dumps(summary), encoding="utf-8")
            jobs_path.write_text("[]", encoding="utf-8")
            return VALIDATOR.validate(summary_path, jobs_path, minimum_matched=1, availability_policy=policy)

    def test_partial_results_from_limited_source_do_not_fail_recall_threshold(self):
        self.assertEqual(self.validate_summary("rate_limited"), [])

    def test_healthy_source_still_has_to_meet_configured_recall_threshold(self):
        errors = self.validate_summary("ok")
        self.assertTrue(any("Expected at least 1 relevant job" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
