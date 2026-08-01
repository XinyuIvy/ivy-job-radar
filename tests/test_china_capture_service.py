from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


MODULE_PATH = Path(__file__).resolve().parents[1] / "local-collector" / "china_capture_service.py"
SPEC = importlib.util.spec_from_file_location("china_capture_service", MODULE_PATH)
assert SPEC and SPEC.loader
SERVICE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVICE)


class FakeResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


class ChinaCaptureServiceTests(unittest.TestCase):
    def importer(self) -> SimpleNamespace:
        def exclusion(title: str) -> str:
            return "excluded_title:高级" if "高级" in title else ""

        def normalize(payload: dict[str, object], imported_at: str, source: str) -> dict[str, object]:
            return {
                "company": payload["company"],
                "title": payload["title"],
                "location": "上海",
                "region": "中国",
                "track": "Pharma",
                "score": 82,
                "visa": "不适用",
                "evidence": source,
                "skills": ["R", "SAS"],
                "job_url": payload["url"],
                "canonical_url": payload["url"],
                "application_id": "",
                "source": "BOSS直聘·人工捕获",
                "full_description": payload["description"],
                "status": "已捕获完整JD",
                "discovered_at": imported_at,
                "checked_at": imported_at,
            }

        return SimpleNamespace(title_exclusion_reason=exclusion, normalize=normalize)

    def test_maps_full_description_to_website_description(self) -> None:
        payload = {
            "title": "生物统计师",
            "company": "示例药企",
            "url": "https://www.zhipin.com/job_detail/abc.html",
            "description": "要求博士学历，熟悉 R、SAS 和临床试验。",
        }
        job, reason = SERVICE.normalized_job(payload, self.importer())
        self.assertEqual(reason, "")
        assert job is not None
        self.assertEqual(job["description"], payload["description"])
        self.assertNotIn("full_description", job)

    def test_excluded_title_is_not_uploaded(self) -> None:
        payload = {
            "title": "高级生物统计师",
            "company": "示例药企",
            "url": "https://www.zhipin.com/job_detail/senior.html",
            "description": "要求博士学历，熟悉 R、SAS 和临床试验。",
        }
        job, reason = SERVICE.normalized_job(payload, self.importer())
        self.assertIsNone(job)
        self.assertEqual(reason, "excluded_title:高级")

    def test_callback_uploads_only_normalized_job_fields(self) -> None:
        requests = []

        def opener(request: object, timeout: int) -> FakeResponse:
            requests.append((request, timeout))
            return FakeResponse({"ok": True, "received": 1, "created": 1, "updated": 0, "skipped": 0})

        config = {"base_url": "https://example.test", "sync_token": "sync", "sites_token": "sites"}
        payload = {
            "title": "生物统计师",
            "company": "示例药企",
            "url": "https://www.zhipin.com/job_detail/abc.html",
            "description": "要求博士学历，熟悉 R、SAS 和临床试验。",
            "cookie": "must-not-upload",
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            callback = SERVICE.make_capture_callback(self.importer(), config, root / "state.json", opener)
            result = callback(payload, root / "capture.json")
            state = json.loads((root / "state.json").read_text(encoding="utf-8"))
        self.assertTrue(result["synced"])
        self.assertEqual(len(requests), 1)
        body = json.loads(requests[0][0].data.decode("utf-8"))
        self.assertEqual(len(body), 1)
        self.assertNotIn("cookie", body[0])
        self.assertEqual(body[0]["description"], payload["description"])
        self.assertIn("capture.json", state["files"])


if __name__ == "__main__":
    unittest.main()
