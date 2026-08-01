#!/usr/bin/env python3
"""Capture visible China job pages locally and sync eligible jobs to Ivy Job Radar."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer
from pathlib import Path
from types import ModuleType
from typing import Any, Callable


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_DIR = SCRIPT_DIR.parent
DEFAULT_ENV_FILE = Path.home() / ".ivy-job-radar" / "collector.env"
DEFAULT_INBOX = Path.home() / ".ivy-job-radar" / "inbox"
DEFAULT_STATE = Path.home() / ".ivy-job-radar" / "capture-sync-state.json"
IMPORT_FIELDS = (
    "company", "title", "location", "region", "track", "score", "visa",
    "evidence", "description", "skills", "job_url", "canonical_url",
    "application_id", "source", "status", "discovered_at", "checked_at",
)


def load_module(path: Path, name: str) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, path)
    if not spec or not spec.loader:
        raise RuntimeError(f"Could not load module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_env(path: Path) -> None:
    if not path.exists():
        raise RuntimeError(f"Missing collector configuration: {path}")
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        cleaned = value.strip()
        if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {"'", '"'}:
            cleaned = cleaned[1:-1]
        os.environ.setdefault(key.strip(), cleaned)


def sync_config() -> dict[str, str]:
    config = {
        "base_url": os.environ.get("IVY_JOB_RADAR_URL", "").rstrip("/"),
        "sync_token": os.environ.get("IVY_JOB_RADAR_SYNC_TOKEN", ""),
        "sites_token": os.environ.get("IVY_JOB_RADAR_SITES_BYPASS_TOKEN", "")
        or os.environ.get("SITES_SIWC_BYPASS_TOKEN", ""),
    }
    missing = [key for key, value in config.items() if not value]
    if missing:
        raise RuntimeError("collector.env is missing: " + ", ".join(missing))
    return config


def normalized_job(payload: dict[str, Any], importer: ModuleType) -> tuple[dict[str, Any] | None, str]:
    title = str(payload.get("title") or "").strip()
    reason = str(importer.title_exclusion_reason(title) or "")
    if reason:
        return None, reason
    imported_at = datetime.now(timezone.utc).isoformat()
    job = importer.normalize(payload, imported_at, "中国招聘网站·人工捕获")
    if job is None:
        return None, "not_eligible"
    # The website API accepts `description`, while the snapshot pipeline stores
    # the same complete JD under `full_description`.
    job["description"] = str(job.get("full_description") or payload.get("description") or "")
    return {key: job.get(key) for key in IMPORT_FIELDS}, ""


def post_job(
    job: dict[str, Any],
    config: dict[str, str],
    opener: Callable[..., Any] = urllib.request.urlopen,
) -> dict[str, Any]:
    body = json.dumps([job], ensure_ascii=False).encode("utf-8")
    if len(body) > 1_000_000:
        raise RuntimeError("normalized job exceeds the 1 MB upload limit")
    request = urllib.request.Request(
        f"{config['base_url']}/api/jobs/import",
        data=body,
        headers={
            "Authorization": f"Bearer {config['sync_token']}",
            "OAI-Sites-Authorization": f"Bearer {config['sites_token']}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with opener(request, timeout=90) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Job Radar import failed with HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Job Radar import could not connect: {error.reason}") from error
    if not result.get("ok"):
        raise RuntimeError(f"Job Radar import returned an invalid response: {result}")
    return result


def read_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"files": {}}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"files": {}}
    return payload if isinstance(payload, dict) else {"files": {}}


def write_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def make_capture_callback(
    importer: ModuleType,
    config: dict[str, str],
    state_path: Path,
    opener: Callable[..., Any] = urllib.request.urlopen,
) -> Callable[[dict[str, Any], Path], dict[str, Any]]:
    def on_capture(payload: dict[str, Any], path: Path) -> dict[str, Any]:
        job, reason = normalized_job(payload, importer)
        if job is None:
            return {"synced": False, "matched": False, "reason": reason}
        result = post_job(job, config, opener)
        state = read_state(state_path)
        files = state.setdefault("files", {})
        files[path.name] = {
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "job_url": job.get("job_url"),
            "result": {key: result.get(key, 0) for key in ("created", "updated", "skipped")},
        }
        write_state(state_path, state)
        return {"synced": True, "matched": True, "import_result": files[path.name]["result"]}

    return on_capture


def sync_backlog(
    inbox: Path,
    importer: ModuleType,
    callback: Callable[[dict[str, Any], Path], dict[str, Any]],
    state_path: Path,
) -> dict[str, int]:
    state = read_state(state_path)
    completed = state.get("files", {}) if isinstance(state.get("files"), dict) else {}
    summary = {"scanned": 0, "synced": 0, "excluded": 0, "failed": 0}
    if not inbox.exists():
        return summary
    for path in sorted(inbox.glob("*.json")):
        if path.name in completed:
            continue
        summary["scanned"] += 1
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("capture is not a JSON object")
            result = callback(payload, path)
            if result.get("synced"):
                summary["synced"] += 1
            else:
                summary["excluded"] += 1
        except (OSError, ValueError, json.JSONDecodeError, RuntimeError) as exc:
            summary["failed"] += 1
            print(f"Backlog sync failed for {path.name}: {exc}")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--inbox", type=Path, default=DEFAULT_INBOX)
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    args = parser.parse_args()

    load_env(args.env_file)
    config = sync_config()
    importer = load_module(REPO_DIR / "scripts" / "china_snapshot_import.py", "china_snapshot_import")
    inbox_server = load_module(SCRIPT_DIR / "jd_inbox_server.py", "jd_inbox_server")
    callback = make_capture_callback(importer, config, args.state)
    backlog = sync_backlog(args.inbox, importer, callback, args.state)
    print("Backlog: " + json.dumps(backlog, ensure_ascii=False))

    server = ThreadingHTTPServer((args.host, args.port), inbox_server.handler_factory(args.inbox, callback))
    print(f"China capture service listening on http://{args.host}:{args.port}")
    print("Eligible captures will sync directly to Ivy Job Radar; press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
