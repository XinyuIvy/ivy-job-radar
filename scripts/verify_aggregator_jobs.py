from __future__ import annotations

import argparse
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from verify_company_jobs import verify_job


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify Job Board Aggregator candidates on official ATS pages.")
    parser.add_argument("--input", type=Path, default=Path("data/scans/aggregator_jobs_latest.json"))
    parser.add_argument("--output-dir", type=Path, default=Path("data/scans"))
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    jobs = json.loads(args.input.read_text(encoding="utf-8"))
    checked_at = datetime.now(timezone.utc).isoformat()
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        records = list(executor.map(lambda job: verify_job(job, checked_at), jobs))

    args.output_dir.mkdir(parents=True, exist_ok=True)
    verified_path = args.output_dir / "aggregator_jobs_verified_latest.json"
    verified_path.write_text(
        json.dumps(records, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    summary = {
        "generated_at": checked_at,
        "received": len(records),
        "open_verified": sum(item.get("status") == "开放" for item in records),
        "closed": sum(item.get("status") == "已关闭" for item in records),
        "needs_manual_verification": sum(item.get("status") == "待官网核验" for item in records),
        "official_urls_found": sum(bool(item.get("official_url")) for item in records),
        "full_descriptions_found": sum(len(str(item.get("full_description") or "")) >= 300 for item in records),
    }
    (args.output_dir / "aggregator_verification_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        "Aggregator verification complete: "
        f"{summary['open_verified']} open, {summary['closed']} closed, "
        f"{summary['needs_manual_verification']} require manual review."
    )


if __name__ == "__main__":
    main()
