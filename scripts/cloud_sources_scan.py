from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree


TARGET_TITLE = re.compile(
    r"biostatistic|statistical scientist|data scientist|applied scientist|"
    r"research scientist|quantitative researcher|quantitative analyst|"
    r"epidemiolog|health economics|outcomes research|decision scientist",
    re.IGNORECASE,
)
EXCLUDED_TITLE = re.compile(
    r"intern|postdoc|postdoctoral|senior|principal|staff|director|vice president|"
    r"manager|lead|head of|software engineer|data engineer|machine learning engineer|"
    r"generative ai|large language model|\bllm\b|\bnlp\b",
    re.IGNORECASE,
)
SOURCES = (
    ("remoteok", "https://remoteok.com/api"),
    ("remotive", "https://remotive.com/api/remote-jobs?search="),
    ("jobicy", "https://jobicy.com/api/v2/remote-jobs?count=50"),
    ("himalayas", "https://himalayas.app/jobs/api?limit=20&offset=0"),
    ("arbeitnow", "https://www.arbeitnow.com/api/job-board-api"),
    ("weworkremotely", "https://weworkremotely.com/remote-jobs.rss"),
)


def fetch(url: str, timeout: int = 35, retries: int = 2) -> bytes:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        request = Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; IvyJobRadar/1.0)",
                "Accept": "application/json,application/rss+xml,application/xml,text/xml,*/*",
            },
        )
        try:
            with urlopen(request, timeout=timeout) as response:
                return response.read(8_000_000)
        except (HTTPError, URLError, TimeoutError) as error:
            last_error = error
            if isinstance(error, HTTPError) and error.code not in {408, 425, 429, 500, 502, 503, 504}:
                raise
            if attempt < retries:
                # Exponential backoff prevents temporary rate limits from failing the whole source.
                time.sleep((2 ** attempt) + 0.25)
    assert last_error is not None
    raise last_error


def clean(value: object) -> str:
    return re.sub(r"\s+", " ", unescape(str(value or ""))).strip()


def strip_html(value: object) -> str:
    return clean(re.sub(r"<[^>]+>", " ", str(value or "")))


def pick(item: dict[str, object], *names: str) -> str:
    for name in names:
        value = item.get(name)
        if value not in (None, ""):
            return clean(value)
    return ""


def normalize(source: str, item: dict[str, object], scanned_at: str) -> dict[str, object] | None:
    title = pick(item, "position", "title", "jobTitle", "name")
    company = pick(item, "company", "company_name", "companyName")
    url = pick(item, "url", "job_url", "jobUrl", "apply_url")
    description = strip_html(pick(item, "description", "jobDescription", "content"))
    if not title or not company or not url:
        return None
    if not TARGET_TITLE.search(title) or EXCLUDED_TITLE.search(title):
        return None

    combined = f"{title} {description}"
    if not re.search(r"ph\.?d|doctorate|doctoral|biostat|statistics|quantitative", combined, re.IGNORECASE):
        return None

    location = pick(item, "location", "candidate_required_location", "jobGeo") or "Remote"
    identity = f"{company.lower()}::{title.lower()}::{location.lower()}"
    score = 55
    if re.search(r"ph\.?d|doctorate|doctoral", combined, re.IGNORECASE):
        score += 10
    if re.search(r"biostat|clinical trial|causal inference|survival|longitudinal", combined, re.IGNORECASE):
        score += 15
    if re.search(r"\bR\b|Python|SAS|SQL", combined):
        score += 8

    return {
        "job_key": hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24],
        "company": company,
        "title": title,
        "location": location,
        "region": "美国",
        "track": "Pharma" if re.search(r"biostat|clinical|pharma|health", combined, re.IGNORECASE) else "Technology",
        "score": min(score, 88),
        "visa": "JD 未明确",
        "evidence": f"{source} 公开云端来源发现；需继续核验官网、完整 JD 与 sponsorship。",
        "skills": [
            name for name, pattern in (
                ("R", r"(?:^|\W)R(?:\W|$)"),
                ("Python", r"\bPython\b"),
                ("SAS", r"\bSAS\b"),
                ("SQL", r"\bSQL\b"),
                ("Biostatistics", r"biostat"),
                ("Clinical trials", r"clinical trial"),
            ) if re.search(pattern, combined, re.IGNORECASE)
        ][:7],
        "job_url": url,
        "canonical_url": url,
        "application_id": pick(item, "id", "job_id", "slug"),
        "source": source,
        "discovered_at": scanned_at,
        "checked_at": scanned_at,
        "status": "待官网核验",
        "full_description": description[:120_000],
    }


def json_items(source: str, payload: object) -> list[dict[str, object]]:
    if isinstance(payload, list):
        rows = payload[1:] if source == "remoteok" and payload and isinstance(payload[0], dict) and "legal" in payload[0] else payload
        return [row for row in rows if isinstance(row, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("jobs", "data", "results"):
        rows = payload.get(key)
        if isinstance(rows, list):
            return [row for row in rows if isinstance(row, dict)]
    return []


def rss_items(body: bytes) -> list[dict[str, object]]:
    root = ElementTree.fromstring(body)
    rows: list[dict[str, object]] = []
    for item in root.findall(".//item"):
        rows.append({
            "title": item.findtext("title", ""),
            "company": item.findtext("{http://www.w3.org/2005/Atom}author", "") or "Unknown",
            "url": item.findtext("link", ""),
            "description": item.findtext("description", ""),
            "location": "Remote",
        })
    return rows


def run() -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    scanned_at = datetime.now(timezone.utc).isoformat()
    records: list[dict[str, object]] = []
    stats: list[dict[str, object]] = []
    for source, url in SOURCES:
        try:
            body = fetch(url)
            items = rss_items(body) if source == "weworkremotely" else json_items(source, json.loads(body))
            matched = [job for item in items if (job := normalize(source, item, scanned_at))]
            records.extend(matched)
            stats.append({"source": source, "state": "success", "scanned": len(items), "matched": len(matched)})
        except (HTTPError, URLError, TimeoutError, ValueError, ElementTree.ParseError, json.JSONDecodeError) as error:
            # Keep the global refresh alive when one public source is unavailable.
            stats.append({"source": source, "state": "failed", "scanned": 0, "matched": 0, "error": str(error)[:300]})
        time.sleep(0.5)

    deduplicated = {str(row["job_key"]): row for row in records}
    return sorted(deduplicated.values(), key=lambda row: (-int(row["score"]), str(row["company"]))), stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect jobs from credential-free cloud sources.")
    parser.add_argument("--output-dir", type=Path, default=Path("data/scans"))
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    records, stats = run()
    (args.output_dir / "cloud_sources_jobs_latest.json").write_text(
        json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (args.output_dir / "cloud_sources_summary.json").write_text(
        json.dumps(
            {"generated_at": datetime.now(timezone.utc).isoformat(), "matched_jobs": len(records), "sources": stats},
            ensure_ascii=False,
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(records)} deduplicated jobs from credential-free cloud sources.")


if __name__ == "__main__":
    main()
