#!/usr/bin/env python3
"""Install and run the user-triggered BOSS scan workflow on macOS."""

from __future__ import annotations

import argparse
import importlib.util
import json
import shlex
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import ModuleType
from typing import Any, Callable


SCRIPT_DIR = Path(__file__).resolve().parent
RADAR_SCRIPT = SCRIPT_DIR / "boss_radar.py"
DEFAULT_LAUNCHER = Path.home() / "Desktop" / "一键扫描BOSS.command"


def load_radar() -> ModuleType:
    spec = importlib.util.spec_from_file_location("ivy_boss_radar", RADAR_SCRIPT)
    if spec is None or spec.loader is None:
        raise SystemExit(f"Cannot load BOSS collector: {RADAR_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def count_raw_rows(radar: ModuleType, result_files: list[tuple[Path, Path | None]]) -> int:
    keys: set[str] = set()
    anonymous = 0
    for jobs_path, _details_path in result_files:
        if not jobs_path.exists():
            continue
        for row in radar.rows_from_payload(radar.load_json(jobs_path)):
            key = radar.row_key(row)
            if key:
                keys.add(key)
            else:
                anonymous += 1
    return len(keys) + anonymous


def build_summary(
    state: dict[str, Any],
    discovered: int,
    eligible: int,
    sync_result: dict[str, Any],
    dry_run: bool,
) -> dict[str, Any]:
    total = max(0, int(state.get("combination_count", 0)))
    cursor = max(0, int(state.get("cursor", 0)))
    completed = max(0, int(state.get("completed_searches", 0)))
    cycle_completed = cursor == 0 and completed > 0
    remaining = 0 if cycle_completed else max(0, total - cursor)
    return {
        "status": state.get("status", "unknown"),
        "run_id": state.get("last_run_id", ""),
        "searches_planned": int(state.get("planned_searches", 0)),
        "searches_completed": completed,
        "searches_remaining_in_cycle": remaining,
        "cycle_completed": cycle_completed,
        "jobs_discovered": discovered,
        "jobs_unique": int(state.get("jobs_unique", discovered)),
        "jobs_duplicate_listings": int(state.get("jobs_duplicate_listings", 0)),
        "jobs_filtered_before_detail": int(state.get("jobs_filtered_before_detail", 0)),
        "jobs_skipped_cached": int(state.get("jobs_skipped_cached", 0)),
        "jobs_detail_candidates": int(state.get("jobs_detail_candidates", eligible)),
        "rejection_reasons": state.get("rejection_reasons", {}),
        "review_counts": state.get("review_counts", {}),
        "jobs_eligible": eligible,
        "jobs_excluded_or_incomplete": max(0, discovered - eligible),
        "jobs_created": int(sync_result.get("created", 0)),
        "jobs_updated_or_duplicate": int(sync_result.get("updated", 0)) + int(sync_result.get("skipped", 0)),
        "dry_run": dry_run,
        "attention": state.get("failure", ""),
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }


def save_summary(radar: ModuleType, state: dict[str, Any], summary: dict[str, Any]) -> Path:
    report_dir = radar.APP_DIR / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    latest = report_dir / "boss-latest.json"
    latest.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    state["last_summary"] = summary
    radar.write_state(state)
    return latest


def run_scan(
    dry_run: bool = False,
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    radar = load_radar()
    radar.APP_DIR.mkdir(parents=True, exist_ok=True)
    radar.load_env(radar.DEFAULT_ENV_FILE)
    state_before = radar.read_state()
    starting_cursor = int(state_before.get("cursor", 0))
    if progress_callback:
        result_files = radar.run_searches(
            radar.DEFAULT_SCRAPER_DIR,
            radar.DEFAULT_PLAN,
            radar.DEFAULT_RESULT_DIR,
            progress_callback=progress_callback,
        )
    else:
        result_files = radar.run_searches(radar.DEFAULT_SCRAPER_DIR, radar.DEFAULT_PLAN, radar.DEFAULT_RESULT_DIR)
    state = radar.read_state()
    discovered = int(state.get("jobs_discovered", count_raw_rows(radar, result_files)))
    jobs = radar.transform_result_files(result_files)
    if progress_callback:
        progress_callback({
            "source": "BOSS直聘",
            "phase": "筛选完成",
            "message": f"BOSS 发现 {discovered}，筛选保留 {len(jobs)}",
            "completed": int(state.get("completed_searches", 0)),
            "total": int(state.get("planned_searches", 0)),
            "scanned": discovered,
            "unique": int(state.get("jobs_unique", discovered)),
            "filtered": int(state.get("jobs_filtered_before_detail", 0)),
            "detail_candidates": int(state.get("jobs_detail_candidates", len(jobs))),
            "eligible": len(jobs),
            "rejection_reasons": state.get("rejection_reasons", {}),
            "review_counts": state.get("review_counts", {}),
        })
    sync_result = {"received": 0, "created": 0, "updated": 0, "skipped": 0}
    if not dry_run:
        try:
            sync_result = radar.sync_jobs(jobs)
        except SystemExit as exc:
            # Repeat this batch on the next run so a website outage cannot lose jobs.
            state["cursor"] = starting_cursor
            state["status"] = "attention_required"
            state["failure"] = str(exc)
        else:
            radar.record_synced_jobs(jobs, result_files)
    plan = radar.load_json(radar.DEFAULT_PLAN)
    state["combination_count"] = len(plan.get("cities", [])) * len(plan.get("keywords", []))
    summary = build_summary(state, discovered, len(jobs), sync_result, dry_run)
    if progress_callback:
        progress_callback({
            "source": "BOSS直聘",
            "phase": "同步完成",
            "message": f"BOSS 新增 {summary['jobs_created']}，重复或更新 {summary['jobs_updated_or_duplicate']}",
            "completed": summary["searches_completed"],
            "total": summary["searches_planned"],
            "scanned": summary["jobs_discovered"],
            "unique": summary["jobs_unique"],
            "filtered": summary["jobs_filtered_before_detail"],
            "detail_candidates": summary["jobs_detail_candidates"],
            "eligible": summary["jobs_eligible"],
            "created": summary["jobs_created"],
            "duplicate": summary["jobs_updated_or_duplicate"],
            "rejection_reasons": summary["rejection_reasons"],
            "review_counts": summary["review_counts"],
        })
    report_path = save_summary(radar, state, summary)
    print("\nBOSS scan summary")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"Detailed report: {report_path}")
    return summary


def launcher_content(repo_dir: Path) -> str:
    script = repo_dir / "local-collector" / "china_one_click.py"
    quoted_repo = shlex.quote(str(repo_dir))
    quoted_script = shlex.quote(str(script))
    return f'''#!/bin/zsh
set -u
cd {quoted_repo}
clear
echo "Starting Ivy Job Radar China multi-source scan..."
/usr/bin/env python3 {quoted_script} run
status=$?
echo ""
if [ "$status" -eq 0 ]; then
  echo "Scan finished. New eligible jobs are already in Ivy Job Radar."
else
  echo "Scan finished with warnings. Review the source summary above."
fi
echo "Press Return to close this window."
read
exit "$status"
'''


def install_launcher(destination: Path) -> None:
    if sys.platform != "darwin":
        raise SystemExit("The desktop launcher can only be installed on macOS.")
    repo_dir = SCRIPT_DIR.parent.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(launcher_content(repo_dir), encoding="utf-8")
    destination.chmod(0o755)
    print(f"Installed one-click launcher: {destination}")
    print("It scans BOSS plus every enabled public China source in one run.")


def open_boss_browser() -> None:
    radar = load_radar()
    python = radar.ensure_scraper(radar.DEFAULT_SCRAPER_DIR)
    script = radar.DEFAULT_SCRAPER_DIR / "scripts" / "boss_cdp_raw.py"
    result = subprocess.run([str(python), str(script), "--check"], check=False)
    if result.returncode == 0:
        print("The dedicated BOSS browser session is ready.")
        return
    print("Opening the dedicated BOSS Chrome profile. Log in, then run the desktop launcher.")
    subprocess.run([str(python), str(script), "--setup-chrome"], check=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("install", "open-browser", "run", "status"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--launcher", type=Path, default=DEFAULT_LAUNCHER)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.command == "install":
        install_launcher(args.launcher)
    elif args.command == "open-browser":
        open_boss_browser()
    elif args.command == "status":
        radar = load_radar()
        print(json.dumps(radar.read_state(), ensure_ascii=False, indent=2))
    else:
        summary = run_scan(dry_run=args.dry_run)
        if summary["status"] != "completed":
            raise SystemExit(2)


if __name__ == "__main__":
    main()
