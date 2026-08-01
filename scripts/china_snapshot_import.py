from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


TITLE_KEYS = (
    "title",
    "jobTitle",
    "job_title",
    "jobName",
    "job_name",
    "positionName",
    "position_name",
    "position",
)
COMPANY_KEYS = (
    "company",
    "companyName",
    "company_name",
    "employer",
    "hiringOrganization",
)
URL_KEYS = (
    "job_url",
    "jobUrl",
    "detailUrl",
    "detail_url",
    "url",
    "link",
    "href",
)
DESCRIPTION_KEYS = (
    "full_description",
    "description",
    "jobDescription",
    "job_description",
    "content",
    "text",
    "jd",
)
LOCATION_KEYS = (
    "location",
    "city",
    "cityName",
    "city_name",
    "address",
    "workplace",
)
CONTAINER_KEYS = ("jobs", "items", "records", "results", "data", "list")
TRACKING_KEYS = {
    "from",
    "ka",
    "ref",
    "referrer",
    "source",
    "src",
    "utm_campaign",
    "utm_content",
    "utm_medium",
    "utm_source",
    "utm_term",
}
TARGET_TITLE = re.compile(
    r"生物统计|医学统计|临床统计|统计科学|统计师|数据科学|数据科学家|"
    r"机器学习科学家|应用科学家|研究科学家|量化研究|定量研究|量化分析|"
    r"真实世界|卫生经济|健康经济|流行病|医疗咨询|医药咨询|生命科学咨询|"
    r"biostatistic|statistical scientist|data scientist|applied scientist|"
    r"research scientist|quantitative researcher|quantitative analyst|"
    r"epidemiolog|health economics|healthcare consultant|life sciences consultant",
    re.IGNORECASE,
)
EXCLUDED_TITLE = re.compile(
    r"实习|博士后|高级|资深|首席|总监|经理|负责人|专家|架构师|"
    r"软件工程|数据工程|大模型|自然语言|intern|postdoc|postdoctoral|"
    r"senior|principal|staff|manager|director|lead|head of|"
    r"software engineer|data engineer|generative ai|large language model|\bllm\b|\bnlp\b",
    re.IGNORECASE,
)


def title_exclusion_reason(title: str) -> str:
    if not TARGET_TITLE.search(title):
        return "non_target_title"
    excluded = EXCLUDED_TITLE.search(title)
    if excluded:
        return f"excluded_title:{excluded.group(0).casefold()}"
    return ""


SOURCE_HOSTS = {
    "zhipin.com": "BOSS直聘·人工捕获",
    "liepin.com": "猎聘·人工捕获",
    "zhaopin.com": "智联招聘·人工捕获",
    "51job.com": "前程无忧·人工捕获",
    "lagou.com": "拉勾·人工捕获",
    "jobonline.cn": "就业在线·人工捕获",
    "mokahr.com": "Moka招聘·人工捕获",
    "feishu.cn": "飞书招聘·人工捕获",
}


def clean(value: object) -> str:
    if isinstance(value, dict):
        value = value.get("name") or value.get("title") or value.get("value") or ""
    return re.sub(r"\s+", " ", html.unescape(str(value or ""))).strip()


def first_value(row: dict[str, Any], keys: Iterable[str]) -> str:
    for key in keys:
        value = row.get(key)
        if value not in (None, "", [], {}):
            return clean(value)
    return ""


def canonical_url(value: object) -> str:
    url = clean(value)
    if not url:
        return ""
    try:
        parts = urlsplit(url)
    except ValueError:
        return url
    query = urlencode(
        sorted(
            (key, current)
            for key, current in parse_qsl(parts.query, keep_blank_values=True)
            if key.lower() not in TRACKING_KEYS
        )
    )
    return urlunsplit(
        (
            parts.scheme.lower(),
            parts.netloc.lower().removeprefix("www."),
            parts.path.rstrip("/") or "/",
            query,
            "",
        )
    )


def source_for(url: str, fallback: str) -> str:
    host = (urlsplit(url).hostname or "").lower().removeprefix("www.")
    for suffix, source in SOURCE_HOSTS.items():
        if host == suffix or host.endswith("." + suffix):
            return source
    return fallback


def infer_track(text: str) -> str:
    if re.search(r"量化|quantitative|systematic", text, re.IGNORECASE):
        return "Quant"
    if re.search(r"咨询|consulting", text, re.IGNORECASE):
        return "Consulting"
    if re.search(
        r"生物统计|医学统计|临床统计|流行病|卫生经济|真实世界|biostat|epidemiol|health economics",
        text,
        re.IGNORECASE,
    ):
        return "Pharma"
    if re.search(r"医疗|医学影像|临床ai|medical|healthcare", text, re.IGNORECASE):
        return "Healthcare AI"
    return "Technology"


def skill_matches(text: str) -> list[str]:
    patterns = (
        ("R", r"(?:^|\W)R(?:\W|$)"),
        ("Python", r"\bPython\b"),
        ("SAS", r"\bSAS\b"),
        ("SQL", r"\bSQL\b"),
        ("Biostatistics", r"生物统计|biostat"),
        ("Clinical trials", r"临床试验|clinical trials?"),
        ("Causal inference", r"因果推断|causal inference"),
        ("Survival analysis", r"生存分析|survival analysis"),
        ("Longitudinal analysis", r"纵向|longitudinal"),
        ("Machine learning", r"机器学习|machine learning"),
        ("Real-world evidence", r"真实世界|real.world evidence|\brwe\b"),
        ("Health economics", r"卫生经济|健康经济|health economics|\bheor\b"),
    )
    return [name for name, pattern in patterns if re.search(pattern, text, re.IGNORECASE)][:12]


def flatten_candidates(payload: Any) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen: set[int] = set()

    def visit(value: Any, depth: int = 0) -> None:
        if depth > 8 or id(value) in seen:
            return
        if isinstance(value, (dict, list)):
            seen.add(id(value))
        if isinstance(value, list):
            for item in value:
                visit(item, depth + 1)
            return
        if not isinstance(value, dict):
            return
        has_title = any(clean(value.get(key)) for key in TITLE_KEYS)
        has_url = any(clean(value.get(key)) for key in URL_KEYS)
        has_description = any(clean(value.get(key)) for key in DESCRIPTION_KEYS)
        if has_title and (has_url or has_description):
            candidates.append(value)
            return
        for key in CONTAINER_KEYS:
            if key in value:
                visit(value[key], depth + 1)

    visit(payload)
    return candidates


def read_rows(path: Path) -> list[dict[str, Any]]:
    suffix = path.suffix.lower()
    if suffix in {".json", ".jsonl", ".ndjson"}:
        text = path.read_text(encoding="utf-8-sig")
        if suffix == ".json":
            return flatten_candidates(json.loads(text))
        rows: list[dict[str, Any]] = []
        for line in text.splitlines():
            if line.strip():
                rows.extend(flatten_candidates(json.loads(line)))
        return rows
    if suffix in {".csv", ".tsv"}:
        delimiter = "\t" if suffix == ".tsv" else ","
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            return [dict(row) for row in csv.DictReader(handle, delimiter=delimiter)]
    return []


def normalize(row: dict[str, Any], imported_at: str, fallback_source: str) -> dict[str, Any] | None:
    title = first_value(row, TITLE_KEYS)
    if title_exclusion_reason(title):
        return None
    company = first_value(row, COMPANY_KEYS) or "待核验公司"
    url = canonical_url(first_value(row, URL_KEYS))
    description = first_value(row, DESCRIPTION_KEYS)
    location = first_value(row, LOCATION_KEYS) or "中国"
    combined = f"{title} {description}"
    source = source_for(url, clean(row.get("source")) or fallback_source)
    degree_evidence = bool(re.search(r"博士|ph\.?d\.?|doctorate|doctoral", combined, re.IGNORECASE))
    experience_evidence = bool(re.search(r"\d+\s*年|\d+\+?\s*years?", combined, re.IGNORECASE))
    score = 45 + (15 if degree_evidence else 0) + (10 if description else 0) + min(20, len(skill_matches(combined)) * 3)
    identity = url or f"{company.casefold()}::{title.casefold()}::{location.casefold()}"
    return {
        "job_key": hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24],
        "company": company,
        "title": title,
        "location": location,
        "region": "中国",
        "track": infer_track(combined),
        "score": min(100, score),
        "visa": "不适用",
        "evidence": (
            f"{source}可见页面或导出快照；"
            + ("已捕获博士学历证据；" if degree_evidence else "尚需核验博士学历要求；")
            + ("已捕获经验年限证据。" if experience_evidence else "尚需核验最低经验年限。")
        ),
        "skills": skill_matches(combined),
        "job_url": url,
        "canonical_url": url,
        "application_id": clean(row.get("id") or row.get("jobId") or row.get("job_id")),
        "source": source,
        "full_description": description,
        "discovered_at": clean(row.get("discovered_at") or row.get("capturedAt")) or imported_at,
        "checked_at": imported_at,
        "status": "待核验" if not (description and degree_evidence) else "已捕获完整JD",
    }


def collect_inputs(paths: list[Path]) -> list[Path]:
    files: list[Path] = []
    for path in paths:
        if path.is_dir():
            files.extend(
                current
                for current in path.rglob("*")
                if current.is_file() and current.suffix.lower() in {".json", ".jsonl", ".ndjson", ".csv", ".tsv"}
            )
        elif path.is_file():
            files.append(path)
    return sorted(set(files))


def run(paths: list[Path], fallback_source: str = "中国招聘网站·导入快照") -> tuple[list[dict[str, Any]], dict[str, Any]]:
    imported_at = datetime.now(timezone.utc).isoformat()
    records: dict[str, dict[str, Any]] = {}
    files = collect_inputs(paths)
    raw_rows = 0
    exclusion_counts: dict[str, int] = {}
    errors: list[dict[str, str]] = []
    for path in files:
        try:
            rows = read_rows(path)
        except (OSError, UnicodeError, json.JSONDecodeError, csv.Error) as exc:
            errors.append({"file": str(path), "error": str(exc)})
            continue
        raw_rows += len(rows)
        for row in rows:
            normalized = normalize(row, imported_at, fallback_source)
            if normalized is None:
                reason = title_exclusion_reason(first_value(row, TITLE_KEYS)) or "other"
                exclusion_counts[reason] = exclusion_counts.get(reason, 0) + 1
                continue
            key = str(normalized["job_key"])
            current = records.get(key)
            if current is None or len(str(normalized.get("full_description") or "")) > len(str(current.get("full_description") or "")):
                records[key] = normalized
    jobs = sorted(records.values(), key=lambda item: (-int(item["score"]), str(item["company"]), str(item["title"])))
    summary = {
        "generated_at": imported_at,
        "state": "failed" if errors and not jobs else "warning" if errors else "completed",
        "files_scanned": len(files),
        "raw_rows": raw_rows,
        "matched_jobs": len(jobs),
        "excluded_rows": sum(exclusion_counts.values()),
        "excluded_reasons": dict(sorted(exclusion_counts.items())),
        "failed_sources": [
            {"source": f"china_snapshot:{item['file']}", "error": item["error"]}
            for item in errors
        ],
    }
    return jobs, summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize Chinese job-board exports and bookmarklet captures.")
    parser.add_argument("inputs", nargs="*", type=Path, default=[Path("data/imports/china")])
    parser.add_argument("--output-dir", type=Path, default=Path("data/scans"))
    parser.add_argument("--source", default="中国招聘网站·导入快照")
    args = parser.parse_args()
    jobs, summary = run(args.inputs, args.source)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "china_local_import_latest.json").write_text(
        json.dumps(jobs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (args.output_dir / "china_local_import_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Imported {summary['matched_jobs']} matching China jobs from "
        f"{summary['files_scanned']} snapshot file(s)."
    )


if __name__ == "__main__":
    main()
