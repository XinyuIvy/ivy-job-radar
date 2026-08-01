from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "local-collector" / "jd_inbox_server.py"
SPEC = importlib.util.spec_from_file_location("jd_inbox_server", MODULE_PATH)
assert SPEC and SPEC.loader
SERVER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVER)


class JdInboxServerTests(unittest.TestCase):
    def test_saves_capture_without_credentials_or_cookies(self) -> None:
        payload = {
            "title": "生物统计师",
            "company": "示例药企",
            "url": "https://example.cn/jobs/1",
            "description": "博士，R，SAS",
        }
        with tempfile.TemporaryDirectory() as directory:
            path = SERVER.save_capture(payload, Path(directory))
            saved = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(saved["title"], payload["title"])
        self.assertIn("capturedAt", saved)
        self.assertNotIn("cookie", saved)


if __name__ == "__main__":
    unittest.main()
