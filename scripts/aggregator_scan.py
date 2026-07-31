from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "https://feashliaa.github.io/job-board-data/data/chunks"
TARGET_TITLE = re.compile(
    r"\b(?:biostatistician|statistical scientist|data scientist|applied scientist|"
    r"research scientist|decision scientist|quantitative researcher|quantitative analyst|"
    r"epidemiologist|health economist|health economics|outcomes researcher|"
    r"outcomes research|clinical statistician|medical statistician)\b",
    re.IGNORECASE,
)
EXCLUDED_TITLE = re.compile(
    r"\b(?:intern|internship|postdoc|postdoctoral|senior|sr\.?|principal|staff|"
    r"director|manager|lead|head|vice president|vp|software engineer|data engineer|"
    r"machine learning engineer|nlp|generative ai|large language model|llm)\b",
    re.IGNORECASE,
)
US_LOCATION = re.compile(
    r"\b(?:united states|usa|u\.s\.|remote(?:\s*[-–—]\s*us)?|"
    r"alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|"
    r"florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|"
    r"louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|"
    r"missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|"
    r"new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|"
    r"rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|"
    r"virginia|washington|west virginia|wisconsin|wyoming|district of columbia)\b",
    re.IGNORECASE,
)
CHINA_LOCATION = re.compile(
    r"(?:中国|北京|上海|深圳|广州|杭州|南京|苏州|成都|武汉|西安|天津|重庆|"
    r"\bchina\b|\bbeijing\b|\bshanghai\b|\bshenzhen\b|\bguangzhou\b|\bhangzhou\b)",
    re.IGNORECASE,
)


def fetch_json(url: str, compressed: bool = False, timeout: int = 45) -> object:
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; IvyJobRadar/1.0)",
            "Accept": "application/json,application/gzip,*/*",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        body = response.read()
    if compressed:
        body = gzip.decompress(body)
    return json.loads(body)


def clean(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def infer_region(location: str) -> str:
    if CHINA_LOCATION.search(location):
        return "中国"
    if US_LOCATION.search(location):
        return "美国"
    return ""


def infer_track(title: str) -> str:
    if re.search(r"quantitative", title, re.IGNORECASE):
        return "Quant"
    if re.search(
        r"biostat|statistical|epidemiol|health econom|outcomes|clinical statistic|medical statistic",
        title,
        re.IGNORECASE,
    ):
        return "Pharma"
    return "Technology"


def normalize(row: dict[str, object], scanned_at: str) -> dict[str, object] | None:
    title = clean(row.get("title"))
    company = clean(row.get("company"))
    location = clean(row.get("location"))
    url = clean(row.get("url"))
    if not title or not company or not url:
        return None
    if not TARGET_TITLE.search(title) or EXCLUDED_TITLE.search(title):
        return None

    region = infer_region(location)
    if not region:
        return None
    skill_level = clean(row.get("skill_level")).lower()
    if skill_level in {"senior", "executive"}:
        return None

    score = 52
    if re.search(r"biostatistician|statistical scientist|clinical statistician", title, re.IGNORECASE):
        score += 14
    if re.search(r"quantitative researcher|data scientist", title, re.IGNORECASE):
        score += 8
    if skill_level in {"entry", "junior"}:
        score += 8

    identity = url.lower()
    return {
        "job_key": hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24],
        "company": company,
        "title": title,
        "location": location,
        "region": region,
        "track": infer_track(title),
        "score": min(score, 82),
        "visa": "不适用" if region == "中国" else "JD 未明确",
        "evidence": (
            "Job Board Aggregator 全量分片发现；来源为公司官方 ATS URL，"
            "学历、经验、开放状态与完整 JD 仍需下一步页面核验。"
        ),
        "skills": [],
        "job_url": url,
        "canonical_url": url,
        "application_id": "",
        "source": f"Job Board Aggregator · {clean(row.get('ats')) or 'ATS'}",
        "aggregator_first_seen": clean(row.get("first_seen")),
        "aggregator_scraped_at": clean(row.get("scraped_at")),
        "discovered_at": scanned_at,
        "checked_at": scanned_at,
        "status": "待官网核验",
    }


def scan_chunk(base_url: str, chunk_name: str, scanned_at: str) -> tuple[int, list[dict[str, object]]]:
    payload = fetch_json(f"{base_url}/{chunk_name}", compressed=True)
    if not isinstance(payload, list):
        raise ValueError(f"{chunk_name} did not contain a JSON array")
    matched = [
        job
        for row in payload
        if isinstance(row, dict) and (job := normalize(row, scanned_at)) is not None
    ]
    return len(payload), matched


def run(base_url: str, workers: int, max_candidates: int) -> tuple[list[dict[str, object]], dict[str, object]]:
    manifest = fetch_json(f"{base_url}/jobs_manifest.json")
    if not isinstance(manifest, dict) or not isinstance(manifest.get("chunks"), list):
        raise ValueError("Aggregator manifest is missing its chunk list")

    scanned_at = datetime.now(timezone.utc).isoformat()
    rows_scanned = 0
    failed_chunks: list[dict[str, str]] = []
    candidates: list[dict[str, object]] = []
    chunks = [clean(name) for name in manifest["chunks"] if clean(name)]

    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        futures = {
            executor.submit(scan_chunk, base_url, chunk, scanned_at): chunk
            for chunk in chunks
        }
        for future in as_completed(futures):
            chunk = futures[future]
            try:
                scanned, matched = future.result()
                rows_scanned += scanned
                candidates.extend(matched)
            except Exception as error:
                failed_chunks.append({"chunk": chunk, "error": str(error)[:300]})

    deduplicated = {str(job["job_key"]): job for job in candidates}
    ordered = sorted(
        deduplicated.values(),
        key=lambda job: (
            -int(job["score"]),
            str(job["aggregator_first_seen"] or ""),
            str(job["company"]),
        ),
    )[:max_candidates]
    summary = {
        "generated_at": scanned_at,
        "upstream_last_updated": manifest.get("last_updated"),
        "upstream_total_jobs": manifest.get("totalJobs"),
        "chunks_expected": len(chunks),
        "chunks_succeeded": len(chunks) - len(failed_chunks),
        "chunks_failed": len(failed_chunks),
        "rows_scanned": rows_scanned,
        "matched_before_limit": len(deduplicated),
        "candidates_written": len(ordered),
        "candidate_limit": max_candidates,
        "failed_chunk_details": failed_chunks,
        "attribution": {
            "project": "Feashliaa/job-board-aggregator",
            "data_license": "CC BY-NC 4.0",
            "use": "Non-commercial personal job search",
        },
    }
    return ordered, summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Import targeted jobs from Job Board Aggregator.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output-dir", type=Path, default=Path("data/scans"))
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--max-candidates", type=int, default=250)
    args = parser.parse_args()

    jobs, summary = run(args.base_url.rstrip("/"), args.workers, args.max_candidates)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "aggregator_jobs_latest.json").write_text(
        json.dumps(jobs, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (args.output_dir / "aggregator_scan_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"Aggregator scanned {summary['rows_scanned']} rows from "
        f"{summary['chunks_succeeded']}/{summary['chunks_expected']} chunks and wrote {len(jobs)} candidates."
    )


if __name__ == "__main__":
    main()
