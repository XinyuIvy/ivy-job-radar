from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from china_snapshot_import import normalize


ACTOR_ID = "blackfalcondata~zhaopin-scraper"


def request_json(url: str, payload: dict[str, Any] | None = None, timeout: int = 180) -> Any:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "IvyJobRadar/1.0"},
        method="POST" if payload is not None else "GET",
    )
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def run_actor(token: str, query: str, max_results: int) -> list[dict[str, Any]]:
    endpoint = (
        f"https://api.apify.com/v2/acts/{ACTOR_ID}/run-sync-get-dataset-items?"
        + urlencode({"token": token, "format": "json", "clean": "true", "timeout": 180})
    )
    result = request_json(endpoint, {"query": query, "maxResults": max_results})
    return [item for item in result if isinstance(item, dict)] if isinstance(result, list) else []


def write_outputs(output_dir: Path, jobs: list[dict[str, Any]], summary: dict[str, Any]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "zhaopin_apify_jobs_latest.json").write_text(
        json.dumps(jobs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (output_dir / "zhaopin_apify_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the optional paid Apify Zhaopin source.")
    parser.add_argument("--query", default="生物统计 OR 数据科学家 OR 量化研究 OR 卫生经济")
    parser.add_argument("--max-results", type=int, default=25)
    parser.add_argument("--output-dir", type=Path, default=Path("data/scans"))
    args = parser.parse_args()
    now = datetime.now(timezone.utc).isoformat()
    token = os.environ.get("APIFY_TOKEN", "").strip()
    enabled = os.environ.get("APIFY_ZHAOPIN_ENABLED", "").strip().lower() in {"1", "true", "yes"}
    if not enabled or not token:
        write_outputs(
            args.output_dir,
            [],
            {
                "generated_at": now,
                "state": "skipped",
                "reason": "Set APIFY_ZHAOPIN_ENABLED=true and APIFY_TOKEN after approving paid usage.",
                "matched_jobs": 0,
            },
        )
        print("Skipped paid Apify Zhaopin source; it is not explicitly enabled.")
        return
    raw = run_actor(token, args.query, max(1, min(args.max_results, 100)))
    normalized = [
        job
        for item in raw
        if (job := normalize(item, now, "智联招聘·Apify")) is not None
    ]
    write_outputs(
        args.output_dir,
        normalized,
        {
            "generated_at": now,
            "state": "completed",
            "actor": ACTOR_ID,
            "raw_rows": len(raw),
            "matched_jobs": len(normalized),
            "max_results": max(1, min(args.max_results, 100)),
        },
    )
    print(f"Collected {len(normalized)} matching Zhaopin jobs from {len(raw)} paid Actor result(s).")


if __name__ == "__main__":
    main()
