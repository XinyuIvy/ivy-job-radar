#!/usr/bin/env python3
"""Run conservative BOSS searches and sync relevant jobs to Ivy Job Radar."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_DIR = Path.home() / ".ivy-job-radar"
STATE_FILE = APP_DIR / "boss-state.json"
DEFAULT_ENV_FILE = APP_DIR / "collector.env"
DEFAULT_SCRAPER_DIR = APP_DIR / "vendor" / "boss-zhipin-scraper"
DEFAULT_RESULT_DIR = Path.home() / ".boss-zhipin-scraper" / "job-result"
SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_PLAN = SCRIPT_DIR / "search-plan.json"
SCRAPER_REPOSITORY = "https://github.com/eatmoreduck/boss-zhipin-scraper.git"

TARGET_TITLE = re.compile(
    r"生物统计|临床统计|医学统计|统计科学家|数据科学|数据科学家|应用科学家|"
    r"研究科学家|量化研究|量化分析|医疗咨询|医药咨询|生命科学咨询|"
    r"真实世界|流行病|卫生经济|健康经济|结局研究|医学影像|"
    r"biostat|statistical scientist|data scientist|applied scientist|"
    r"research scientist|quantitative research|quantitative analyst|"
    r"healthcare consultant|life sciences consultant|epidemiolog|health economics",
    re.IGNORECASE,
)
EXCLUDED_TITLE = re.compile(
    r"实习|intern|博士后|postdoc|postdoctoral|总监|经理|负责人|"
    r"director|principal|staff|senior|manager|lead|head of|vice president|"
    r"软件工程|software engineer|数据工程|data engineer|生成式|generative|\bllm\b|\bnlp\b",
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
        os.environ.setdefault(key.strip(), value.strip())


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


def split_tags(value: Any) -> list[str]:
    if isinstance(value, list):
        return [text(item) for item in value if text(item)]
    return [item.strip() for item in re.split(r"[|,，;/]", text(value)) if item.strip()]


def row_key(row: dict[str, Any]) -> str:
    return text(row.get("encrypt_job_id") or row.get("job_id") or row.get("job_link") or row.get("url"))


def find_latest_rows(result_dir: Path, prefix: str) -> list[dict[str, Any]]:
    files = sorted(result_dir.glob(f"{prefix}_*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    return rows_from_payload(load_json(files[0])) if files else []


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


def transform_jobs(result_dir: Path) -> list[dict[str, Any]]:
    jobs = find_latest_rows(result_dir, "boss_jobs")
    details = find_latest_rows(result_dir, "boss_details")
    detail_by_key = {row_key(row): row for row in details if row_key(row)}
    transformed: list[dict[str, Any]] = []
    checked_at = datetime.now(timezone.utc).isoformat()

    for row in jobs:
        title = text(row.get("title") or row.get("job_name"))
        if not TARGET_TITLE.search(title) or EXCLUDED_TITLE.search(title):
            continue

        key = row_key(row)
        detail = detail_by_key.get(key, {})
        company = text(row.get("company") or row.get("company_name") or row.get("brand_name") or row.get("boss_name"))
        job_url = text(row.get("job_link") or row.get("url"))
        if not company or not job_url:
            continue

        jd = text(detail.get("jd") or detail.get("description") or row.get("jd") or row.get("description"))
        tags = split_tags(row.get("skills")) + split_tags(row.get("tags")) + split_tags(detail.get("tags"))
        content = " ".join([title, jd, " ".join(tags)])
        detected_skills = [label for label, pattern in SKILL_RULES if pattern.search(content)]
        skills = list(dict.fromkeys(detected_skills + tags))[:12]
        score = min(92, 68 + min(18, len(detected_skills) * 3) + (5 if jd else 0))

        transformed.append({
            "company": company,
            "title": title,
            "location": text(row.get("location")),
            "region": "中国",
            "track": classify_track(content),
            "score": score,
            "visa": "不适用",
            "evidence": "BOSS 当前职位页由本地登录会话采集；职位开放性仍需以平台页面为准。",
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


def sync_jobs(jobs: list[dict[str, Any]]) -> dict[str, Any]:
    if not jobs:
        return {"ok": True, "received": 0, "created": 0, "updated": 0, "skipped": 0}
    base_url = os.environ.get("IVY_JOB_RADAR_URL", "").rstrip("/")
    token = os.environ.get("IVY_JOB_RADAR_SYNC_TOKEN", "")
    if not base_url or not token:
        raise SystemExit("collector.env must define IVY_JOB_RADAR_URL and IVY_JOB_RADAR_SYNC_TOKEN")

    request = urllib.request.Request(
        f"{base_url}/api/jobs/import",
        data=json.dumps(jobs, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Job Radar import failed with HTTP {error.code}: {detail}") from error


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


def next_batch(plan_path: Path) -> list[tuple[str, str]]:
    plan = load_json(plan_path)
    combinations = [(keyword, city) for city in plan["cities"] for keyword in plan["keywords"]]
    APP_DIR.mkdir(parents=True, exist_ok=True)
    state = load_json(STATE_FILE) if STATE_FILE.exists() else {"cursor": 0}
    cursor = int(state.get("cursor", 0)) % len(combinations)
    batch_size = max(1, min(int(plan.get("batch_size", 4)), len(combinations)))
    batch = [combinations[(cursor + offset) % len(combinations)] for offset in range(batch_size)]
    STATE_FILE.write_text(json.dumps({"cursor": (cursor + batch_size) % len(combinations)}, ensure_ascii=False, indent=2), encoding="utf-8")
    return batch


def run_searches(scraper_dir: Path, plan_path: Path) -> None:
    venv_python = ensure_scraper(scraper_dir)
    plan = load_json(plan_path)
    pages = max(1, min(int(plan.get("pages", 1)), 2))
    script = scraper_dir / "scripts" / "boss_cdp_raw.py"
    for keyword, city in next_batch(plan_path):
        print(f"Searching BOSS: {keyword} / {city}")
        command = [str(venv_python), str(script), "--keyword", keyword, "--city", city, "--pages", str(pages), "--format", "json"]
        result = subprocess.run(command, check=False)
        if result.returncode != 0:
            print("The BOSS search stopped. Check the dedicated Chrome window for login or verification.", file=sys.stderr)
            break


def install_schedule(script_path: Path, env_path: Path, scraper_dir: Path, plan_path: Path) -> None:
    launch_agents = Path.home() / "Library" / "LaunchAgents"
    launch_agents.mkdir(parents=True, exist_ok=True)
    log_dir = APP_DIR / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    plist_path = launch_agents / "com.ivy.jobradar.boss.plist"
    arguments = [
        sys.executable,
        str(script_path),
        "run",
        "--env-file",
        str(env_path),
        "--scraper-dir",
        str(scraper_dir),
        "--plan",
        str(plan_path),
    ]
    escaped = "".join(f"    <string>{value}</string>\n" for value in arguments)
    plist = f"""<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\"><dict>
  <key>Label</key><string>com.ivy.jobradar.boss</string>
  <key>ProgramArguments</key><array>
{escaped}  </array>
  <key>StartCalendarInterval</key><array>
    <dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>30</integer></dict>
    <dict><key>Hour</key><integer>20</integer><key>Minute</key><integer>30</integer></dict>
  </array>
  <key>StandardOutPath</key><string>{log_dir / 'boss-collector.log'}</string>
  <key>StandardErrorPath</key><string>{log_dir / 'boss-collector-error.log'}</string>
</dict></plist>
"""
    plist_path.write_text(plist, encoding="utf-8")
    subprocess.run(["launchctl", "unload", str(plist_path)], check=False)
    subprocess.run(["launchctl", "load", str(plist_path)], check=True)
    print(f"Installed twice-daily schedule: {plist_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("setup", "run", "sync-only", "install-schedule"))
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument("--scraper-dir", type=Path, default=DEFAULT_SCRAPER_DIR)
    parser.add_argument("--result-dir", type=Path, default=DEFAULT_RESULT_DIR)
    parser.add_argument("--plan", type=Path, default=DEFAULT_PLAN)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    APP_DIR.mkdir(parents=True, exist_ok=True)
    if args.command == "setup":
        venv_python = ensure_scraper(args.scraper_dir)
        subprocess.run([str(venv_python), str(args.scraper_dir / "scripts" / "boss_cdp_raw.py"), "--setup-chrome"], check=True)
        return
    if args.command == "install-schedule":
        load_env(args.env_file)
        install_schedule(Path(__file__).resolve(), args.env_file, args.scraper_dir, args.plan)
        return

    load_env(args.env_file)
    if args.command == "run":
        run_searches(args.scraper_dir, args.plan)
    result = sync_jobs(transform_jobs(args.result_dir))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
