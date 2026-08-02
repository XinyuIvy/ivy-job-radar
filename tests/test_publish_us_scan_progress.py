from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "publish_us_scan_progress.py"
SPEC = importlib.util.spec_from_file_location("publish_us_scan_progress", MODULE_PATH)
assert SPEC and SPEC.loader
PROGRESS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROGRESS)


class PublishUsScanProgressTests(unittest.TestCase):
    def test_metrics_use_only_current_run_outputs(self):
        with tempfile.TemporaryDirectory() as directory:
            scan_dir = Path(directory)
            marker = scan_dir / "marker"
            stale = scan_dir / "us_jobs_verified_latest.json"
            stale.write_text(json.dumps([{"job_url": "https://example.com/stale"}]), encoding="utf-8")
            marker.write_text("started", encoding="utf-8")
            current = scan_dir / "cloud_sources_jobs_latest.json"
            current.write_text(
                json.dumps([
                    {"job_url": "https://example.com/a"},
                    {"job_url": "https://example.com/a"},
                    {"job_url": "https://example.com/b"},
                ]),
                encoding="utf-8",
            )
            (scan_dir / "cloud_sources_summary.json").write_text(
                json.dumps({"sources": [{"scanned": 7}]}),
                encoding="utf-8",
            )

            original_marker = PROGRESS.RUN_MARKER
            PROGRESS.RUN_MARKER = marker
            try:
                result = PROGRESS.metrics(scan_dir)
            finally:
                PROGRESS.RUN_MARKER = original_marker

            self.assertEqual(result["scanned"], 7)
            self.assertEqual(result["unique_jobs"], 2)
            self.assertEqual(result["filtered"], 5)


if __name__ == "__main__":
    unittest.main()
