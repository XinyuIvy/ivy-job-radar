"""Upload raw extraction batches; all job transformations run on the backend."""
from __future__ import annotations

import argparse
import json
import os
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from split_json_batches import split_json_array

ORIGIN = "https://ivy-job-radar.rourou1199.chatgpt.site"


def post(path: str, body: bytes) -> dict:
    sync_token = os.environ.get("IVY_JOB_RADAR_SYNC_TOKEN", "")
    bypass_token = os.environ.get("SITES_SIWC_BYPASS_TOKEN", "")
    if not sync_token or not bypass_token:
        raise ValueError("Website sync credentials are not fully configured")
    request = Request(ORIGIN + path, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer " + sync_token,
        "OAI-Sites-Authorization": "Bearer " + bypass_token,
    })
    for attempt in range(4):
        try:
            with urlopen(request, timeout=120) as response:
                return json.loads(response.read())
        except HTTPError as error:
            if error.code not in (408, 429, 500, 502, 503, 504) or attempt == 3:
                raise RuntimeError(f"Backend request failed: HTTP {error.code}") from error
        except (URLError, TimeoutError):
            if attempt == 3:
                raise
        time.sleep(2 ** attempt)
    raise RuntimeError("Backend request did not complete")


def sync(input_path: Path, receipt_path: Path) -> dict:
    totals = {"pipeline": "shared-backend-v1", "received": 0, "created": 0,
              "updated": 0, "skipped": 0, "duplicates": 0, "invalid": 0,
              "completed_batches": 0, "state": "running"}

    def save():
        receipt_path.write_text(json.dumps(totals, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    post("/api/scan-status", json.dumps({"state": "running", "phase": "后端统一处理",
         "current_source": "Python 原始数据", "steps_completed": 3, "steps_total": 4, "message": "采集完成，后端正在统一清洗、去重与入库。"}).encode())
    try:
        with tempfile.TemporaryDirectory(prefix="job-radar-raw-") as directory:
            batches = split_json_array(input_path, Path(directory), 100, 1_000_000)
            if not batches:
                raise ValueError("No raw records available for upload")
            totals["total_batches"] = len(batches)
            for batch in batches:
                result = post("/api/jobs/import", batch.read_bytes())
                if not result.get("ok") or result.get("pipeline") != "shared-backend-v1":
                    raise ValueError("Backend does not confirm the shared ingestion pipeline")
                for key in ("received", "created", "updated", "skipped", "duplicates", "invalid"):
                    totals[key] += int(result.get(key, 0))
                totals["completed_batches"] += 1
                save()
        post("/api/jobs/import", b'{"jobs":[],"finalize_run":true}')
        totals["state"] = "completed"
        save()
        post("/api/scan-status", json.dumps({
            "state": "completed", "phase": "完成", "current_source": "统一后端",
            "created": totals["created"], "updated": totals["updated"], "skipped": totals["skipped"],
            "steps_completed": 4, "steps_total": 4,
            "message": f"后端统一处理完成：收到 {totals['received']} 条，新增 {totals['created']} 条，更新 {totals['updated']} 条。",
        }, ensure_ascii=False).encode())
    except Exception:
        totals["state"] = "failed"
        save()
        raise
    return totals


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("data/scans/raw_jobs_latest.json"))
    parser.add_argument("--receipt", type=Path, default=Path("data/scans/backend_ingestion_receipt_latest.json"))
    args = parser.parse_args()
    print(json.dumps(sync(args.input, args.receipt), ensure_ascii=False))


if __name__ == "__main__":
    main()
