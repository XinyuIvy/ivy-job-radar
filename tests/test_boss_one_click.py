import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "local-collector" / "boss_one_click.py"
SPEC = importlib.util.spec_from_file_location("boss_one_click", MODULE_PATH)
assert SPEC and SPEC.loader
BOSS_ONE_CLICK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BOSS_ONE_CLICK)


class BossOneClickTest(unittest.TestCase):
    def test_summary_reports_progress_and_sync_outcome(self):
        state = {
            "status": "completed",
            "last_run_id": "run-1",
            "planned_searches": 8,
            "completed_searches": 8,
            "combination_count": 64,
            "cursor": 24,
            "failure": "",
        }
        result = {"created": 3, "updated": 2, "skipped": 1}

        summary = BOSS_ONE_CLICK.build_summary(state, 30, 6, result, False)

        self.assertEqual(summary["searches_remaining_in_cycle"], 40)
        self.assertEqual(summary["jobs_excluded_or_incomplete"], 24)
        self.assertEqual(summary["jobs_created"], 3)
        self.assertEqual(summary["jobs_updated_or_duplicate"], 3)

    def test_summary_recognizes_completed_cycle(self):
        summary = BOSS_ONE_CLICK.build_summary(
            {
                "status": "completed",
                "planned_searches": 8,
                "completed_searches": 8,
                "combination_count": 64,
                "cursor": 0,
            },
            0,
            0,
            {},
            False,
        )

        self.assertTrue(summary["cycle_completed"])
        self.assertEqual(summary["searches_remaining_in_cycle"], 0)

    def test_launcher_quotes_repository_path(self):
        content = BOSS_ONE_CLICK.launcher_content(Path("/Users/ivy/My Projects/ivy-job-radar"))

        self.assertIn("cd '/Users/ivy/My Projects/ivy-job-radar'", content)
        self.assertIn("china_one_click.py' run", content)
        self.assertIn("China multi-source scan", content)\n        self.assertIn("Press Return to close", content)

    def test_save_summary_persists_latest_report(self):
        class FakeRadar:
            def __init__(self, app_dir):
                self.APP_DIR = app_dir
                self.saved_state = None

            def write_state(self, state):
                self.saved_state = state

        with tempfile.TemporaryDirectory() as temporary_dir:
            radar = FakeRadar(Path(temporary_dir))
            state = {"cursor": 8}
            summary = {"status": "completed", "jobs_created": 1}

            report = BOSS_ONE_CLICK.save_summary(radar, state, summary)

            self.assertTrue(report.exists())
            self.assertEqual(radar.saved_state["last_summary"], summary)

    def test_sync_failure_rewinds_search_cursor(self):
        class FakeRadar:
            APP_DIR = Path("/tmp/ivy-test")
            DEFAULT_ENV_FILE = Path("env")
            DEFAULT_SCRAPER_DIR = Path("scraper")
            DEFAULT_PLAN = Path("plan")
            DEFAULT_RESULT_DIR = Path("results")

            def __init__(self):
                self.states = [{"cursor": 16}, {"cursor": 24, "status": "completed", "completed_searches": 8}]
                self.saved = None

            def load_env(self, _path):
                return None

            def read_state(self):
                return dict(self.states.pop(0)) if self.states else dict(self.saved)

            def run_searches(self, *_args):
                return []

            def transform_result_files(self, _files):
                return [{"application_id": "job-1"}]

            def sync_jobs(self, _jobs):
                raise SystemExit("website unavailable")

            def load_json(self, _path):
                return {"cities": ["上海"], "keywords": ["生物统计"]}

            def write_state(self, state):
                self.saved = dict(state)

        fake = FakeRadar()
        with patch.object(BOSS_ONE_CLICK, "load_radar", return_value=fake), \
                patch.object(BOSS_ONE_CLICK, "count_raw_rows", return_value=1), \
                patch.object(BOSS_ONE_CLICK, "save_summary", side_effect=lambda radar, state, summary: radar.write_state(state) or Path("report")):
            summary = BOSS_ONE_CLICK.run_scan()

        self.assertEqual(fake.saved["cursor"], 16)
        self.assertEqual(summary["status"], "attention_required")
        self.assertIn("website unavailable", summary["attention"])


if __name__ == "__main__":
    unittest.main()
