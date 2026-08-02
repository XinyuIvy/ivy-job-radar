from __future__ import annotations

import argparse
import importlib.util
import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "china_scan.py"
SPEC = importlib.util.spec_from_file_location("china_scan", MODULE_PATH)
assert SPEC and SPEC.loader
CHINA_SCAN = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHINA_SCAN)


def validate(
    summary_path: Path,
    jobs_path: Path,
    minimum_matched: int = 0,
    availability_policy: str = "require",
) -> list[str]:
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    jobs = json.loads(jobs_path.read_text(encoding="utf-8"))
    errors: list[str] = []

    if not summary.get("all_counts_reconcile"):
        errors.append("Scan counts do not reconcile for every query.")

    grouped = defaultdict(lambda: {"scanned": 0, "valid": 0, "matched": 0})
    for row in summary.get("sources", []):
        source = str(row.get("source", ""))
        grouped[source]["scanned"] += int(row.get("scanned", 0))
        grouped[source]["valid"] += int(row.get("valid_platform_urls", 0))
        grouped[source]["matched"] += int(row.get("matched", 0))
        if not row.get("accounted_for"):
            errors.append(f"Counts do not reconcile: {source} / {row.get('query', '')}")

    for job in jobs:
        reason = CHINA_SCAN.platform_url_rejection(
            str(job.get("job_url", "")),
            str(job.get("source", "")),
        )
        if reason:
            errors.append(
                f"Saved job violates its platform URL contract ({reason}): "
                f"{job.get('source')} {job.get('job_url')}"
            )

    platform_groups = {
        source: totals
        for source, totals in grouped.items()
        if CHINA_SCAN.platform_rule(source) is not None and "·" not in source
    }
    usable_sources = sum(totals["valid"] > 0 for totals in platform_groups.values())
    explicitly_unavailable = False
    if platform_groups and usable_sources == 0:
        statuses = {str(row.get("source_status", "")) for row in summary.get("sources", [])}
        explicitly_unavailable = statuses and statuses <= {
            "job_pages_not_indexed",
            "rate_limited",
            "verification_required",
            "search_source_error",
        }
        if availability_policy != "allow-limited" or not explicitly_unavailable:
            errors.append("Every public platform source returned zero valid platform URLs.")

    total_matched = sum(totals["matched"] for totals in platform_groups.values())
    if total_matched < minimum_matched and not (
        availability_policy == "allow-limited" and explicitly_unavailable
    ):
        errors.append(
            f"Expected at least {minimum_matched} relevant job(s), but found {total_matched}."
        )

    print(json.dumps({
        "jobs": len(jobs),
        "platforms": platform_groups,
        "usable_platform_sources": usable_sources,
        "availability_policy": availability_policy,
        "minimum_matched": minimum_matched,
        "errors": errors,
    }, ensure_ascii=False, indent=2))
    return errors


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate China platform smoke-scan output.")
    parser.add_argument("--summary", type=Path, required=True)
    parser.add_argument("--jobs", type=Path, required=True)
    parser.add_argument("--minimum-matched", type=int, default=0)
    parser.add_argument(
        "--availability-policy",
        choices=("require", "allow-limited"),
        default="require",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    errors = validate(
        args.summary,
        args.jobs,
        minimum_matched=args.minimum_matched,
        availability_policy=args.availability_policy,
    )
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
