import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "local-collector" / "china_scan_agent.py"
SPEC = importlib.util.spec_from_file_location("china_scan_agent", MODULE_PATH)
assert SPEC and SPEC.loader
AGENT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AGENT)


class ChinaScanAgentTest(unittest.TestCase):
    def test_summary_explains_how_to_resume_after_verification(self):
        state, message = AGENT.summarize_report({
            "status": "partial",
            "jobs_discovered": 12,
            "jobs_eligible": 3,
            "jobs_created": 1,
            "sources_failed": 1,
            "results": [{"attention_kind": "verification_required"}],
        })

        self.assertEqual(state, "attention_required")
        self.assertIn("专用 Chrome", message)
        self.assertIn("再点一次更新中国岗位", message)

    def test_poll_claims_queued_request_and_runs_it(self):
        responses = [
            {"state": "queued", "requestId": "request-1"},
            {"claimed": True},
        ]
        with patch.object(AGENT, "request_json", side_effect=responses) as request_json, \
                patch.object(AGENT, "refresh_repository", return_value=False) as refresh_repository, \
                patch.object(AGENT, "run_request") as run_request:
            handled = AGENT.poll_once(ROOT)

        self.assertTrue(handled)
        refresh_repository.assert_called_once_with(ROOT)
        request_json.assert_any_call("/api/china-scan-control", {
            "action": "claim",
            "request_id": "request-1",
        })
        run_request.assert_called_once_with(ROOT, "request-1")

    def test_poll_restarts_before_claim_when_agent_was_updated(self):
        with patch.object(
            AGENT,
            "request_json",
            return_value={"state": "queued", "requestId": "request-1"},
        ) as request_json, patch.object(
            AGENT,
            "refresh_repository",
            return_value=True,
        ), patch.object(
            AGENT,
            "restart_updated_agent",
            side_effect=SystemExit,
        ) as restart_updated_agent:
            with self.assertRaises(SystemExit):
                AGENT.poll_once(ROOT)

        restart_updated_agent.assert_called_once_with()
        request_json.assert_called_once_with("/api/china-scan-control")

    def test_poll_ignores_idle_control(self):
        with patch.object(AGENT, "request_json", return_value={"state": "idle", "requestId": ""}), \
                patch.object(AGENT, "run_request") as run_request:
            handled = AGENT.poll_once(ROOT)

        self.assertFalse(handled)
        run_request.assert_not_called()

    def test_request_uses_private_headers(self):
        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps({"state": "idle"}).encode()

        captured = []

        def fake_urlopen(request, timeout):
            captured.append((request, timeout))
            return FakeResponse()

        environment = {
            "IVY_JOB_RADAR_URL": "https://example.test",
            "IVY_JOB_RADAR_SYNC_TOKEN": "sync-secret",
            "IVY_JOB_RADAR_SITES_BYPASS_TOKEN": "sites-secret",
        }
        with patch.dict(os.environ, environment, clear=False), \
                patch.object(AGENT.urllib.request, "urlopen", side_effect=fake_urlopen):
            result = AGENT.request_json("/api/china-scan-control")

        self.assertEqual(result["state"], "idle")
        self.assertEqual(captured[0][0].get_header("Authorization"), "Bearer sync-secret")
        self.assertEqual(captured[0][0].get_header("Oai-sites-authorization"), "Bearer sites-secret")

    def test_install_removes_obsolete_desktop_launcher(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            home = Path(temporary_dir)
            launcher = home / "Desktop" / "一键扫描BOSS.command"
            launcher.parent.mkdir(parents=True)
            launcher.write_text("old", encoding="utf-8")
            env_file = home / "collector.env"
            env_file.write_text("configured", encoding="utf-8")
            fake_script = home / "china_scan_agent.py"
            fake_script.write_text("# agent", encoding="utf-8")

            with patch.object(AGENT, "APP_DIR", home / ".ivy-job-radar"), \
                    patch.object(AGENT.Path, "home", return_value=home), \
                    patch.object(AGENT.sys, "platform", "darwin"), \
                    patch.object(AGENT.sys, "executable", "/usr/bin/python3"), \
                    patch.object(AGENT.subprocess, "run"), \
                    patch.object(AGENT.Path, "resolve", return_value=fake_script):
                AGENT.install(ROOT, env_file)

            self.assertFalse(launcher.exists())


if __name__ == "__main__":
    unittest.main()
