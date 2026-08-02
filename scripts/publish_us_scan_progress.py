#!/usr/bin/env python3
"""Publish truthful US scan progress from GitHub Actions to Ivy Job Radar."""

from __future__ import annotations

import argparse
import json
import os
import urllib.request
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit


def load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError):
        return default


RUN_MARKER = Path("/tmp/ivy-us-scan-progress-started")


def is_current(path: Path) -> bool:
    if not path.exists():
        return False
    return not RUN_MARKER.exists() or path.stat().st_mtime_ns >= RUN_MARKER.stat().st_mtime_ns


def rows(path: Path) -> list[dict[str, Any]]:
    if not is_current(path):
        return []
    payload = load_json(path, [])
    return [item for item in payload if isinstance(item, dict)] if isinstance(payload, list) else []


def canonical_url(value: object) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        parts = urlsplit(raw)
        return urlunsplit((parts.scheme.lower(), parts.netloc.lower().removeprefix("www."), parts.path.rstrip("/") or "/", "", ""))
    except ValueError:
        return raw


def job_key(job: dict[str, Any]) -> str:
    url = canonical_url(job.get("canonical_url") or job.get("official_url") or job.get("job_url"))
    if url:
        return f"url:{url}"
    company = str(job.get("company") or "").strip().casefold()
    application_id = str(job.get("application_id") or "").strip().casefold()
    title = str(job.get("title") or "").strip().casefold()
    location = str(job.get("location") or "").strip().casefold()
    return f"fallback:{company}:{application_id}:{title}:{location}"


def sum_source_field(summary: dict[str, Any], field: str) -> int:
    return sum(int(item.get(field, 0) or 0) for item in summary.get("sources", []) if isinstance(item, dict))


def metrics(scan_dir: Path) -> dict[str, int]:
    candidate_files = (
        "us_jobs_verified_latest.json",
        "cloud_sources_jobs_latest.json",
        "aggregator_jobs_verified_latest.json",
        "company_portal_jobs_latest.json",
    )
    candidates = [job for filename in candidate_files for job in rows(scan_dir / filename)]
    unique_candidates = {job_key(job): job for job in candidates if job_key(job)}

    us_jobs = rows(scan_dir / "us_jobs_latest.json")
    def current_json(filename: str) -> dict[str, Any]:
        path = scan_dir / filename
        return load_json(path, {}) if is_current(path) else {}

    us_verification = current_json("us_verification_summary.json")
    cloud_summary = current_json("cloud_sources_summary.json")
    aggregator_summary = current_json("aggregator_scan_summary.json")
    aggregator_verification = current_json("aggregator_verification_summary.json")
    portal_summary = current_json("company_portal_summary.json")
    receipt = current_json("run_receipt_latest.json")

    scanned = (
        len(us_jobs)
        + sum_source_field(cloud_summary, "scanned")
        + int(aggregator_summary.get("rows_scanned", 0) or 0)
        + int(portal_summary.get("jobs_scanned", 0) or 0)
    )
    verified = (
        int(us_verification.get("received", 0) or 0)
        + int(aggregator_verification.get("received", 0) or 0)
        + int(portal_summary.get("jobs_matched", 0) or 0)
    )
    eligible = int(receipt.get("imported", 0) or 0) if receipt else len(unique_candidates)
    unique_count = int(receipt.get("imported", 0) or 0) if receipt else len(unique_candidates)
    filtered = int(receipt.get("rejected", 0) or 0) + max(
        0,
        int(receipt.get("deduplicated", 0) or 0),
    )
    if not receipt:
        filtered = max(0, scanned - unique_count)

    return {
        "scanned": scanned,
        "unique_jobs": unique_count,
        "filtered": filtered,
        "verified": verified,
        "eligible": eligible,
        "created": int(receipt.get("new", 0) or 0),
        "updated": int(receipt.get("updated_or_unchanged", 0) or 0),
        "skipped": int(receipt.get("temporarily_retained", 0) or 0),
    }


def post_status(payload: dict[str, Any]) -> None:
    base_url = os.environ.get("IVY_JOB_RADAR_URL", "https://ivy-job-radar.rourou1199.chatgpt.site").rstrip("/")
    sync_token = os.environ.get("IVY_JOB_RADAR_SYNC_TOKEN", "")
    sites_token = os.environ.get("SITES_SIWC_BYPASS_TOKEN", "")
    if not sync_token or not sites_token:
        raise RuntimeError("Website progress credentials are not fully configured.")
    request = urllib.request.Request(
        f"{base_url}/api/scan-status",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {sync_token}",
            "OAI-Sites-Authorization": f"Bearer {sites_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        response.read()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", choices=("queued", "running", "completed", "failed"), default="running")
    parser.add_argument("--phase", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--completed", type=int, default=-1)
    parser.add_argument("--total", type=int, default=10)
    parser.add_argument("--message", required=True)
    parser.add_argument("--scan-dir", type=Path, default=Path("data/scans"))
    parser.add_argument("--start-run", action="store_true")
    args = parser.parse_args()

    if args.start_run:
        RUN_MARKER.write_text("started", encoding="utf-8")

    payload: dict[str, Any] = {
        "state": args.state,
        "phase": args.phase,
        "current_source": args.source,
        "steps_total": args.total,
        "message": args.message,
    }
    if args.completed >= 0:
        payload["steps_completed"] = args.completed
    if args.completed > 1 or args.state in {"completed", "failed"}:
        payload.update(metrics(args.scan_dir))
    post_status(payload)


if __name__ == "__main__":
    main()
