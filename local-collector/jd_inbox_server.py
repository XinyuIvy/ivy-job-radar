from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


MAX_BODY_BYTES = 1_000_000


def safe_slug(value: object) -> str:
    slug = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", "-", str(value or "")).strip("-")
    return slug[:60] or "job"


def capture_error(payload: object) -> str | None:
    if not isinstance(payload, dict):
        return "capture must be a JSON object"
    if not str(payload.get("title") or "").strip():
        return "capture requires a title"
    description = str(payload.get("description") or "").strip()
    if len(description) < 20:
        return "capture requires a complete job description"
    if re.search(
        r"(?:和|与|及|以及|或|包括|包含|and|or|including|such as|[,，:：;；(（])\\s*$",
        description,
        re.IGNORECASE,
    ):
        return "capture appears to contain a truncated job description"
    url = str(payload.get("url") or payload.get("jobUrl") or "").strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return "capture requires an HTTP job URL"
    if parsed.hostname and parsed.hostname.lower().endswith("zhipin.com") and "/job_detail/" not in parsed.path:
        return "BOSS capture requires a stable job-detail URL"
    return None


def save_capture(payload: dict[str, Any], inbox: Path) -> Path:
    inbox.mkdir(parents=True, exist_ok=True)
    captured_at = datetime.now(timezone.utc).isoformat()
    payload = dict(payload)
    payload["capturedAt"] = str(payload.get("capturedAt") or captured_at)
    identity = str(payload.get("url") or payload.get("jobUrl") or json.dumps(payload, sort_keys=True, ensure_ascii=False))
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:10]
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = inbox / f"{timestamp}-{safe_slug(payload.get('title'))}-{digest}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def handler_factory(inbox: Path) -> type[BaseHTTPRequestHandler]:
    class InboxHandler(BaseHTTPRequestHandler):
        server_version = "IvyJobInbox/1.0"

        def cors(self) -> None:
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

        def write_json(self, status: int, payload: dict[str, Any]) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self) -> None:  # noqa: N802
            self.send_response(204)
            self.cors()
            self.end_headers()

        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/health":
                self.write_json(200, {"ok": True, "inbox": str(inbox)})
            else:
                self.write_json(404, {"ok": False, "error": "not found"})

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/jd":
                self.write_json(404, {"ok": False, "error": "not found"})
                return
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                length = 0
            if length <= 0 or length > MAX_BODY_BYTES:
                self.write_json(413, {"ok": False, "error": "invalid capture size"})
                return
            try:
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
            except (UnicodeError, json.JSONDecodeError):
                self.write_json(400, {"ok": False, "error": "invalid JSON"})
                return
            error = capture_error(payload)
            if error:
                self.write_json(422, {"ok": False, "error": error})
                return
            path = save_capture(payload, inbox)
            self.write_json(201, {"ok": True, "file": path.name})

        def log_message(self, format: str, *args: object) -> None:
            print(f"{self.address_string()} - {format % args}")

    return InboxHandler


def main() -> None:
    parser = argparse.ArgumentParser(description="Receive user-triggered JD captures from protected China job boards.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--inbox", type=Path, default=Path.home() / ".ivy-job-radar" / "inbox")
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), handler_factory(args.inbox))
    print(f"JD inbox listening on http://{args.host}:{args.port}; writing to {args.inbox}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
