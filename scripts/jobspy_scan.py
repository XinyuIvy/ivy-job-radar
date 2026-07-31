from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import pandas as pd
from jobspy import scrape_jobs


TRACKING_PARAMETERS = {
    "gh_jid",
    "gh_src",
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

WANTED_TITLE_SIGNALS = (
    "biostatistician",
    "statistical scientist",
    "data scientist",
    "applied scientist",
    "research scientist",
    "decision scientist",
    "quantitative researcher",
    "quantitative analyst",
    "epidemiologist",
    "health economics",
    "outcomes research",
    "algorithm validation",
    "imaging scientist",
)

EXCLUDED_TITLE_SIGNALS = (
    "intern",
    "postdoc",
    "postdoctoral",
    "software engineer",
    "data engineer",
    "machine learning engineer",
    "director",
    "vice president",
    "senior",
    "sr.",
    "principal",
    "staff",
    "manager",
    "lead",
    "head of",
    "technical leadership",
    "nlp",
    "language model",
    "generative ai",
    "llm",
)

UNSUPPORTED_CORE_SIGNALS = (
    "large language model",
    " retrieval augmented generation",
    " natural language processing",
    "foundation model",
    "reinforcement learning",
    "deep learning architecture",
    "image segmentation",
    "production ml",
    "mlops",
    "distributed training",
    "model serving",
    "full-stack",
    "full stack",
)

SKILL_RULES = {
    "R": r"(?:^|\W)r(?:\W|$)|\brstudio\b",
    "Python": r"\bpython\b",
    "SQL": r"\bsql\b",
    "SAS": r"\bsas\b",
    "Statistics": r"\bstatistic",
    "Biostatistics": r"\bbiostat",
    "Causal inference": r"causal inference|propensity score|inverse probability|target trial",
    "Experimentation": r"experimental design|a/b test|randomized experiment",
    "Machine learning": r"machine learning|statistical learning|predictive model",
    "Clinical trials": r"clinical trial|randomized controlled trial|estimand",
    "Longitudinal data": r"longitudinal|repeated measures|mixed.effects|survival analysis",
    "Model validation": r"external validation|calibration|generaliz|fairness|bias analysis|model evaluation",
    "Medical imaging": r"medical imaging|neuroimaging|multimodal imaging|digital biomarker",
    "RWE / HEOR": r"real.world evidence|\brwe\b|\bheor\b|health economics|pharmacoepidemi",
}


def clean_text(value: object) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def canonicalize_url(raw_url: str) -> str:
    try:
        parts = urlsplit(raw_url.strip())
        query = [
            (key, value)
            for key, value in parse_qsl(parts.query, keep_blank_values=True)
            if key.lower() not in TRACKING_PARAMETERS
        ]
        return urlunsplit(
            (
                parts.scheme.lower(),
                parts.netloc.lower().removeprefix("www."),
                parts.path.rstrip("/") or "/",
                urlencode(sorted(query)),
                "",
            )
        )
    except ValueError:
        return raw_url.strip()


def extract_application_id(url: str) -> str:
    patterns = (
        r"/jobs/(\d+)(?:/|$)",
        r"/job/(\d+)(?:/|$)",
        r"/([0-9a-f]{8}-[0-9a-f-]{27,})(?:/|$)",
        r"[?&](?:jobId|job_id|gh_jid)=([^&]+)",
    )
    for pattern in patterns:
        match = re.search(pattern, url, flags=re.IGNORECASE)
        if match:
            return match.group(1)
    return ""


def infer_track(text: str) -> str:
    lower = text.lower()
    if re.search(r"quantitative researcher|quantitative analyst|systematic", lower):
        return "Quant"
    if re.search(r"biostat|statistical scientist|clinical trial|epidemiol|health economics|outcomes research", lower):
        return "Pharma"
    if re.search(r"health|clinical ai|medical|imaging", lower):
        return "Healthcare AI"
    if re.search(r"device|diagnostic|algorithm validation", lower):
        return "Medical Device"
    return "Technology"


def infer_sponsorship(text: str) -> str:
    lower = text.lower()
    if re.search(r"(?:will not|does not|unable to|not provide).{0,50}(?:sponsor|sponsorship)", lower):
        return "明确不支持"
    if re.search(r"(?:visa|h-?1b).{0,50}(?:sponsor|sponsorship)|sponsorship available", lower):
        return "可能支持"
    return "JD 未明确"


def required_experience(text: str) -> int | None:
    matches = re.findall(
        r"(?:minimum|min\.?|at least)\s*(\d+)\+?\s*(?:years?|yrs?)|"
        r"(\d+)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant|related|professional|industry|work)?\s*experience",
        text,
        flags=re.IGNORECASE,
    )
    years = [int(value) for pair in matches for value in pair if value]
    return max(years) if years else None


def score_job(title: str, description: str, sponsorship: str, years: int | None) -> tuple[int, list[str], bool]:
    text = f"{title} {description}"
    lower = text.lower()
    details: list[str] = []
    score = 0

    phd = bool(re.search(r"\bph\.?d\.?\b|doctoral|doctorate", lower))
    quantitative_degree = bool(re.search(r"statistics|biostatistics|epidemiology|data science|mathematics|economics|quantitative", lower))
    score += 10 if phd else 6 if quantitative_degree else 0
    score += 4 if years is None else 10 if years == 0 else 8 if years <= 3 else 0
    details.append("学历：明确接受博士" if phd else "学历：接受相关定量专业" if quantitative_degree else "学历：未确认博士匹配")
    details.append("经验：未写明最低年限" if years is None else f"经验：最低要求约 {years} 年")

    core_rules = (
        (10, r"biostatistics|statistical modeling|statistical analysis|statistics"),
        (7, r"study design|research design|experimental design|clinical trial"),
        (6, r"predictive model|risk prediction|risk stratification|machine learning"),
        (7, r"causal inference|longitudinal|repeated measures|missing data|survival analysis"),
    )
    core_score = min(30, sum(points for points, pattern in core_rules if re.search(pattern, lower)))
    score += core_score
    details.append(f"核心专业：{core_score}/30")

    domain_rules = (
        (8, r"clinical|healthcare|medical|patient|ehr|pharma|biotech"),
        (6, r"neuroimaging|medical imaging|multimodal|digital biomarker|wearable"),
        (6, r"real.world evidence|\brwe\b|\bheor\b|epidemiology|pharmacoepidemiology|regulatory science"),
        (5, r"experimentation|decision science|product analytics|quantitative research|systematic research"),
    )
    domain_score = min(20, sum(points for points, pattern in domain_rules if re.search(pattern, lower)))
    score += domain_score
    details.append(f"领域迁移：{domain_score}/20")

    tool_score = 0
    if re.search(SKILL_RULES["R"], text, flags=re.IGNORECASE):
        tool_score += 7
    if re.search(SKILL_RULES["Python"], text, flags=re.IGNORECASE):
        tool_score += 5
    if re.search(r"data analysis|statistical programming", lower):
        tool_score += 3
    score += min(15, tool_score)
    details.append(f"工具匹配：{min(15, tool_score)}/15")

    score += 15 if sponsorship == "可能支持" else 7 if sponsorship == "JD 未明确" else 0
    details.append(f"工作授权：{sponsorship}")

    gap_count = sum(signal in lower for signal in UNSUPPORTED_CORE_SIGNALS)
    if gap_count:
        score -= min(40, gap_count * 15)
        details.append(f"硬技能缺口：检测到 {gap_count} 类未确认的核心研发要求")

    citizenship_blocked = bool(re.search(r"u\.?s\.? citizen|us citizenship|required clearance|security clearance", lower))
    experience_blocked = years is not None and years > 3 and not bool(
        re.search(r"(?:ph\.?d\.?|doctorate).{0,80}(?:count|equivalent|substitut)", description, flags=re.IGNORECASE)
    )
    eligible = sponsorship != "明确不支持" and not citizenship_blocked and not experience_blocked and gap_count < 2
    return max(0, min(100, round(score))), details, eligible


def normalize_row(row: pd.Series, query: str, scanned_at: str) -> dict[str, object] | None:
    title = clean_text(row.get("title"))
    description = clean_text(row.get("description"))
    company = clean_text(row.get("company"))
    url = clean_text(row.get("job_url_direct")) or clean_text(row.get("job_url"))
    if not title or not company or not url:
        return None

    lower_title = title.lower()
    if not any(signal in lower_title for signal in WANTED_TITLE_SIGNALS):
        return None
    if any(signal in lower_title for signal in EXCLUDED_TITLE_SIGNALS):
        return None

    years = required_experience(description)
    sponsorship = infer_sponsorship(description)
    score, details, eligible = score_job(title, description, sponsorship, years)
    phd_targeted = bool(re.search(r"\\bph\\.?d\\.?\\b|doctoral|doctorate", description, flags=re.IGNORECASE))
    if not eligible or not phd_targeted or score < 55:
        return None

    canonical_url = canonicalize_url(url)
    application_id = extract_application_id(url)
    location_parts = [clean_text(row.get(name)) for name in ("city", "state", "country")]
    location = clean_text(row.get("location")) or ", ".join(part for part in location_parts if part)
    skills = [label for label, pattern in SKILL_RULES.items() if re.search(pattern, description, flags=re.IGNORECASE)][:7]
    source_site = clean_text(row.get("site")) or "JobSpy"

    # Aggregators often expose different URLs for the same employer posting.
    normalized_company = re.sub(r"\\W+", "", company.lower())
    normalized_title = re.sub(r"\\W+", " ", title.lower()).strip()
    normalized_location = re.sub(r"\\W+", " ", location.lower()).strip()
    identity = f"{normalized_company}::{application_id or normalized_title + '::' + normalized_location}"

    return {
        "job_key": hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24],
        "company": company,
        "title": title,
        "location": location,
        "region": "美国",
        "track": infer_track(f"{title} {description}"),
        "score": score,
        "visa": sponsorship,
        "evidence": "聚合平台发现，需打开公司官网确认申请入口；" + "；".join(details),
        "skills": skills,
        "job_url": url,
        "canonical_url": canonical_url,
        "application_id": application_id,
        "source": f"JobSpy · {source_site}",
        "search_query": query,
        "date_posted": clean_text(row.get("date_posted")),
        "discovered_at": scanned_at,
        "checked_at": scanned_at,
        "status": "待官网核验",
    }


def run_scan(config_path: Path) -> list[dict[str, object]]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    scanned_at = datetime.now(timezone.utc).isoformat()
    records: list[dict[str, object]] = []

    for query in config["queries"]:
        try:
            frame = scrape_jobs(
                site_name=config["sites"],
                search_term=query,
                location=config["locations"][0],
                results_wanted=int(config["results_wanted_per_query"]),
                hours_old=int(config["hours_old"]),
                country_indeed=config["country_indeed"],
                linkedin_fetch_description=True,
            )
        except Exception as exc:
            print(f"Query failed: {query}: {exc}")
            continue

        for _, row in frame.iterrows():
            normalized = normalize_row(row, query, scanned_at)
            if normalized:
                records.append(normalized)

    deduplicated: dict[str, dict[str, object]] = {}
    for record in records:
        key = str(record["job_key"])
        current = deduplicated.get(key)
        if current is None or int(record["score"]) > int(current["score"]):
            deduplicated[key] = record
    return sorted(deduplicated.values(), key=lambda item: (-int(item["score"]), str(item["company"]), str(item["title"])))


def write_outputs(records: list[dict[str, object]], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "us_jobs_latest.json"
    csv_path = output_dir / "us_jobs_latest.csv"
    summary_path = output_dir / "us_scan_summary.json"

    json_path.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    csv_records = [{**record, "skills": " | ".join(record["skills"])} for record in records]
    pd.DataFrame(csv_records).to_csv(csv_path, index=False)
    summary_path.write_text(
        json.dumps(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "matched_jobs": len(records),
                "priority_jobs": sum(int(record["score"]) >= 85 for record in records),
                "worth_applying_jobs": sum(int(record["score"]) >= 70 for record in records),
                "note": "Aggregator discoveries require final verification on the company career site.",
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect and normalize US job listings with JobSpy.")
    parser.add_argument("--config", type=Path, default=Path("config/us_search_queries.json"))
    parser.add_argument("--output-dir", type=Path, default=Path("data/scans"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    records = run_scan(args.config)
    write_outputs(records, args.output_dir)
    print(f"Wrote {len(records)} eligible, deduplicated jobs to {args.output_dir}")


if __name__ == "__main__":
    main()
