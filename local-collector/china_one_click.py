#!/usr/bin/env python3
"""Run every enabled user-triggered China job source from one desktop launcher."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
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
COMPANY_SCAN_SCRIPT = REPO_DIR / "scripts" / "company_portal_scan.py"
COMPANY_OUTPUT_DIR = APP_DIR / "china-company-official"
PROGRESS_PATH = APP_DIR / "reports" / "china-progress.json"
REPORT_PATH = APP_DIR / "reports" / "china-all-latest.json"


def load_module(name: str, path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def failed_source(source: str, error: BaseException) -> dict[str, Any]:
    """Classify a source failure without treating it as a completed scan."""
    message = str(error)
    lower = message.lower()
    if any(token in lower for token in ("captcha", "验证码", "安全验证", "访问频繁", "verify")):
        attention_kind = "verification_required"
    elif any(token in lower for token in ("login", "登录", "未登录", "sign in")):
        attention_kind = "login_required"
    elif any(token in lower for token in ("timeout", "timed out", "network", "connection", "网络")):
        attention_kind = "network_error"
    else:
        attention_kind = "source_error"
    return {
        "source": source,
        "status": "failed",
        "jobs_discovered": 0,
        "jobs_eligible": 0,
        "jobs_created": 0,
        "jobs_updated_or_duplicate": 0,
        "attention": message,
        "attention_kind": attention_kind,
    }


def publish_progress(progress: dict[str, Any]) -> None:
    request_id = os.environ.get("IVY_CHINA_SCAN_REQUEST_ID", "").strip()
    if not request_id:
        return
    try:
        radar = load_module("ivy_boss_radar_for_progress", RADAR_SCRIPT)
        radar.load_env(radar.DEFAULT_ENV_FILE)
        base_url = os.environ.get("IVY_JOB_RADAR_URL", "").rstrip("/")
        token = os.environ.get("IVY_JOB_RADAR_SYNC_TOKEN", "")
        sites_token = os.environ.get("IVY_JOB_RADAR_SITES_BYPASS_TOKEN", "")
        request = urllib.request.Request(
            f"{base_url}/api/china-scan-control",
            data=json.dumps({
                "action": "progress",
                "request_id": request_id,
                "progress": progress,
            }, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {token}",
                "OAI-Sites-Authorization": f"Bearer {sites_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=20):
            pass
    except Exception:
        # Progress reporting must never stop the actual scan.
        return


def run_with_progress(command: list[str], progress_path: Path) -> subprocess.CompletedProcess[str]:
    progress_path.parent.mkdir(parents=True, exist_ok=True)
    progress_path.unlink(missing_ok=True)
    process = subprocess.Popen(
        command,
        cwd=REPO_DIR,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    last_payload = ""
    while process.poll() is None:
        if progress_path.exists():
            payload = progress_path.read_text(encoding="utf-8")
            if payload != last_payload:
                last_payload = payload
                try:
                    publish_progress(json.loads(payload))
                except json.JSONDecodeError:
                    pass
        time.sleep(1)
    stdout, stderr = process.communicate()
    if progress_path.exists():
        payload = progress_path.read_text(encoding="utf-8")
        if payload != last_payload:
            try:
                publish_progress(json.loads(payload))
            except json.JSONDecodeError:
                pass
    return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)


def run_boss(dry_run: bool) -> dict[str, Any]:
    try:
        publish_progress({"source": "BOSS直聘", "phase": "准备", "message": "正在准备 BOSS 搜索", "completed": 0, "total": 8})
        boss = load_module("ivy_boss_one_click", BOSS_SCRIPT)
        summary = boss.run_scan(dry_run=dry_run, progress_callback=publish_progress)
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
        "--progress-file",
        str(PROGRESS_PATH),
    ]
    result = run_with_progress(command, PROGRESS_PATH)
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

    rejection_reasons: dict[str, int] = {}
    for item in source_summary.get("sources", []):
        for key, value in item.get("rejected", {}).items():
            rejection_reasons[key] = rejection_reasons.get(key, 0) + int(value)
    summary = {
        "source": "中国公开索引",
        "status": "completed",
        "jobs_discovered": sum(int(item.get("scanned", 0)) for item in source_summary.get("sources", [])),
        "jobs_eligible": len(jobs),
        "jobs_created": int(sync_result.get("created", 0)),
        "jobs_updated_or_duplicate": int(sync_result.get("updated", 0)) + int(sync_result.get("skipped", 0)),
        "rejection_reasons": rejection_reasons,
        "sources": source_summary.get("sources", []),
        "attention": "",
    }
    publish_progress({
        "source": "中国公开索引",
        "phase": "同步完成",
        "message": f"公开索引发现 {summary['jobs_discovered']}，筛选保留 {summary['jobs_eligible']}",
        "completed": len(source_summary.get("sources", [])),
        "total": len(source_summary.get("sources", [])),
        "scanned": summary["jobs_discovered"],
        "filtered": max(0, summary["jobs_discovered"] - summary["jobs_eligible"]),
        "eligible": summary["jobs_eligible"],
        "created": summary["jobs_created"],
        "duplicate": summary["jobs_updated_or_duplicate"],
        "rejection_reasons": rejection_reasons,
    })
    return summary


def run_company_sources(dry_run: bool) -> dict[str, Any]:
    COMPANY_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        str(COMPANY_SCAN_SCRIPT),
        "--region",
        "中国",
        "--output-dir",
        str(COMPANY_OUTPUT_DIR),
        "--progress-file",
        str(PROGRESS_PATH),
    ]
    result = run_with_progress(command, PROGRESS_PATH)
    if result.returncode != 0:
        message = (result.stderr or result.stdout or "China company portal scan failed").strip()
        raise RuntimeError(message[-1200:])
    jobs = json.loads((COMPANY_OUTPUT_DIR / "company_portal_jobs_latest.json").read_text(encoding="utf-8"))
    portal_summary = json.loads((COMPANY_OUTPUT_DIR / "company_portal_summary.json").read_text(encoding="utf-8"))
    sync_result = {"created": 0, "updated": 0, "skipped": 0}
    if not dry_run:
        radar = load_module("ivy_boss_radar_for_company_portals", RADAR_SCRIPT)
        radar.load_env(radar.DEFAULT_ENV_FILE)
        sync_result = radar.sync_jobs(jobs)
    summary = {
        "source": "中国公司官网",
        "status": "completed",
        "jobs_discovered": int(portal_summary.get("jobs_scanned", 0)),
        "jobs_eligible": len(jobs),
        "jobs_created": int(sync_result.get("created", 0)),
        "jobs_updated_or_duplicate": int(sync_result.get("updated", 0)) + int(sync_result.get("skipped", 0)),
        "companies_attempted": int(portal_summary.get("companies_attempted", 0)),
        "companies_succeeded": int(portal_summary.get("companies_succeeded", 0)),
        "attention": "",
    }
    publish_progress({
        "source": "中国公司官网",
        "phase": "同步完成",
        "message": f"已检查 {summary['companies_attempted']} 家中国公司官网，保留 {len(jobs)} 个岗位",
        "completed": summary["companies_attempted"],
        "total": summary["companies_attempted"],
        "scanned": summary["jobs_discovered"],
        "filtered": max(0, summary["jobs_discovered"] - summary["jobs_eligible"]),
        "eligible": summary["jobs_eligible"],
        "created": summary["jobs_created"],
        "duplicate": summary["jobs_updated_or_duplicate"],
    })
    return summary


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


def sync_scan_report(summary: dict[str, Any]) -> dict[str, Any]:
    radar = load_module("ivy_boss_radar_for_report", RADAR_SCRIPT)
    radar.load_env(radar.DEFAULT_ENV_FILE)
    base_url = os.environ.get("IVY_JOB_RADAR_URL", "").rstrip("/")
    token = os.environ.get("IVY_JOB_RADAR_SYNC_TOKEN", "")
    sites_token = os.environ.get("IVY_JOB_RADAR_SITES_BYPASS_TOKEN", "")
    if not base_url or not token or not sites_token:
        raise RuntimeError(
            "collector.env must define IVY_JOB_RADAR_URL, IVY_JOB_RADAR_SYNC_TOKEN, "
            "and IVY_JOB_RADAR_SITES_BYPASS_TOKEN"
        )

    request = urllib.request.Request(
        f"{base_url}/api/china-scan-status",
        data=json.dumps(summary, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "OAI-Sites-Authorization": f"Bearer {sites_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Scan report upload failed with HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Scan report upload could not connect: {error.reason}") from error


def run_all(dry_run: bool = False) -> dict[str, Any]:
    results = [run_boss(dry_run)]
    try:
        results.append(run_public_sources(dry_run))
    except KeyboardInterrupt:
        raise
    except BaseException as exc:
        results.append(failed_source("中国公开索引", exc))

    try:
        results.append(run_company_sources(dry_run))
    except KeyboardInterrupt:
        raise
    except BaseException as exc:
        results.append(failed_source("中国公司官网", exc))

    summary = build_summary(results, dry_run)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not dry_run:
        try:
            sync_scan_report(summary)
            summary["report_synced"] = True
        except Exception as exc:
            # Keep the local report when the website cannot receive the summary.
            summary["report_synced"] = False
            summary["report_sync_attention"] = str(exc)
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
