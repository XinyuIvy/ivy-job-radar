#!/usr/bin/env python3
"""Run every enabled user-triggered China job source from one desktop launcher."""

from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import ModuleType
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_DIR = SCRIPT_DIR.parent
BOSS_SCRIPT = SCRIPT_DIR / "boss_one_click.py"
RADAR_SCRIPT = SCRIPT_DIR / "boss_radar.py"
PUBLIC_SCAN_SCRIPT = REPO_DIR / "scripts" / "china_scan.py"
PUBLIC_CONFIG = REPO_DIR / "config" / "china_search_queries.json"
APP_DIR = Path.home() / ".ivy-job-radar"
PUBLIC_OUTPUT_DIR = APP_DIR / "china-public"
REPORT_PATH = APP_DIR / "reports" / "china-all-latest.json"


def load_module(name: str, path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def failed_source(source: str, error: BaseException) -> dict[str, Any]:
    return {
        "source": source,
        "status": "failed",
        "jobs_discovered": 0,
        "jobs_eligible": 0,
        "jobs_created": 0,
        "jobs_updated_or_duplicate": 0,
        "attention": str(error),
    }


def run_boss(dry_run: bool) -> dict[str, Any]:
    try:
        boss = load_module("ivy_boss_one_click", BOSS_SCRIPT)
        summary = boss.run_scan(dry_run=dry_run)
        return {"source": "BOSS直聘", **summary}
    except KeyboardInterrupt:
        raise
    except BaseException as exc:
        # Continue with public sources when BOSS needs login or verification.
        return failed_source("BOSS直聘", exc)


def run_public_sources(dry_run: bool) -> dict[str, Any]:
    PUBLIC_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        str(PUBLIC_SCAN_SCRIPT),
        "--config",
        str(PUBLIC_CONFIG),
        "--output-dir",
        str(PUBLIC_OUTPUT_DIR),
    ]
    result = subprocess.run(
        command,
        cwd=REPO_DIR,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        message = (result.stderr or result.stdout or "Public China scan failed").strip()
        raise RuntimeError(message[-1200:])

    jobs_path = PUBLIC_OUTPUT_DIR / "china_jobs_latest.json"
    summary_path = PUBLIC_OUTPUT_DIR / "china_scan_summary.json"
    jobs = json.loads(jobs_path.read_text(encoding="utf-8"))
    source_summary = json.loads(summary_path.read_text(encoding="utf-8"))
    sync_result = {"created": 0, "updated": 0, "skipped": 0}

    if not dry_run:
        radar = load_module("ivy_boss_radar_for_public", RADAR_SCRIPT)
        radar.load_env(radar.DEFAULT_ENV_FILE)
        sync_result = radar.sync_jobs(jobs)

    return {
        "source": "中国公开索引",
        "status": "completed",
        "jobs_discovered": sum(int(item.get("scanned", 0)) for item in source_summary.get("sources", [])),
        "jobs_eligible": len(jobs),
        "jobs_created": int(sync_result.get("created", 0)),
        "jobs_updated_or_duplicate": int(sync_result.get("updated", 0)) + int(sync_result.get("skipped", 0)),
        "sources": source_summary.get("sources", []),
        "attention": "",
    }


def build_summary(results: list[dict[str, Any]], dry_run: bool) -> dict[str, Any]:
    failures = [item for item in results if item.get("status") != "completed"]
    completed = len(results) - len(failures)
    status = "completed" if not failures else "partial" if completed else "failed"
    return {
        "status": status,
        "sources_completed": completed,
        "sources_failed": len(failures),
        "jobs_discovered": sum(int(item.get("jobs_discovered", 0)) for item in results),
        "jobs_eligible": sum(int(item.get("jobs_eligible", 0)) for item in results),
        "jobs_created": sum(int(item.get("jobs_created", 0)) for item in results),
        "jobs_updated_or_duplicate": sum(
            int(item.get("jobs_updated_or_duplicate", 0)) for item in results
        ),
        "dry_run": dry_run,
        "results": results,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }


def run_all(dry_run: bool = False) -> dict[str, Any]:
    results = [run_boss(dry_run)]
    try:
        results.append(run_public_sources(dry_run))
    except KeyboardInterrupt:
        raise
    except BaseException as exc:
        results.append(failed_source("中国公开索引", exc))

    summary = build_summary(results, dry_run)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\nChina multi-source scan summary")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"Detailed report: {REPORT_PATH}")
    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("run", "status"))
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.command == "status":
        if not REPORT_PATH.exists():
            raise SystemExit("No China multi-source report exists yet.")
        print(REPORT_PATH.read_text(encoding="utf-8"))
        return
    summary = run_all(dry_run=args.dry_run)
    if summary["status"] != "completed":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
