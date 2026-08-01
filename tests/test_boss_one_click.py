import importlib.util
import tempfile
import unittest
from pathlib import Path


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
        self.assertIn("boss_one_click.py' run", content)
        self.assertIn("Press Return to close", content)

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


if __name__ == "__main__":
    unittest.main()
