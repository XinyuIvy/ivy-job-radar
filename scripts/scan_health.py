from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default


def run(scan_dir: Path, history_limit: int) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    receipt = load(scan_dir / "run_receipt_latest.json", {})
    company = load(scan_dir / "company_portal_summary.json", {})
    history = load(scan_dir / "scan_health_history.json", [])
    history = history if isinstance(history, list) else []
    previous = history[-1] if history and isinstance(history[-1], dict) else {}
    anomalies: list[dict[str, Any]] = []

    imported = int(receipt.get("imported") or 0)
    previous_imported = int(previous.get("imported") or 0)
    if previous_imported and imported < previous_imported * 0.4:
        anomalies.append(
            {
                "type": "large_job_count_drop",
                "current": imported,
                "previous": previous_imported,
                "severity": "high",
            }
        )
    attempted = int(company.get("companies_attempted") or 0)
    succeeded = int(company.get("companies_succeeded") or 0)
    success_rate = succeeded / attempted if attempted else 0.0
    if attempted and success_rate < 0.5:
        anomalies.append(
            {
                "type": "low_company_portal_success_rate",
                "current": round(success_rate, 4),
                "severity": "warning",
            }
        )
    failed_sources = receipt.get("failed_sources", [])
    if failed_sources:
        anomalies.append(
            {
                "type": "source_failures",
                "count": len(failed_sources),
                "severity": "warning",
            }
        )

    snapshot = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "state": "warning" if anomalies else "healthy",
        "imported": imported,
        "fetched": int(receipt.get("fetched") or 0),
        "failed_source_count": len(failed_sources),
        "company_attempted": attempted,
        "company_succeeded": succeeded,
        "company_success_rate": round(success_rate, 4),
        "anomalies": anomalies,
    }
    history.append(snapshot)
    return snapshot, history[-max(1, history_limit):]


def main() -> None:
    parser = argparse.ArgumentParser(description="Record scan trends and deterministic health anomalies.")
    parser.add_argument("--scan-dir", type=Path, default=Path("data/scans"))
    parser.add_argument("--history-limit", type=int, default=90)
    args = parser.parse_args()
    snapshot, history = run(args.scan_dir, args.history_limit)
    (args.scan_dir / "scan_health_latest.json").write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (args.scan_dir / "scan_health_history.json").write_text(
        json.dumps(history, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Scan health: {snapshot['state']} with {len(snapshot['anomalies'])} anomaly flag(s).")


if __name__ == "__main__":
    main()
