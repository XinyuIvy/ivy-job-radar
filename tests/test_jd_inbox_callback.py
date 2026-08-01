from __future__ import annotations

import importlib.util
import json
import tempfile
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "local-collector" / "jd_inbox_server.py"
SPEC = importlib.util.spec_from_file_location("jd_inbox_server_callback", MODULE_PATH)
assert SPEC and SPEC.loader
SERVER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVER)


class JdInboxCallbackTests(unittest.TestCase):
    def test_saved_capture_runs_sync_callback_and_returns_result(self) -> None:
        payload = {
            "title": "生物统计师",
            "company": "示例药企",
            "url": "https://www.zhipin.com/job_detail/abc.html",
            "description": "要求博士学历，熟悉 R、SAS、临床试验设计以及统计编程。",
        }
        callbacks: list[tuple[dict[str, object], Path]] = []

        def on_capture(capture: dict[str, object], path: Path) -> dict[str, object]:
            callbacks.append((capture, path))
            return {"synced": True, "matched": True}

        with tempfile.TemporaryDirectory() as directory:
            inbox = Path(directory)
            server = ThreadingHTTPServer(("127.0.0.1", 0), SERVER.handler_factory(inbox, on_capture))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                request = urllib.request.Request(
                    f"http://127.0.0.1:{server.server_port}/jd",
                    data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(request, timeout=5) as response:
                    result = json.loads(response.read().decode("utf-8"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=5)

            saved_files = list(inbox.glob("*.json"))

        self.assertEqual(len(callbacks), 1)
        self.assertEqual(len(saved_files), 1)
        self.assertTrue(result["saved"])
        self.assertTrue(result["synced"])


if __name__ == "__main__":
    unittest.main()
