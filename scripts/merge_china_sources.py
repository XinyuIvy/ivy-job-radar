from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SOURCE_FILES = (
    "china_jobs_latest.json",
    "china_local_import_latest.json",
    "zhaopin_apify_jobs_latest.json",
)


def load_list(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return [row for row in payload if isinstance(row, dict)] if isinstance(payload, list) else []


def identity(job: dict[str, Any]) -> str:
    return str(
        job.get("canonical_url")
        or job.get("job_url")
        or job.get("job_key")
        or f"{job.get('company', '')}::{job.get('title', '')}::{job.get('location', '')}"
    ).strip().casefold()


def quality(job: dict[str, Any]) -> tuple[int, int, int]:
    description = len(str(job.get("full_description") or ""))
    verified = int(str(job.get("status") or "") in {"开放", "已核验", "已捕获完整JD", "open"})
    return verified, description, int(job.get("score") or 0)


def merge(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    primary, secondary = (right, left) if quality(right) > quality(left) else (left, right)
    result = dict(secondary)
    result.update({key: value for key, value in primary.items() if value not in (None, "", [], {})})
    sources = {
        str(item).strip()
        for item in (
            left.get("source"),
            right.get("source"),
            *(left.get("sources") if isinstance(left.get("sources"), list) else []),
            *(right.get("sources") if isinstance(right.get("sources"), list) else []),
        )
        if str(item or "").strip()
    }
    result["sources"] = sorted(sources)
    result["source"] = " · ".join(sorted(sources))
    result["skills"] = list(
        dict.fromkeys(
            str(item).strip()
            for values in (left.get("skills"), right.get("skills"))
            if isinstance(values, list)
            for item in values
            if str(item).strip()
        )
    )[:12]
    result["score"] = max(int(left.get("score") or 0), int(right.get("score") or 0))
    return result


def run(scan_dir: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    source_counts: dict[str, int] = {}
    for filename in SOURCE_FILES:
        rows = load_list(scan_dir / filename)
        source_counts[filename] = len(rows)
        for job in rows:
            key = identity(job)
            if not key:
                continue
            merged[key] = job if key not in merged else merge(merged[key], job)
    jobs = sorted(
        merged.values(),
        key=lambda row: (-int(row.get("score") or 0), str(row.get("company") or ""), str(row.get("title") or "")),
    )
    base_summary_path = scan_dir / "china_scan_summary.json"
    try:
        base_summary = json.loads(base_summary_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        base_summary = {}
    summary = dict(base_summary) if isinstance(base_summary, dict) else {}
    summary.update(
        {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "matched_jobs": len(jobs),
            "source_counts": source_counts,
            "collection_note": (
                "Combined indexed discovery, user-triggered visible-page captures, "
                "browser-extension exports, and the optional explicitly enabled Zhaopin Actor."
            ),
        }
    )
    return jobs, summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge every China collection route before the global merge.")
    parser.add_argument("--scan-dir", type=Path, default=Path("data/scans"))
    args = parser.parse_args()
    jobs, summary = run(args.scan_dir)
    args.scan_dir.mkdir(parents=True, exist_ok=True)
    (args.scan_dir / "china_jobs_latest.json").write_text(
        json.dumps(jobs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (args.scan_dir / "china_scan_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Merged {len(jobs)} China jobs across {len(SOURCE_FILES)} collection routes.")


if __name__ == "__main__":
    main()
