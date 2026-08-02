#!/usr/bin/env python3
"""Run conservative BOSS searches and sync relevant jobs to Ivy Job Radar."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import plistlib
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


APP_DIR = Path.home() / ".ivy-job-radar"
STATE_FILE = APP_DIR / "boss-state.json"
DETAIL_CACHE_FILE = APP_DIR / "boss-detail-cache.json"
DEFAULT_ENV_FILE = APP_DIR / "collector.env"
DEFAULT_SCRAPER_DIR = APP_DIR / "vendor" / "boss-zhipin-scraper"
DEFAULT_RESULT_DIR = Path.home() / ".boss-zhipin-scraper" / "job-result"
SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_PLAN = SCRIPT_DIR / "search-plan.json"
SCRAPER_REPOSITORY = "https://github.com/eatmoreduck/boss-zhipin-scraper.git"
SCHEDULE_LABEL = "com.ivy.jobradar.boss"

TARGET_TITLE = re.compile(
    r"生物统计|临床统计|医学统计|统计科学家|统计分析|统计建模|统计师|统计|"
    r"数据科学|数据科学家|应用科学家|"
    r"研究科学家|算法研究员|算法科学家|创新算法|科学计算|计算科学家|计算生物|"
    r"量化研究|量化分析|医疗咨询|医药咨询|生命科学咨询|"
    r"真实世界|流行病|卫生经济|健康经济|结局研究|医学影像|"
    r"biostat|statistical scientist|data scientist|applied scientist|"
    r"research scientist|quantitative research|quantitative analyst|"
    r"healthcare consultant|life sciences consultant|epidemiolog|health economics",
    re.IGNORECASE,
)
ALGORITHM_TITLE = re.compile(r"算法研究员|算法科学家|创新算法|科学计算|计算科学家|计算生物", re.IGNORECASE)
ALGORITHM_DOMAIN = re.compile(
    r"生物统计|统计建模|生物信息|计算生物|新药|药物|医药|生命科学|医疗|健康|"
    r"科学智能|科学计算|ai\s*for\s*science|bioinformatics|computational biology|"
    r"drug discovery|pharma|life science|healthcare|medical|statistical modeling",
    re.IGNORECASE,
)
EXCLUDED_ALGORITHM_DOMAIN = re.compile(
    r"生成式|大模型|自然语言处理|推荐算法|广告算法|纯计算机视觉|"
    r"generative\s+ai|large\s+language\s+model|\bllm\b|\bnlp\b|"
    r"recommender|recommendation algorithm|advertising algorithm",
    re.IGNORECASE,
)
EXCLUDED_TITLE = re.compile(
    r"实习|兼职|总监|经理|负责人|高级|资深|首席|专家|架构师|主管|"
    r"intern|part.time|director|principal|staff|senior|manager|lead|head of|vice president|"
    r"软件工程|software engineer|数据工程|data engineer|算法工程|algorithm engineer|"
    r"生成式|大模型|自然语言处理|generative|large language model|\bllm\b|\bnlp\b",
    re.IGNORECASE,
)
OBVIOUSLY_IRRELEVANT = re.compile(
    r"物流统计|仓库统计|生产统计|财务统计|销售统计|门店统计|猪场统计|养殖统计|"
    r"统计文员|数据录入|文员|会计|出纳|客服|行政专员|"
    r"logistics|warehouse|bookkeep|accounting clerk|data entry",
    re.IGNORECASE,
)
EXCLUDED_CORE_CONTENT = re.compile(
    r"大语言模型|大模型|自然语言处理|\bllm\b|\bnlp\b|large language model|"
    r"生成式\s*ai|generative\s*ai",
    re.IGNORECASE,
)
SKILL_RULES = [
    ("Python", re.compile(r"\bpython\b", re.IGNORECASE)),
    ("R", re.compile(r"(?:^|\W)R(?:\W|$)")),
    ("SQL", re.compile(r"\bsql\b", re.IGNORECASE)),
    ("SAS", re.compile(r"\bsas\b", re.IGNORECASE)),
    ("Biostatistics", re.compile(r"biostat|生物统计", re.IGNORECASE)),
    ("Clinical trials", re.compile(r"clinical trial|临床试验", re.IGNORECASE)),
    ("Machine learning", re.compile(r"machine learning|机器学习", re.IGNORECASE)),
    ("Causal inference", re.compile(r"causal inference|因果推断", re.IGNORECASE)),
    ("Longitudinal data", re.compile(r"longitudinal|survival analysis|纵向|生存分析", re.IGNORECASE)),
    ("RWE / HEOR", re.compile(r"real.world|真实世界|\bheor\b|health economics|卫生经济", re.IGNORECASE)),
]


def load_env(path: Path) -> None:
    if not path.exists():
        raise SystemExit(f"Missing collector configuration: {path}")
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        cleaned = value.strip()
        if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {"'", '"'}:
            cleaned = cleaned[1:-1]
        os.environ.setdefault(key.strip(), cleaned)


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def rows_from_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("jobs", "results", "data", "items", "details"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
        if payload and all(isinstance(value, dict) for value in payload.values()):
            return [value for value in payload.values() if isinstance(value, dict)]
    return []


def text(value: Any) -> str:
    return str(value or "").strip()


def required_experience(content: str) -> int | None:
    """Return the largest explicitly required experience floor."""
    years: list[int] = []
    patterns = (
        r"(?:至少|最低|要求|需具备)\s*(\d+)\s*年",
        r"(\d+)\s*年(?:以上)?(?:相关|工作|行业|专业)?经验",
        r"经验\s*(\d+)\s*[-–—至]\s*(\d+)\s*年",
        r"(?:minimum|at least)\s+(\d+)\+?\s+years?",
        r"(\d+)\+?\s+years?(?:\s+of)?\s+(?:relevant|related|professional|industry|work)?\s*experience",
    )
    for pattern in patterns:
        for match in re.finditer(pattern, content, re.IGNORECASE):
            years.extend(int(value) for value in match.groups() if value)
    return max(years) if years else None


def monthly_salary_floor_k(*values: Any) -> float | None:
    """Parse the advertised gross monthly salary floor in thousands of RMB."""
    content = " ".join(text(value) for value in values if text(value)).replace(",", "")
    if not content:
        return None
    annual_patterns = (
        (r"(\d+(?:\.\d+)?)\s*[-–—~至]\s*\d+(?:\.\d+)?\s*万\s*(?:/|每)?年", 10 / 12),
        (r"年薪\s*(\d+(?:\.\d+)?)\s*[-–—~至]\s*\d+(?:\.\d+)?\s*万", 10 / 12),
        (r"年薪\s*(\d+(?:\.\d+)?)\s*万(?:元)?(?:起|以上)", 10 / 12),
    )
    for pattern, multiplier in annual_patterns:
        if match := re.search(pattern, content, re.IGNORECASE):
            return float(match.group(1)) * multiplier
    monthly_patterns = (
        (r"(\d+(?:\.\d+)?)\s*[-–—~至]\s*\d+(?:\.\d+)?\s*[kK](?:\s*/?\s*月)?", 1),
        (r"(?:月薪\s*)?(\d+(?:\.\d+)?)\s*[kK](?:\s*(?:起|以上))", 1),
        (r"(?:月薪\s*)?(\d+(?:\.\d+)?)\s*[-–—~至]\s*\d+(?:\.\d+)?\s*万(?:元)?\s*(?:/|每)?月", 10),
        (r"(?:月薪\s*)?(\d{4,6})\s*[-–—~至]\s*\d{4,6}\s*元?\s*(?:/|每)?月", 0.001),
    )
    for pattern, multiplier in monthly_patterns:
        if match := re.search(pattern, content, re.IGNORECASE):
            return float(match.group(1)) * multiplier
    return None


def salary_text(row: dict[str, Any], detail: dict[str, Any] | None = None) -> str:
    detail = detail or {}
    return text(
        row.get("salary")
        or row.get("salary_range")
        or row.get("salary_desc")
        or detail.get("salary")
        or detail.get("salary_range")
        or detail.get("salary_desc")
    )


def split_tags(value: Any) -> list[str]:
    if isinstance(value, list):
        return [text(item) for item in value if text(item)]
    return [item.strip() for item in re.split(r"[|,，;/]", text(value)) if item.strip()]


def safe_filename(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", "-", value).strip("-") or "search"


def row_key(row: dict[str, Any]) -> str:
    return text(
        row.get("encrypt_job_id")
        or row.get("job_id")
        or row.get("job_link")
        or row.get("link")
        or row.get("url")
    )


def listing_fingerprint(row: dict[str, Any]) -> str:
    """Hash stable list-page fields that can indicate a changed posting."""
    fields = {
        key: row.get(key)
        for key in (
            "title", "job_name", "company", "company_name", "brand_name", "boss_name",
            "salary", "location", "tags", "skills", "job_labels", "welfare",
            "company_scale", "company_stage", "company_industry",
        )
    }
    payload = json.dumps(fields, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def load_detail_cache(path: Path = DETAIL_CACHE_FILE) -> dict[str, Any]:
    if not path.exists():
        return {"version": 1, "jobs": {}}
    try:
        value = load_json(path)
    except (OSError, ValueError, json.JSONDecodeError):
        return {"version": 1, "jobs": {}}
    if not isinstance(value, dict) or not isinstance(value.get("jobs"), dict):
        return {"version": 1, "jobs": {}}
    return value


def write_detail_cache(cache: dict[str, Any], path: Path = DETAIL_CACHE_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def title_prefilter(row: dict[str, Any]) -> bool:
    """Reject obvious mismatches before opening the slower detail page."""
    title = text(row.get("title") or row.get("job_name"))
    if (
        not title
        or not TARGET_TITLE.search(title)
        or EXCLUDED_TITLE.search(title)
        or OBVIOUSLY_IRRELEVANT.search(title)
    ):
        return False
    listing_content = " ".join([
        title,
        text(row.get("skills")),
        text(row.get("tags")),
        text(row.get("job_labels")),
        text(row.get("company_industry")),
    ])
    if ALGORITHM_TITLE.search(title) and EXCLUDED_ALGORITHM_DOMAIN.search(listing_content):
        return False
    if EXCLUDED_CORE_CONTENT.search(listing_content):
        return False
    if (salary_floor := monthly_salary_floor_k(salary_text(row))) is None or salary_floor < 20:
        return False
    key = row_key(row)
    job_url = text(row.get("job_link") or row.get("url"))
    return bool(key and job_url and company_name(row, {}))


def collect_detail_candidates(
    jobs_paths: list[Path],
    cache_path: Path = DETAIL_CACHE_FILE,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Deduplicate and prefilter every list result before detail collection."""
    cache_jobs = load_detail_cache(cache_path).get("jobs", {})
    unique_rows: dict[str, dict[str, Any]] = {}
    raw_rows = 0
    duplicates = 0

    for jobs_path in jobs_paths:
        if not jobs_path.exists():
            continue
        for row in rows_from_payload(load_json(jobs_path)):
            raw_rows += 1
            key = row_key(row)
            if key and key in unique_rows:
                duplicates += 1
                continue
            if key:
                unique_rows[key] = row

    candidates: list[dict[str, Any]] = []
    filtered = 0
    cached = 0
    for key, row in unique_rows.items():
        if not title_prefilter(row):
            filtered += 1
            continue
        fingerprint = listing_fingerprint(row)
        entry = cache_jobs.get(key, {})
        if isinstance(entry, dict) and entry.get("fingerprint") == fingerprint:
            cached += 1
            continue
        candidates.append(row)

    return candidates, {
        "jobs_discovered": raw_rows,
        "jobs_unique": len(unique_rows),
        "jobs_duplicate_listings": duplicates,
        "jobs_filtered_before_detail": filtered,
        "jobs_skipped_cached": cached,
        "jobs_detail_candidates": len(candidates),
    }


def record_synced_jobs(
    jobs: list[dict[str, Any]],
    result_files: list[tuple[Path, Path | None]],
    cache_path: Path = DETAIL_CACHE_FILE,
) -> None:
    """Cache only successfully synced jobs so failed uploads are retried."""
    synced_ids = {text(job.get("application_id")) for job in jobs if text(job.get("application_id"))}
    if not synced_ids:
        return
    cache = load_detail_cache(cache_path)
    cache_jobs = cache.setdefault("jobs", {})
    synced_at = datetime.now(timezone.utc).isoformat()
    for jobs_path, _details_path in result_files:
        if not jobs_path.exists():
            continue
        for row in rows_from_payload(load_json(jobs_path)):
            key = row_key(row)
            if key in synced_ids:
                cache_jobs[key] = {
                    "fingerprint": listing_fingerprint(row),
                    "synced_at": synced_at,
                }
    write_detail_cache(cache, cache_path)


def find_latest_file(result_dir: Path, prefix: str) -> Path | None:
    files = sorted(result_dir.glob(f"{prefix}_*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    return files[0] if files else None


def company_name(row: dict[str, Any], detail: dict[str, Any]) -> str:
    explicit = text(
        detail.get("company")
        or row.get("company")
        or row.get("company_name")
        or row.get("brand_name")
    )
    if explicit:
        return explicit

    # The upstream API maps brandName to boss_name. Never trust the same field
    # from DOM fallback output because it may contain a recruiter's name.
    salary_source = text(row.get("salary_source")).lower()
    if salary_source.startswith("api") and text(row.get("company_link")):
        return text(row.get("boss_name"))
    return ""


def classify_track(content: str) -> str:
    lower = content.lower()
    if re.search(r"量化研究|量化分析|quantitative|systematic", lower):
        return "Quant"
    if re.search(r"医疗咨询|医药咨询|生命科学咨询|healthcare consultant|life sciences consultant", lower):
        return "Consulting"
    if re.search(r"生物统计|临床统计|医学统计|biostat|clinical trial|流行病|卫生经济|真实世界", lower):
        return "Pharma"
    if re.search(r"医学影像|medical imaging|neuroimaging|医疗|healthcare", lower):
        return "Healthcare AI"
    return "Technology"


def transform_result_files(result_files: list[tuple[Path, Path | None]]) -> list[dict[str, Any]]:
    transformed: list[dict[str, Any]] = []
    checked_at = datetime.now(timezone.utc).isoformat()

    for jobs_path, details_path in result_files:
        jobs = rows_from_payload(load_json(jobs_path)) if jobs_path.exists() else []
        details = rows_from_payload(load_json(details_path)) if details_path and details_path.exists() else []
        detail_by_key = {row_key(row): row for row in details if row_key(row)}

        for row in jobs:
            title = text(row.get("title") or row.get("job_name"))
            if (
                not TARGET_TITLE.search(title)
                or EXCLUDED_TITLE.search(title)
                or OBVIOUSLY_IRRELEVANT.search(title)
            ):
                continue

            key = row_key(row)
            detail = detail_by_key.get(key, {})
            company = company_name(row, detail)
            job_url = text(row.get("job_link") or row.get("url"))
            if not company or not job_url or not key:
                continue

            jd = text(detail.get("jd") or detail.get("description") or row.get("jd") or row.get("description"))
            tags = (
                split_tags(row.get("skills"))
                + split_tags(row.get("tags"))
                + split_tags(detail.get("skill_tags"))
                + split_tags(detail.get("tags"))
            )
            content = " ".join([title, jd, " ".join(tags)])
            salary = salary_text(row, detail)
            salary_floor = monthly_salary_floor_k(salary, content)
            years = required_experience(content)
            if salary_floor is None or salary_floor < 20 or (years is not None and years > 3):
                continue
            if EXCLUDED_CORE_CONTENT.search(content):
                continue
            if ALGORITHM_TITLE.search(title) and (
                not ALGORITHM_DOMAIN.search(content) or EXCLUDED_ALGORITHM_DOMAIN.search(content)
            ):
                continue
            detected_skills = [label for label, pattern in SKILL_RULES if pattern.search(content)]
            skills = list(dict.fromkeys(detected_skills + tags))[:12]
            score = min(92, 68 + min(18, len(detected_skills) * 3) + (5 if jd else 0))

            transformed.append({
                "company": company,
                "title": title,
                "location": text(row.get("location") or detail.get("location")),
                "region": "中国",
                "track": classify_track(content),
                "score": score,
                "visa": "不适用",
                "evidence": (
                    f"薪资：{salary}（月薪下限约 {salary_floor:g}K）；"
                    "BOSS 当前职位页由本地登录会话采集；职位开放性仍需以平台页面为准。"
                ),
                "description": jd,
                "salary": salary,
                "salary_min_monthly_k": salary_floor,
                "skills": skills,
                "job_url": job_url,
                "canonical_url": job_url,
                "application_id": key,
                "source": "BOSS直聘（本地采集）",
                "status": "待官网核验",
                "checked_at": checked_at,
            })

    unique: dict[str, dict[str, Any]] = {}
    for item in transformed:
        unique[item["application_id"] or item["job_url"]] = item
    return list(unique.values())


def transform_latest_jobs(result_dir: Path) -> list[dict[str, Any]]:
    jobs_path = find_latest_file(result_dir, "boss_jobs")
    if not jobs_path:
        return []
    details_path = result_dir / jobs_path.name.replace("boss_jobs_", "boss_details_", 1)
    if not details_path.exists():
        details_path = find_latest_file(result_dir, "boss_details")
    return transform_result_files([(jobs_path, details_path)])


def sync_jobs(jobs: list[dict[str, Any]], completed_source: str = "") -> dict[str, Any]:
    if not jobs and not completed_source:
        return {"ok": True, "received": 0, "created": 0, "updated": 0, "skipped": 0}
    base_url = os.environ.get("IVY_JOB_RADAR_URL", "").rstrip("/")
    token = os.environ.get("IVY_JOB_RADAR_SYNC_TOKEN", "")
    sites_token = os.environ.get("IVY_JOB_RADAR_SITES_BYPASS_TOKEN", "")
    if not base_url or not token or not sites_token:
        raise SystemExit(
            "collector.env must define IVY_JOB_RADAR_URL, IVY_JOB_RADAR_SYNC_TOKEN, "
            "and IVY_JOB_RADAR_SITES_BYPASS_TOKEN"
        )

    total = {"ok": True, "received": 0, "created": 0, "updated": 0, "skipped": 0}
    grouped: dict[str, list[dict[str, Any]]] = {}
    if completed_source:
        grouped[completed_source] = jobs
    else:
        for job in jobs:
            grouped.setdefault(text(job.get("source")), []).append(job)

    for source, source_jobs in grouped.items():
        chunks = [source_jobs[start:start + 50] for start in range(0, len(source_jobs), 50)]
        for chunk in chunks:
            request = urllib.request.Request(
                f"{base_url}/api/jobs/import",
                data=json.dumps(chunk, ensure_ascii=False).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {token}",
                    "OAI-Sites-Authorization": f"Bearer {sites_token}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            try:
                with urllib.request.urlopen(request, timeout=90) as response:
                    result = json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as error:
                detail = error.read().decode("utf-8", errors="replace")
                raise SystemExit(f"Job Radar import failed with HTTP {error.code}: {detail}") from error
            except urllib.error.URLError as error:
                raise SystemExit(f"Job Radar import could not connect: {error.reason}") from error
            for key in ("received", "created", "updated", "skipped"):
                total[key] += int(result.get(key, 0))

        if not source:
            continue
        reconciliation = {
            "jobs": [],
            "complete_source": source,
            "seen_urls": [text(job.get("canonical_url") or job.get("job_url")) for job in source_jobs],
        }
        request = urllib.request.Request(
            f"{base_url}/api/jobs/import",
            data=json.dumps(reconciliation, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {token}",
                "OAI-Sites-Authorization": f"Bearer {sites_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=90):
                pass
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise SystemExit(f"Job Radar expiration reconciliation failed with HTTP {error.code}: {detail}") from error
        except urllib.error.URLError as error:
            raise SystemExit(f"Job Radar expiration reconciliation could not connect: {error.reason}") from error
    return total

def ensure_scraper(scraper_dir: Path) -> Path:
    script = scraper_dir / "scripts" / "boss_cdp_raw.py"
    if not script.exists():
        scraper_dir.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "--depth", "1", SCRAPER_REPOSITORY, str(scraper_dir)], check=True)
    venv_python = scraper_dir / ".venv" / "bin" / "python3"
    if not venv_python.exists():
        subprocess.run([sys.executable, "-m", "venv", str(scraper_dir / ".venv")], check=True)
        subprocess.run([str(venv_python), "-m", "pip", "install", "-r", str(scraper_dir / "requirements.txt")], check=True)
    return venv_python


def read_state() -> dict[str, Any]:
    if not STATE_FILE.exists():
        return {"cursor": 0}
    try:
        state = load_json(STATE_FILE)
        return state if isinstance(state, dict) else {"cursor": 0}
    except (OSError, ValueError, json.JSONDecodeError):
        return {"cursor": 0}


def write_state(state: dict[str, Any]) -> None:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def next_batch(plan_path: Path) -> tuple[list[tuple[str, str]], int, int]:
    plan = load_json(plan_path)
    combinations = [(keyword, city) for city in plan["cities"] for keyword in plan["keywords"]]
    if not combinations:
        raise SystemExit("The search plan must contain at least one keyword and one city.")
    state = read_state()
    cursor = int(state.get("cursor", 0)) % len(combinations)
    batch_size = max(1, min(int(plan.get("batch_size", 4)), len(combinations)))
    batch = [combinations[(cursor + offset) % len(combinations)] for offset in range(batch_size)]
    return batch, cursor, len(combinations)


def run_searches(
    scraper_dir: Path,
    plan_path: Path,
    result_dir: Path,
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
) -> list[tuple[Path, Path | None]]:
    venv_python = ensure_scraper(scraper_dir)
    plan = load_json(plan_path)
    pages = max(1, min(int(plan.get("pages", 1)), 2))
    script = scraper_dir / "scripts" / "boss_cdp_raw.py"
    batch, cursor, combination_count = next_batch(plan_path)
    run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = result_dir / "ivy-runs" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    list_paths: list[Path] = []
    outputs: list[tuple[Path, Path | None]] = []
    completed = 0
    failure = ""
    detail_failed = False

    # Phase 1 only reads search-result pages. Detail pages are intentionally
    # deferred until every keyword in the batch has been deduplicated.
    for index, (keyword, city) in enumerate(batch):
        print(f"Searching BOSS list: {keyword} / {city}")
        stem = f"{index + 1:02d}_{safe_filename(keyword)}_{safe_filename(city)}"
        jobs_path = run_dir / f"boss_list_{stem}.json"
        command = [
            str(venv_python), str(script),
            "--keyword", keyword,
            "--city", city,
            "--pages", str(pages),
            "--format", "json",
            "--output", str(jobs_path),
            "--no-detail",
        ]
        result = subprocess.run(command, check=False)
        if result.returncode != 0:
            failure = f"Search stopped at {keyword} / {city} with exit code {result.returncode}."
            print(f"{failure} Check the dedicated Chrome window for login or verification.", file=sys.stderr)
            break
        if jobs_path.exists():
            list_paths.append(jobs_path)
        completed += 1
        if progress_callback:
            progress_callback({
                "source": "BOSS直聘",
                "phase": "列表搜索",
                "message": f"已完成 {completed}/{len(batch)} 组 BOSS 关键词与城市",
                "completed": completed,
                "total": len(batch),
                "scanned": sum(
                    len(rows_from_payload(load_json(path)))
                    for path in list_paths if path.exists()
                ),
            })

    candidates, prefilter_stats = collect_detail_candidates(list_paths)
    print(
        "BOSS list prefilter: "
        f"{prefilter_stats['jobs_discovered']} rows -> "
        f"{prefilter_stats['jobs_unique']} unique -> "
        f"{prefilter_stats['jobs_detail_candidates']} detail pages "
        f"({prefilter_stats['jobs_filtered_before_detail']} excluded, "
        f"{prefilter_stats['jobs_skipped_cached']} already synced)."
    )

    if progress_callback:
        progress_callback({
            "source": "BOSS直聘",
            "phase": "列表初筛",
            "message": (
                f"发现 {prefilter_stats['jobs_discovered']}，去重后 {prefilter_stats['jobs_unique']}，"
                f"需要读取 {prefilter_stats['jobs_detail_candidates']} 个详情"
            ),
            "completed": completed,
            "total": len(batch),
            "scanned": prefilter_stats["jobs_discovered"],
            "unique": prefilter_stats["jobs_unique"],
            "filtered": prefilter_stats["jobs_filtered_before_detail"],
            "detail_candidates": prefilter_stats["jobs_detail_candidates"],
        })

    # Phase 2 opens details only for new, plausible jobs, once per job ID.
    if candidates and completed == len(batch):
        candidates_path = run_dir / "boss_jobs_candidates.json"
        details_path = run_dir / "boss_details_candidates.json"
        candidates_path.write_text(
            json.dumps({
                "jobs": candidates,
                "total": len(candidates),
                "scraped_at": datetime.now(timezone.utc).isoformat(),
            }, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        detail_command = [
            str(venv_python), str(script),
            "--input", str(candidates_path),
            "--format", "json",
            "--detail-output", str(details_path),
        ]
        detail_result = subprocess.run(detail_command, check=False)
        if detail_result.returncode != 0:
            detail_failed = True
            failure = f"Detail collection stopped with exit code {detail_result.returncode}."
            print(f"{failure} Check the dedicated Chrome window for login or verification.", file=sys.stderr)
        else:
            outputs.append((candidates_path, details_path if details_path.exists() else None))

    batch_completed = completed == len(batch) and not detail_failed
    next_cursor = (cursor + completed) % combination_count if batch_completed else cursor
    state = {
        "cursor": next_cursor,
        "last_run_at": datetime.now(timezone.utc).isoformat(),
        "last_run_id": run_id,
        "planned_searches": len(batch),
        "completed_searches": completed if batch_completed else 0,
        "status": "completed" if batch_completed else "attention_required",
        "failure": failure,
        **prefilter_stats,
    }
    write_state(state)
    return outputs


def install_schedule(script_path: Path, env_path: Path, scraper_dir: Path, plan_path: Path) -> None:
    launch_agents = Path.home() / "Library" / "LaunchAgents"
    launch_agents.mkdir(parents=True, exist_ok=True)
    log_dir = APP_DIR / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    installed_dir = APP_DIR / "collector"
    installed_dir.mkdir(parents=True, exist_ok=True)
    installed_script = installed_dir / "boss_radar.py"
    installed_plan = installed_dir / "search-plan.json"
    shutil.copy2(script_path, installed_script)
    shutil.copy2(plan_path, installed_plan)
    plist_path = launch_agents / f"{SCHEDULE_LABEL}.plist"
    arguments = [
        sys.executable,
        str(installed_script),
        "run",
        "--env-file",
        str(env_path),
        "--scraper-dir",
        str(scraper_dir),
        "--plan",
        str(installed_plan),
    ]
    payload = {
        "Label": SCHEDULE_LABEL,
        "ProgramArguments": arguments,
        "StartCalendarInterval": [
            {"Hour": 8, "Minute": 30},
            {"Hour": 20, "Minute": 30},
        ],
        "StandardOutPath": str(log_dir / "boss-collector.log"),
        "StandardErrorPath": str(log_dir / "boss-collector-error.log"),
    }
    with plist_path.open("wb") as handle:
        plistlib.dump(payload, handle, sort_keys=False)
    domain = f"gui/{os.getuid()}"
    subprocess.run(
        ["launchctl", "bootout", domain, str(plist_path)],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    subprocess.run(["launchctl", "bootstrap", domain, str(plist_path)], check=True)
    print(f"Installed twice-daily schedule: {plist_path}")


def uninstall_schedule() -> None:
    plist_path = Path.home() / "Library" / "LaunchAgents" / f"{SCHEDULE_LABEL}.plist"
    if plist_path.exists():
        domain = f"gui/{os.getuid()}"
        subprocess.run(["launchctl", "bootout", domain, str(plist_path)], check=False)
        plist_path.unlink()
    print("Removed the BOSS collector schedule.")


def doctor(env_path: Path, scraper_dir: Path, plan_path: Path) -> int:
    checks: list[tuple[str, bool, str]] = []
    checks.append(("macOS", sys.platform == "darwin", sys.platform))
    checks.append(("Python 3.10+", sys.version_info >= (3, 10), sys.version.split()[0]))
    checks.append(("Search plan", plan_path.exists(), str(plan_path)))
    checks.append(("Private configuration", env_path.exists(), str(env_path)))
    if env_path.exists():
        load_env(env_path)
    checks.append(("Radar URL", bool(os.environ.get("IVY_JOB_RADAR_URL")), "configured" if os.environ.get("IVY_JOB_RADAR_URL") else "missing"))
    checks.append(("Sync token", bool(os.environ.get("IVY_JOB_RADAR_SYNC_TOKEN")), "configured" if os.environ.get("IVY_JOB_RADAR_SYNC_TOKEN") else "missing"))
    checks.append((
        "Private Site access token",
        bool(os.environ.get("IVY_JOB_RADAR_SITES_BYPASS_TOKEN")),
        "configured" if os.environ.get("IVY_JOB_RADAR_SITES_BYPASS_TOKEN") else "missing",
    ))
    upstream_script = scraper_dir / "scripts" / "boss_cdp_raw.py"
    checks.append(("Upstream scraper", upstream_script.exists(), str(upstream_script)))
    for label, ok, detail in checks:
        print(f"{'OK' if ok else 'FAIL':4}  {label}: {detail}")
    if upstream_script.exists():
        venv_python = scraper_dir / ".venv" / "bin" / "python3"
        if venv_python.exists():
            result = subprocess.run([str(venv_python), str(upstream_script), "--check"], check=False)
            login_check = ("BOSS login session", result.returncode == 0, f"exit {result.returncode}")
            checks.append(login_check)
            print(f"{'OK' if login_check[1] else 'FAIL':4}  {login_check[0]}: {login_check[2]}")
    return 0 if all(ok for _, ok, _ in checks) else 1


def print_status() -> None:
    state = read_state()
    print(json.dumps(state, ensure_ascii=False, indent=2))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=(
        "doctor", "setup", "run", "sync-only", "status", "install-schedule", "uninstall-schedule",
    ))
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument("--scraper-dir", type=Path, default=DEFAULT_SCRAPER_DIR)
    parser.add_argument("--result-dir", type=Path, default=DEFAULT_RESULT_DIR)
    parser.add_argument("--plan", type=Path, default=DEFAULT_PLAN)
    parser.add_argument("--dry-run", action="store_true", help="Collect and transform jobs without uploading them.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    APP_DIR.mkdir(parents=True, exist_ok=True)
    if args.command == "doctor":
        raise SystemExit(doctor(args.env_file, args.scraper_dir, args.plan))
    if args.command == "status":
        print_status()
        return
    if args.command == "uninstall-schedule":
        uninstall_schedule()
        return
    if args.command == "setup":
        venv_python = ensure_scraper(args.scraper_dir)
        script = args.scraper_dir / "scripts" / "boss_cdp_raw.py"
        subprocess.run([str(venv_python), str(script), "--setup-chrome"], check=True)
        subprocess.run([str(venv_python), str(script), "--check"], check=True)
        return
    if args.command == "install-schedule":
        load_env(args.env_file)
        install_schedule(Path(__file__).resolve(), args.env_file, args.scraper_dir, args.plan)
        return

    load_env(args.env_file)
    if args.command == "run":
        result_files = run_searches(args.scraper_dir, args.plan, args.result_dir)
        jobs = transform_result_files(result_files)
    else:
        jobs = transform_latest_jobs(args.result_dir)
    if args.dry_run:
        print(json.dumps({"ok": True, "dry_run": True, "jobs": jobs}, ensure_ascii=False, indent=2))
        return
    result = sync_jobs(jobs, completed_source="BOSS直聘（本地采集）")
    if args.command == "run":
        record_synced_jobs(jobs, result_files)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
