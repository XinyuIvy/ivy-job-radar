#!/usr/bin/env python3
"""Split a JSON array into deterministic import batches."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def split_json_array(
    input_path: Path,
    output_dir: Path,
    batch_size: int,
) -> list[Path]:
    """Write ordered JSON-array batches and return their paths."""
    if batch_size < 1:
        raise ValueError("batch_size must be at least 1")

    payload = json.loads(input_path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("input JSON must be an array")

    output_dir.mkdir(parents=True, exist_ok=True)
    batch_paths: list[Path] = []
    for start in range(0, len(payload), batch_size):
        batch_number = len(batch_paths) + 1
        batch_path = output_dir / f"batch-{batch_number:04d}.json"
        batch_path.write_text(
            json.dumps(payload[start : start + batch_size], ensure_ascii=False),
            encoding="utf-8",
        )
        batch_paths.append(batch_path)

    return batch_paths


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Split a JSON array into smaller import requests."
    )
    parser.add_argument("input", type=Path, help="Input JSON array")
    parser.add_argument("output_dir", type=Path, help="Directory for batch files")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=40,
        help="Maximum records per batch (default: 40)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    batch_paths = split_json_array(args.input, args.output_dir, args.batch_size)
    if not batch_paths:
        raise ValueError("input JSON array is empty")

    print(
        f"Prepared {len(batch_paths)} import batches "
        f"with at most {args.batch_size} jobs each."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
