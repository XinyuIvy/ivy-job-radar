from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).resolve().parents[1] / "local-collector" / "boss_radar.py"
SPEC = importlib.util.spec_from_file_location("boss_radar", MODULE_PATH)
assert SPEC and SPEC.loader
RADAR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RADAR)

ONE_CLICK_PATH = Path(__file__).resolve().parents[1] / "local-collector" / "boss_one_click.py"
ONE_CLICK_SPEC = importlib.util.spec_from_file_location("boss_one_click", ONE_CLICK_PATH)
assert ONE_CLICK_SPEC and ONE_CLICK_SPEC.loader
ONE_CLICK = importlib.util.module_from_spec(ONE_CLICK_SPEC)
ONE_CLICK_SPEC.loader.exec_module(ONE_CLICK)


class FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return b'{"received": 1, "created": 1, "updated": 0, "skipped": 0}'


class SyncJobsTest(unittest.TestCase):
    def test_partial_boss_state_disables_source_reconciliation(self):
        self.assertEqual(
            RADAR.incomplete_boss_sources({"status": "attention_required"}),
            {"BOSS直聘（本地采集）"},
        )
        self.assertEqual(RADAR.incomplete_boss_sources({"status": "completed"}), set())

    def test_one_click_propagates_partial_state_to_sync(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            radar = mock.MagicMock()
            radar.APP_DIR = root
            radar.DEFAULT_ENV_FILE = root / "collector.env"
            radar.DEFAULT_SCRAPER_DIR = root / "scraper"
            radar.DEFAULT_PLAN = root / "plan.json"
            radar.DEFAULT_RESULT_DIR = root / "results"
            state = {
                "status": "attention_required",
                "failure": "code: 37",
                "attention_kind": "verification_required",
                "jobs_discovered": 1,
                "jobs_unique": 1,
                "jobs_filtered_before_detail": 0,
                "jobs_detail_candidates": 1,
                "completed_searches": 0,
                "planned_searches": 2,
            }
            jobs = [{"source": "BOSS直聘（本地采集）", "job_url": "https://www.zhipin.com/job_detail/1.html"}]
            radar.read_state.side_effect = [{"cursor": 0}, state]
            radar.run_searches.return_value = []
            radar.transform_result_files.return_value = jobs
            radar.incomplete_boss_sources.return_value = {"BOSS直聘（本地采集）"}
            radar.sync_jobs.return_value = {"received": 1, "created": 1, "updated": 0, "skipped": 0}
            radar.load_json.return_value = {"cities": ["上海"], "keywords": ["统计"]}

            with mock.patch.object(ONE_CLICK, "load_radar", return_value=radar):
                ONE_CLICK.run_scan()

        radar.sync_jobs.assert_called_once_with(
            jobs,
            incomplete_sources={"BOSS直聘（本地采集）"},
        )
        radar.record_synced_jobs.assert_not_called()

    def test_incomplete_source_imports_jobs_without_expiration_reconciliation(self):
        requests = []

        def fake_urlopen(request, timeout=0):
            requests.append(json.loads(request.data.decode("utf-8")))
            return FakeResponse()

        jobs = [
            {"source": "国聘", "job_url": "https://iguopin.com/job/detail?id=1"},
            {"source": "猎聘", "job_url": "https://liepin.com/job/1.shtml"},
        ]
        environment = {
            "IVY_JOB_RADAR_URL": "https://example.test",
            "IVY_JOB_RADAR_SYNC_TOKEN": "test-token",
            "IVY_JOB_RADAR_SITES_BYPASS_TOKEN": "test-sites-token",
        }
        with mock.patch.dict(os.environ, environment, clear=False), mock.patch.object(
            RADAR.urllib.request, "urlopen", side_effect=fake_urlopen
        ):
            RADAR.sync_jobs(jobs, incomplete_sources={"国聘"})

        reconciled_sources = [
            payload.get("complete_source")
            for payload in requests
            if isinstance(payload, dict) and payload.get("complete_source")
        ]
        self.assertEqual(reconciled_sources, ["猎聘"])
        self.assertTrue(any(isinstance(payload, list) for payload in requests))


class PartialBossScanTest(unittest.TestCase):
    def test_code_37_is_classified_as_verification_required(self):
        kind, detail = RADAR.classify_boss_interruption(
            "BOSS 登录状态检测失败：code: 37; 您的环境存在异常。"
        )

        self.assertEqual(kind, "verification_required")
        self.assertIn("保留本轮已完成的搜索结果", detail)

    def test_completed_lists_are_salvaged_when_a_later_query_is_blocked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result_dir = root / "results"
            plan_path = root / "plan.json"
            plan_path.write_text('{"pages": 1}', encoding="utf-8")
            calls = {"lists": 0}
            states = []

            def fake_run(command, **kwargs):
                if "--no-detail" in command:
                    calls["lists"] += 1
                    if calls["lists"] == 1:
                        output = Path(command[command.index("--output") + 1])
                        output.write_text('{"jobs": [{"job_id": "1"}]}', encoding="utf-8")
                        return subprocess.CompletedProcess(command, 0, "", "")
                    return subprocess.CompletedProcess(
                        command,
                        1,
                        "code: 37; 您的环境存在异常。",
                        "",
                    )
                details = Path(command[command.index("--detail-output") + 1])
                details.write_text('{"details": []}', encoding="utf-8")
                return subprocess.CompletedProcess(command, 0, "", "")

            stats = {
                "jobs_discovered": 1,
                "jobs_unique": 1,
                "jobs_detail_candidates": 1,
                "jobs_filtered_before_detail": 0,
                "jobs_skipped_cached": 0,
                "jobs_duplicate_listings": 0,
                "rejection_reasons": {},
                "review_counts": {},
            }
            patches = (
                mock.patch.object(RADAR, "ensure_scraper", return_value=root / "python"),
                mock.patch.object(
                    RADAR,
                    "next_batch",
                    return_value=([("生物统计", "上海"), ("统计科学家", "上海")], 0, 2),
                ),
                mock.patch.object(
                    RADAR,
                    "collect_detail_candidates",
                    return_value=([{"job_id": "1"}], stats),
                ),
                mock.patch.object(RADAR.subprocess, "run", side_effect=fake_run),
                mock.patch.object(RADAR, "write_state", side_effect=states.append),
            )
            with patches[0], patches[1], patches[2], patches[3], patches[4]:
                outputs = RADAR.run_searches(root / "scraper", plan_path, result_dir)

        self.assertEqual(len(outputs), 1)
        self.assertEqual(states[-1]["status"], "attention_required")
        self.assertEqual(states[-1]["attention_kind"], "verification_required")


if __name__ == "__main__":
    unittest.main()
