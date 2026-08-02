import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "local-collector" / "china_one_click.py"
SPEC = importlib.util.spec_from_file_location("china_one_click", MODULE_PATH)
assert SPEC and SPEC.loader
CHINA_ONE_CLICK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHINA_ONE_CLICK)


class ChinaOneClickTest(unittest.TestCase):
    def test_boss_plan_excludes_suzhou(self):
        plan = json.loads((ROOT / "local-collector" / "search-plan.json").read_text(encoding="utf-8"))

        self.assertNotIn("苏州", plan["cities"])
        self.assertEqual(len(plan["cities"]) * len(plan["keywords"]), 56)

    def test_summary_keeps_independent_source_failure(self):
        summary = CHINA_ONE_CLICK.build_summary(
            [
                {"status": "failed", "jobs_discovered": 0, "jobs_eligible": 0},
                {"status": "completed", "jobs_discovered": 20, "jobs_eligible": 3, "jobs_created": 2},
            ],
            False,
        )

        self.assertEqual(summary["status"], "partial")
        self.assertEqual(summary["sources_completed"], 1)
        self.assertEqual(summary["jobs_created"], 2)

    def test_run_all_continues_after_boss_failure(self):
        with tempfile.TemporaryDirectory() as temporary_dir, \
                patch.object(CHINA_ONE_CLICK, "REPORT_PATH", Path(temporary_dir) / "report.json"), \
                patch.object(CHINA_ONE_CLICK, "run_boss", return_value={"status": "failed", "source": "BOSS直聘"}), \
                patch.object(CHINA_ONE_CLICK, "run_public_sources", return_value={"status": "completed", "source": "中国公开索引", "jobs_created": 1}), \
                patch.object(CHINA_ONE_CLICK, "sync_scan_report", return_value={"ok": True}):
            summary = CHINA_ONE_CLICK.run_all()

        self.assertEqual(summary["status"], "partial")
        self.assertEqual(summary["jobs_created"], 1)
        self.assertTrue(summary["report_synced"])

    def test_run_all_keeps_local_report_when_website_sync_fails(self):
        with tempfile.TemporaryDirectory() as temporary_dir, \
                patch.object(CHINA_ONE_CLICK, "REPORT_PATH", Path(temporary_dir) / "report.json"), \
                patch.object(CHINA_ONE_CLICK, "run_boss", return_value={"status": "completed", "source": "BOSS直聘"}), \
                patch.object(CHINA_ONE_CLICK, "run_public_sources", return_value={"status": "completed", "source": "中国公开索引"}), \
                patch.object(CHINA_ONE_CLICK, "sync_scan_report", side_effect=RuntimeError("offline")):
            summary = CHINA_ONE_CLICK.run_all()

        self.assertFalse(summary["report_synced"])
        self.assertEqual(summary["report_sync_attention"], "offline")


if __name__ == "__main__":
    unittest.main()
