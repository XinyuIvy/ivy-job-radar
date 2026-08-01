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
            "description": "要求博士学历，熟悉 R、SAS、临床试验设计以及统计编程。",
        }
        self.assertIsNone(SERVER.capture_error(payload))
        with tempfile.TemporaryDirectory() as directory:
            path = SERVER.save_capture(payload, Path(directory))
            saved = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(saved["title"], payload["title"])
        self.assertIn("capturedAt", saved)
        self.assertNotIn("cookie", saved)

    def test_rejects_boss_search_page_capture(self) -> None:
        payload = {
            "title": "生物统计总监",
            "url": "https://www.zhipin.com/web/geek/jobs?query=生物统计",
            "description": "这是从整个搜索结果页面误抓取的足够长文本，不应该被本地接收器保存。",
        }
        self.assertEqual(
            SERVER.capture_error(payload),
            "BOSS capture requires a stable job-detail URL",
        )

    def test_rejects_install_page_and_incomplete_description(self) -> None:
        self.assertEqual(
            SERVER.capture_error(
                {
                    "title": "Ivy Job Radar JD 捕获",
                    "url": "file:///tmp/bookmarklets.html",
                    "description": "安装说明",
                }
            ),
            "capture requires a complete job description",
        )


if __name__ == "__main__":
    unittest.main()
