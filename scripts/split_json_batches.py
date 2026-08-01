#!/usr/bin/env python3
"""Split a JSON array into deterministic, byte-bounded import batches."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def encode_batch(records: list[object]) -> bytes:
    """Serialize one compact UTF-8 JSON-array request body."""
    return json.dumps(
        records,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")


def split_json_array(
    input_path: Path,
    output_dir: Path,
    batch_size: int,
    max_bytes: int = 1_000_000,
) -> list[Path]:
    """Write ordered batches bounded by both record count and encoded bytes."""
    if batch_size < 1:
        raise ValueError("batch_size must be at least 1")
    if max_bytes < 2:
        raise ValueError("max_bytes must be at least 2")

    payload = json.loads(input_path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("input JSON must be an array")

    output_dir.mkdir(parents=True, exist_ok=True)
    batches: list[list[object]] = []
    current: list[object] = []

    for index, record in enumerate(payload):
        single_size = len(encode_batch([record]))
        if single_size > max_bytes:
            raise ValueError(
                f"record at index {index} requires {single_size} bytes, "
                f"exceeding max_bytes={max_bytes}"
            )

        candidate = current + [record]
        if current and (
            len(candidate) > batch_size
            or len(encode_batch(candidate)) > max_bytes
        ):
            batches.append(current)
            current = [record]
        else:
            current = candidate

    if current:
        batches.append(current)

    batch_paths: list[Path] = []
    for batch_number, batch in enumerate(batches, start=1):
        batch_path = output_dir / f"batch-{batch_number:04d}.json"
        batch_path.write_bytes(encode_batch(batch))
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
    parser.add_argument(
        "--max-bytes",
        type=int,
        default=1_000_000,
        help="Maximum encoded JSON bytes per batch (default: 1000000)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    batch_paths = split_json_array(
        args.input,
        args.output_dir,
        args.batch_size,
        max_bytes=args.max_bytes,
    )
    if not batch_paths:
        raise ValueError("input JSON array is empty")

    largest_batch = max(path.stat().st_size for path in batch_paths)
    print(
        f"Prepared {len(batch_paths)} import batches with at most "
        f"{args.batch_size} jobs and {args.max_bytes} bytes each; "
        f"largest batch is {largest_batch} bytes."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
