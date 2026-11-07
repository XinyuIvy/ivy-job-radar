import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import collect_raw_jobs as collector
import company_portal_scan as portals
import sync_raw_jobs as transport


class RawCollectionTests(unittest.TestCase):
    def test_envelope_preserves_source_fields_and_missing_values(self):
        row = {"jobTitle": " Senior Scientist  ", "id": "123", "description": None}
        wrapped = collector.envelope("portal", row, company="Example")
        self.assertEqual(json.loads(json.dumps(wrapped))["raw"], row)
        self.assertNotIn("score", wrapped)
        self.assertNotIn("canonical_url", wrapped)

    def test_cloud_records_keep_duplicates_and_do_not_filter_titles(self):
        rows = [{"title": "Senior Software Engineer", "url": "https://example.com/1"}] * 2
        with patch.object(collector.cloud, "fetch", return_value=json.dumps(rows).encode()):
            result = list(collector.cloud_records("2026-11-07", [("example", "https://example.com/feed")]))
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["raw"], rows[0])

    def test_raw_ats_api_keeps_original_fields_and_duplicate_rows(self):
        payload = {"jobs": [{"title": "Senior Engineer", "absolute_url": "https://example.com/1"}] * 2}
        with patch.object(portals, "fetch") as fetch, patch.object(portals, "json_payload", return_value=payload):
            result, _ = portals.api_jobs("greenhouse", "example", "https://boards.greenhouse.io/example", raw_only=True)
        self.assertEqual(result, payload["jobs"])
        self.assertEqual(len(result), 2)

    def test_upload_does_not_deduplicate_and_records_backend_counts(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "raw.json"
            receipt = Path(directory) / "receipt.json"
            rows = [collector.envelope("jobspy", {"title": "unchanged"})] * 2
            source.write_text(json.dumps(rows), encoding="utf-8")
            uploads = []

            def post(path, body):
                if path == "/api/jobs/import":
                    payload = json.loads(body)
                    if isinstance(payload, dict):
                        self.assertTrue(payload["finalize_run"])
                        return {"ok": True, "pipeline": "shared-backend-v1"}
                    uploads.extend(payload)
                    return {"ok": True, "pipeline": "shared-backend-v1", "received": 2, "created": 1, "duplicates": 1, "skipped": 1}
                return {"ok": True}

            with patch.object(transport, "post", side_effect=post):
                result = transport.sync(source, receipt)
            self.assertEqual(uploads, rows)
            self.assertEqual(result["duplicates"], 1)
            self.assertEqual(json.loads(receipt.read_text())["state"], "completed")

    def test_upload_failure_keeps_partial_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "raw.json"
            receipt = Path(directory) / "receipt.json"
            source.write_text(json.dumps([{}]), encoding="utf-8")
            with patch.object(transport, "post", side_effect=[{}, RuntimeError("failed")]):
                with self.assertRaises(RuntimeError):
                    transport.sync(source, receipt)
            self.assertEqual(json.loads(receipt.read_text())["state"], "failed")


if __name__ == "__main__":
    unittest.main()
