from __future__ import annotations

import importlib.util
import json
import os
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).resolve().parents[1] / "local-collector" / "boss_radar.py"
SPEC = importlib.util.spec_from_file_location("boss_radar", MODULE_PATH)
assert SPEC and SPEC.loader
RADAR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RADAR)


class FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return b'{"received": 1, "created": 1, "updated": 0, "skipped": 0}'


class SyncJobsTest(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
