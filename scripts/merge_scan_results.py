from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


SOURCE_FILES = (
    "us_jobs_verified_latest.json",
    "china_jobs_latest.json",
    "cloud_sources_jobs_latest.json",
    "aggregator_jobs_verified_latest.json",
    "company_portal_jobs_latest.json",
)
TRACKING_KEYS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gh_src",
    "source",
    "ref",
}
SKILL_PATTERNS = (
    ("R", r"(?:^|\W)R(?:\W|$)"),
    ("Python", r"\bPython\b"),
    ("SAS", r"\bSAS\b"),
    ("SQL", r"\bSQL\b"),
    ("Machine learning", r"machine learning"),
    ("Clinical trials", r"clinical trials?"),
    ("Causal inference", r"causal inference"),
    ("Survival analysis", r"survival analysis"),
    ("Longitudinal analysis", r"longitudinal"),
    ("Real-world evidence", r"real.world evidence"),
    ("Health economics", r"health economics"),
)
ATS_HOSTS = (
    "greenhouse.io",
    "lever.co",
    "ashbyhq.com",
    "myworkdayjobs.com",
    "smartrecruiters.com",
    "workable.com",
    "recruitee.com",
    "bamboohr.com",
    "breezy.hr",
    "personio.de",
    "personio.com",
    "pinpointhq.com",
    "rippling.com",
    "oraclecloud.com",
)


def clean(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def canonical_url(value: object) -> str:
    url = clean(value)
    if not url:
        return ""
    parts = urlsplit(url)
    query = urlencode(
        sorted((key, current) for key, current in parse_qsl(parts.query, keep_blank_values=True) if key.lower() not in TRACKING_KEYS)
    )
    path = re.sub(r"/+$", "", parts.path) or "/"
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower().removeprefix("www."), path, query, ""))


def identity(job: dict[str, Any]) -> str:
    url = canonical_url(job.get("canonical_url") or job.get("official_url") or job.get("job_url"))
    if url:
        return f"url:{url}"
    application_id = clean(job.get("application_id"))
    company = clean(job.get("company")).casefold()
    if application_id and company:
        return f"app:{company}:{application_id.casefold()}"
    title = re.sub(r"\W+", " ", clean(job.get("title")).casefold()).strip()
    location = re.sub(r"\W+", " ", clean(job.get("location")).casefold()).strip()
    return f"fallback:{company}:{title}:{location}"


def quality(job: dict[str, Any]) -> tuple[int, int, int, int]:
    status = clean(job.get("status"))
    verified = int(status in {"开放", "已核验", "open"} or bool(clean(job.get("official_url"))))
    description = len(clean(job.get("full_description")))
    evidence = len(clean(job.get("evidence")))
    score = int(job.get("score") or 0)
    return verified, min(description, 100_000), evidence, score


def merge_record(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    primary, secondary = (right, left) if quality(right) > quality(left) else (left, right)
    merged = dict(secondary)
    merged.update({key: value for key, value in primary.items() if value not in (None, "", [], {})})
    sources = {
        clean(item)
        for item in (
            *(left.get("sources", []) if isinstance(left.get("sources"), list) else []),
            *(right.get("sources", []) if isinstance(right.get("sources"), list) else []),
            left.get("source"),
            right.get("source"),
        )
        if clean(item)
    }
    merged["sources"] = sorted(sources)
    merged["source"] = " · ".join(sorted(sources))[:500]
    skills = [
        clean(item)
        for values in (left.get("skills"), right.get("skills"))
        if isinstance(values, list)
        for item in values
        if clean(item)
    ]
    merged["skills"] = list(dict.fromkeys(skills))[:12]
    url = canonical_url(merged.get("canonical_url") or merged.get("official_url") or merged.get("job_url"))
    if url:
        merged["canonical_url"] = url
        merged["job_url"] = clean(merged.get("official_url")) or url
    merged["score"] = max(int(left.get("score") or 0), int(right.get("score") or 0))
    return merged


def section(text: str, start_pattern: str, stop_pattern: str) -> str:
    match = re.search(start_pattern, text, re.I)
    if not match:
        return ""
    tail = text[match.end():]
    stop = re.search(stop_pattern, tail, re.I)
    return tail[: stop.start()] if stop else tail[:5000]


def skill_matches(text: str) -> list[str]:
    return [name for name, pattern in SKILL_PATTERNS if re.search(pattern, text, re.I)]


def enrich_job(job: dict[str, Any], previous_title_urls: dict[str, set[str]]) -> dict[str, Any]:
    enriched = dict(job)
    description = clean(job.get("full_description"))
    required_text = section(
        description,
        r"(?:required|minimum|basic)\s+(?:skills|qualifications|requirements)",
        r"(?:preferred|desired|nice.to.have)\s+(?:skills|qualifications|requirements)",
    )
    preferred_text = section(
        description,
        r"(?:preferred|desired|nice.to.have)\s+(?:skills|qualifications|requirements)",
        r"(?:responsibilities|benefits|compensation|about us)",
    )
    enriched["required_skills"] = skill_matches(required_text)
    enriched["preferred_skills"] = skill_matches(preferred_text)

    evidence_missing: list[str] = []
    if not re.search(r"ph\.?d|doctorate|doctoral|master'?s|bachelor'?s|博士|硕士|本科", description, re.I):
        evidence_missing.append("degree")
    if not re.search(r"\b\d+\+?\s*(?:years?|yrs?)\b|年.{0,8}经验", description, re.I):
        evidence_missing.append("experience")
    enriched["evidence_missing"] = evidence_missing
    if evidence_missing:
        base_score = int(enriched.get("score_before_uncertainty") or enriched.get("score") or 0)
        enriched["score_before_uncertainty"] = base_score
        enriched["score"] = max(0, base_score - (4 * len(evidence_missing)))

    flags: list[str] = []
    url = canonical_url(enriched.get("canonical_url") or enriched.get("job_url"))
    hostname = (urlsplit(url).hostname or "").lower()
    if not url.startswith("https://"):
        flags.append("non_https_or_missing_url")
    if hostname and not any(hostname == current or hostname.endswith("." + current) for current in ATS_HOSTS):
        if any(token in hostname for token in ("bit.ly", "tinyurl", "forms.gle", "goo.gl")):
            flags.append("suspicious_shortener_or_form")
    if not description:
        flags.append("missing_full_description")
    if clean(enriched.get("status")) not in {"开放", "已核验", "open"}:
        flags.append("open_status_not_confirmed")
    title_key = (
        re.sub(r"\W+", "", clean(enriched.get("company")).casefold())
        + "::"
        + re.sub(r"\W+", "", clean(enriched.get("title")).casefold())
    )
    historical_urls = previous_title_urls.get(title_key, set())
    if url and historical_urls and url not in historical_urls:
        flags.append("possible_repost_new_url")
    enriched["legitimacy_flags"] = flags
    enriched["legitimacy_score"] = max(0, 100 - 18 * len(flags))
    return enriched


def load_list(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [row for row in payload if isinstance(row, dict)] if isinstance(payload, list) else []


def parse_time(value: object) -> datetime | None:
    text = clean(value).replace("Z", "+00:00")
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def run(
    scan_dir: Path,
    stale_days: int,
    region_filter: str = "",
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    started_at = datetime.now(timezone.utc)
    merged: dict[str, dict[str, Any]] = {}
    source_counts: dict[str, int] = {}
    rejected = 0
    raw_count = 0
    for filename in SOURCE_FILES:
        rows = load_list(scan_dir / filename)
        if region_filter:
            rows = [row for row in rows if clean(row.get("region")) == region_filter]
        source_counts[filename] = len(rows)
        raw_count += len(rows)
        for job in rows:
            if not clean(job.get("company")) or not clean(job.get("title")):
                rejected += 1
                continue
            if clean(job.get("status")) in {"已关闭", "closed"}:
                rejected += 1
                continue
            key = identity(job)
            current = merged.get(key)
            merged[key] = job if current is None else merge_record(current, job)

    previous = load_list(scan_dir / "all_jobs_latest.json")
    if region_filter:
        previous = [row for row in previous if clean(row.get("region")) == region_filter]
    previous_keys = {identity(job) for job in previous}
    current_keys = set(merged)
    retained_missing = 0
    stale_cutoff = started_at - timedelta(days=max(0, stale_days))
    for old_job in previous:
        key = identity(old_job)
        if key in merged:
            continue
        last_seen = parse_time(
            old_job.get("last_seen_at")
            or old_job.get("checked_at")
            or old_job.get("discovered_at")
        )
        if last_seen is not None and last_seen >= stale_cutoff:
            retained = dict(old_job)
            retained["status"] = "本轮未再次发现"
            retained["retained_until"] = (last_seen + timedelta(days=stale_days)).isoformat()
            merged[key] = retained
            retained_missing += 1

    previous_title_urls: dict[str, set[str]] = {}
    for old_job in previous:
        title_key = (
            re.sub(r"\W+", "", clean(old_job.get("company")).casefold())
            + "::"
            + re.sub(r"\W+", "", clean(old_job.get("title")).casefold())
        )
        old_url = canonical_url(old_job.get("canonical_url") or old_job.get("job_url"))
        if old_url:
            previous_title_urls.setdefault(title_key, set()).add(old_url)

    jobs = [enrich_job(job, previous_title_urls) for job in merged.values()]
    for job in jobs:
        key = identity(job)
        job["job_key"] = clean(job.get("job_key")) or hashlib.sha256(key.encode("utf-8")).hexdigest()[:24]
        if key in current_keys:
            job["last_seen_at"] = started_at.isoformat()
    jobs.sort(key=lambda row: (-int(row.get("score") or 0), clean(row.get("company")), clean(row.get("title"))))

    final_keys = set(merged)
    receipt = {
        "run_started_at": started_at.isoformat(),
        "terminal_state": "completed",
        "source_counts": source_counts,
        "fetched": raw_count,
        "verified_or_open": sum(1 for job in jobs if clean(job.get("status")) in {"开放", "已核验", "open"}),
        "rejected": rejected,
        "deduplicated": raw_count - rejected - len(current_keys),
        "imported": len(jobs),
        "new": len(current_keys - previous_keys),
        "updated_or_unchanged": len(current_keys & previous_keys),
        "temporarily_retained": retained_missing,
        "pruned_as_stale": len(previous_keys - final_keys),
        "no_longer_seen": len(previous_keys - current_keys),
        "stale_policy_days": stale_days,
        "failed_sources": [],
    }
    for summary_path in scan_dir.glob("*summary.json"):
        try:
            summary = json.loads(summary_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        if isinstance(summary, dict):
            if summary.get("failed_sources"):
                receipt["failed_sources"].extend(summary["failed_sources"])
            for item in summary.get("failure_companies", []):
                if isinstance(item, dict):
                    receipt["failed_sources"].append(
                        {
                            "source": f"company_portal:{item.get('company', 'unknown')}",
                            "error": item.get("error", "unknown failure"),
                        }
                    )
            for item in summary.get("failed_chunk_details", []):
                if isinstance(item, dict):
                    receipt["failed_sources"].append(
                        {
                            "source": f"aggregator_chunk:{item.get('chunk', 'unknown')}",
                            "error": item.get("error", "unknown failure"),
                        }
                    )
            for item in summary.get("sources", []):
                if isinstance(item, dict) and item.get("state") == "failed":
                    receipt["failed_sources"].append(
                        {"source": item.get("source"), "error": item.get("error", "unknown failure")}
                    )
    return jobs, receipt


def main() -> None:
    parser = argparse.ArgumentParser(description="Canonicalize and merge all cloud scan outputs.")
    parser.add_argument("--scan-dir", type=Path, default=Path("data/scans"))
    parser.add_argument("--stale-days", type=int, default=14)
    parser.add_argument("--region", choices=("美国", "中国"), default="")
    args = parser.parse_args()
    args.scan_dir.mkdir(parents=True, exist_ok=True)
    jobs, receipt = run(args.scan_dir, args.stale_days, args.region)
    (args.scan_dir / "all_jobs_latest.json").write_text(
        json.dumps(jobs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (args.scan_dir / "run_receipt_latest.json").write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Merged {receipt['fetched']} fetched rows into {receipt['imported']} canonical jobs; "
        f"{receipt['new']} are new to the latest snapshot."
    )


if __name__ == "__main__":
    main()
