from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, quote_plus, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen

import pandas as pd


TRACKING_PARAMETERS = {
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

WANTED_TITLE_SIGNALS = (
    "生物统计",
    "统计",
    "统计科学",
    "数据科学",
    "数据科学家",
    "机器学习科学家",
    "算法研究员",
    "算法科学家",
    "创新算法",
    "科学计算",
    "计算科学家",
    "计算生物",
    "ai for science",
    "量化研究",
    "量化分析",
    "流行病",
    "卫生经济",
    "真实世界",
    "医学统计",
    "临床统计",
    "医疗咨询",
    "healthcare consulting",
    "biostatistician",
    "statistical scientist",
    "data scientist",
    "quantitative researcher",
    "epidemiologist",
)

EXCLUDED_TITLE_SIGNALS = (
    "实习",
    "高级",
    "资深",
    "首席",
    "总监",
    "经理",
    "负责人",
    "专家",
    "架构师",
    "软件工程",
    "数据工程",
    "算法工程",
    "大模型",
    "自然语言",
    "nlp",
    "llm",
    "intern",
    "senior",
    "principal",
    "staff",
    "manager",
    "director",
    "lead",
)

OBVIOUSLY_IRRELEVANT_SIGNALS = (
    "物流统计",
    "仓库统计",
    "生产统计",
    "财务统计",
    "销售统计",
    "门店统计",
    "猪场统计",
    "养殖统计",
    "统计文员",
    "数据录入",
    "文员",
    "会计",
    "出纳",
    "客服",
    "行政专员",
)

UNSUPPORTED_CORE_SIGNALS = (
    "大语言模型",
    "大模型训练",
    "自然语言处理",
    "llm",
    "rag",
    "nlp",
)

SOURCE_HOSTS = {
    "zhipin.com": "BOSS直聘公开索引",
    "liepin.com": "猎聘",
    "nowcoder.com": "牛客招聘",
    "51job.com": "前程无忧",
    "zhaopin.com": "智联招聘",
    "lagou.com": "拉勾",
}


def clean_text(value: object) -> str:
    return re.sub(r"\s+", " ", html.unescape(str(value or ""))).strip()


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


def source_name(url: str, fallback: str) -> str:
    hostname = (urlsplit(url).hostname or "").lower().removeprefix("www.")
    for suffix, label in SOURCE_HOSTS.items():
        if hostname == suffix or hostname.endswith("." + suffix):
            return label
    return fallback


def fetch_bing_rss(query: str, timeout: int = 25) -> list[dict[str, str]]:
    url = f"https://www.bing.com/search?format=rss&setlang=zh-CN&q={quote_plus(query)}"
    request = Request(
        url,
        headers={
            "Accept": "application/rss+xml,application/xml,text/xml",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
            "User-Agent": "Mozilla/5.0 (compatible; IvyJobRadar/1.0)",
        },
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read(2_000_000)
    except Exception as exc:
        print(f"Indexed search failed: {query}: {exc}")
        return []

    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        return []

    records: list[dict[str, str]] = []
    for item in root.findall(".//item"):
        records.append(
            {
                "title": clean_text(item.findtext("title")),
                "url": clean_text(item.findtext("link")),
                "description": clean_text(item.findtext("description")),
            }
        )
    return records


def fetch_text(url: str, timeout: int = 25) -> tuple[str, str]:
    request = Request(
        url,
        headers={
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
            "User-Agent": "Mozilla/5.0 (compatible; IvyJobRadar/1.0)",
        },
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.geturl(), response.read(3_000_000).decode("utf-8", "replace")
    except Exception as exc:
        print(f"Page fetch failed: {url}: {exc}")
        return url, ""


def json_ld_objects(body: str) -> list[dict[str, object]]:
    objects: list[dict[str, object]] = []
    for match in re.finditer(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>',
        body,
        flags=re.IGNORECASE,
    ):
        try:
            payload = json.loads(html.unescape(match.group(1)).strip())
        except (json.JSONDecodeError, TypeError):
            continue
        items = payload if isinstance(payload, list) else payload.get("@graph", [payload]) if isinstance(payload, dict) else []
        objects.extend(item for item in items if isinstance(item, dict))
    return objects


def collect_direct_page(page: dict[str, object]) -> list[dict[str, str]]:
    page_url = str(page["url"])
    final_url, body = fetch_text(page_url)
    if not body:
        return []

    patterns = page.get("job_link_patterns", [r"/job/\d+\.shtml", r"/a/\d+\.shtml"])
    links: list[str] = []
    for pattern in patterns:
        for match in re.finditer(r'href=["\']([^"\']+)["\']', body, flags=re.IGNORECASE):
            link = html.unescape(match.group(1))
            if re.search(str(pattern), link):
                links.append(canonicalize_url(urljoin(final_url, link)))
    links = list(dict.fromkeys(links))[: int(page.get("max_jobs", 40))]

    results: list[dict[str, str]] = []
    for link in links:
        job_url, job_body = fetch_text(link)
        if not job_body:
            continue
        postings = [item for item in json_ld_objects(job_body) if item.get("@type") == "JobPosting"]
        for posting in postings[:1]:
            organization = posting.get("hiringOrganization")
            company = clean_text(organization.get("name")) if isinstance(organization, dict) else ""
            location = posting.get("jobLocation")
            location_text = clean_text(location)
            if isinstance(location, dict):
                address = location.get("address")
                location_text = clean_text(address.get("addressLocality")) if isinstance(address, dict) else ""
            results.append(
                {
                    "title": clean_text(posting.get("title")),
                    "url": job_url,
                    "description": clean_text(re.sub(r"<[^>]+>", " ", str(posting.get("description") or ""))),
                    "company": company,
                    "location": location_text,
                }
            )
        time.sleep(float(page.get("delay_seconds", 0.15)))
    return results


def strip_site_suffix(title: str) -> str:
    return re.split(r"\s*[-_|—]\s*(?:BOSS直聘|猎聘|牛客网?|前程无忧|智联招聘|拉勾).*$", title, maxsplit=1)[0].strip()


def company_from_result(title: str, description: str) -> str:
    patterns = (
        r"(?:招聘企业|公司)[:：]\s*([^，。；|]{2,40})",
        r"([^，。；|]{2,40})(?:正在招聘|招聘)",
    )
    for pattern in patterns:
        match = re.search(pattern, f"{title} {description}")
        if match:
            return clean_text(match.group(1))
    return "待核验公司"


def required_experience(text: str) -> int | None:
    years: list[int] = []
    for pattern in (
        r"(?:至少|最低|要求)\s*(\d+)\s*年",
        r"(\d+)\s*年(?:以上)?(?:相关|工作|行业)?经验",
        r"经验\s*(\d+)\s*[-–—至]\s*(\d+)\s*年",
    ):
        for match in re.finditer(pattern, text):
            years.extend(int(value) for value in match.groups() if value)
    return max(years) if years else None


def monthly_salary_floor_k(text: str) -> float | None:
    """Parse the advertised gross monthly salary floor in thousands of RMB."""
    content = clean_text(text).replace(",", "")
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


def infer_track(text: str) -> str:
    lower = text.lower()
    if re.search(r"量化|quantitative|systematic", lower):
        return "Quant"
    if re.search(r"咨询|consulting", lower):
        return "Consulting"
    if re.search(r"生物统计|医学统计|临床统计|流行病|卫生经济|真实世界|biostat|epidemiol", lower):
        return "Pharma"
    if re.search(r"医疗|医学影像|临床ai|medical|healthcare", lower):
        return "Healthcare AI"
    return "Technology"


def score_job(title: str, evidence: str, years: int | None) -> tuple[int, list[str], bool]:
    text = f"{title} {evidence}"
    lower = text.lower()
    details: list[str] = []
    score = 0

    phd_targeted = bool(re.search(r"博士|ph\.?d\.?|doctorate|doctoral", lower))
    quantitative_degree = bool(re.search(r"统计|生物统计|流行病|数学|经济|数据科学|quantitative", lower))
    targeted_role = any(signal in title.lower() for signal in WANTED_TITLE_SIGNALS)
    score += 10 if phd_targeted else 6 if quantitative_degree else 0
    score += 12 if targeted_role else 0
    score += 4 if years is None else 10 if years == 0 else 8 if years <= 3 else 0
    details.append("学历：明确接受博士" if phd_targeted else "学历：公开摘要未明确，需读取完整 JD 核验")
    details.append("经验：未写明最低年限" if years is None else f"经验：最低要求最高约 {years} 年")

    core_rules = (
        (10, r"生物统计|医学统计|统计建模|统计分析|biostat|statistical"),
        (7, r"研究设计|试验设计|临床试验|study design|clinical trial"),
        (6, r"预测模型|风险预测|机器学习|machine learning"),
        (7, r"因果推断|纵向数据|缺失数据|生存分析|causal|longitudinal"),
    )
    core_score = min(30, sum(points for points, pattern in core_rules if re.search(pattern, lower)))
    score += core_score
    details.append(f"核心专业：{core_score}/30")

    domain_rules = (
        (8, r"临床|医疗|医药|患者|制药|生物科技|clinical|medical|pharma"),
        (6, r"医学影像|神经影像|多模态|数字生物标志物"),
        (6, r"真实世界|卫生经济|药物流行病|rwe|heor"),
        (5, r"实验|决策科学|产品分析|量化研究|咨询"),
    )
    domain_score = min(20, sum(points for points, pattern in domain_rules if re.search(pattern, lower)))
    score += domain_score
    details.append(f"领域迁移：{domain_score}/20")

    tool_score = 0
    if re.search(r"(?:^|\W)r(?:\W|$)|\brstudio\b", text, flags=re.IGNORECASE):
        tool_score += 7
    if re.search(r"\bpython\b", lower):
        tool_score += 5
    if re.search(r"数据分析|统计编程|sas|sql", lower):
        tool_score += 3
    score += min(15, tool_score) + 15
    details.append(f"工具匹配：{min(15, tool_score)}/15")
    details.append("工作授权：中国岗位不适用 sponsorship")

    gap_count = sum(signal in lower for signal in UNSUPPORTED_CORE_SIGNALS)
    if gap_count:
        score -= min(40, gap_count * 15)
        details.append(f"硬技能缺口：检测到 {gap_count} 类不匹配的核心研发要求")

    experience_blocked = years is not None and years > 3
    # Discovery must tolerate incomplete search snippets; final degree eligibility is verified from the full JD.
    eligible = (quantitative_degree or targeted_role) and not experience_blocked and gap_count == 0
    return max(0, min(100, round(score))), details, eligible


def normalize_result(
    result: dict[str, str],
    query: dict[str, str],
    scanned_at: str,
    rejection_stats: dict[str, int] | None = None,
) -> dict[str, object] | None:
    title = strip_site_suffix(result["title"])
    description = clean_text(re.sub(r"<[^>]+>", " ", result["description"]))
    url = canonicalize_url(result["url"])
    combined = f"{title} {description}"
    lower_title = title.lower()
    if not title or not url:
        if rejection_stats is not None:
            rejection_stats["missing_title_or_url"] += 1
        return None
    if not any(signal in combined.lower() for signal in WANTED_TITLE_SIGNALS):
        if rejection_stats is not None:
            rejection_stats["title_not_targeted"] += 1
        return None
    if any(signal in lower_title for signal in EXCLUDED_TITLE_SIGNALS):
        if rejection_stats is not None:
            rejection_stats["excluded_seniority_or_role"] += 1
        return None
    if any(signal in lower_title for signal in OBVIOUSLY_IRRELEVANT_SIGNALS):
        if rejection_stats is not None:
            rejection_stats["excluded_seniority_or_role"] += 1
        return None

    years = required_experience(combined)
    salary_floor = monthly_salary_floor_k(combined)
    if salary_floor is not None and salary_floor < 20:
        if rejection_stats is not None:
            rejection_stats["salary_below_20k"] += 1
        return None
    if salary_floor is None and rejection_stats is not None:
        rejection_stats["salary_missing_or_negotiable"] += 1
    score, details, eligible = score_job(title, description, years)
    if not eligible:
        if rejection_stats is not None:
            rejection_stats["degree_experience_or_skill_gap"] += 1
        return None
    company = clean_text(result.get("company")) or company_from_result(title, description)
    company_key = re.sub(r"\W+", "", company.lower())
    title_key = re.sub(r"\W+", "", title.lower())
    identity = f"{company_key}::{title_key}"
    return {
        "job_key": hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24],
        "company": company,
        "title": title,
        "location": clean_text(result.get("location")) or "中国",
        "region": "中国",
        "track": infer_track(combined),
        "score": score,
        "visa": "不适用",
        "evidence": (
            (f"月薪下限约 {salary_floor:g}K；" if salary_floor is not None
             else "工资未公布或面议，已保留待核验；")
            + f"{source_name(url, query['source'])}公开索引发现，需打开具体 JD 核验；"
            + "；".join(details)
        ),
        "salary": combined,
        "salary_min_monthly_k": salary_floor,
        "skills": [
            label
            for label, pattern in (
                ("R", r"(?:^|\W)r(?:\W|$)"),
                ("Python", r"\bpython\b"),
                ("SAS", r"\bsas\b"),
                ("SQL", r"\bsql\b"),
                ("Biostatistics", r"生物统计|biostat"),
                ("Causal inference", r"因果推断|causal inference"),
                ("Clinical trials", r"临床试验|clinical trial"),
            )
            if re.search(pattern, combined, flags=re.IGNORECASE)
        ][:7],
        "job_url": url,
        "canonical_url": url,
        "application_id": "",
        "source": source_name(url, query["source"]),
        "search_query": query["query"],
        "discovered_at": scanned_at,
        "checked_at": scanned_at,
        "status": "待官网核验",
    }


def write_progress(path: Path | None, payload: dict[str, object]) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)


def run_scan(
    config_path: Path,
    progress_path: Path | None = None,
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    scanned_at = datetime.now(timezone.utc).isoformat()
    records: list[dict[str, object]] = []
    source_stats: list[dict[str, object]] = []
    total_steps = len(config["queries"]) + len(config.get("direct_pages", []))
    completed_steps = 0

    for item in config["queries"]:
        results = fetch_bing_rss(item["query"])
        matched = 0
        rejection_stats = {
            "missing_title_or_url": 0,
            "title_not_targeted": 0,
            "excluded_seniority_or_role": 0,
            "degree_experience_or_skill_gap": 0,
            "score_below_discovery_threshold": 0,
            "salary_below_20k": 0,
            "salary_missing_or_negotiable": 0,
        }
        for result in results:
            normalized = normalize_result(result, item, scanned_at, rejection_stats)
            if normalized:
                records.append(normalized)
                matched += 1
        source_stats.append(
            {
                "source": item["source"],
                "query": item["query"],
                "scanned": len(results),
                "matched": matched,
                "rejected": rejection_stats,
            }
        )
        completed_steps += 1
        write_progress(progress_path, {
            "source": item["source"],
            "phase": "公开索引搜索",
            "message": f"正在搜索 {item['source']}：{completed_steps}/{total_steps}",
            "completed": completed_steps,
            "total": total_steps,
            "scanned": sum(int(row["scanned"]) for row in source_stats),
            "eligible": len(records),
            "rejection_reasons": {
                key: sum(int(row.get("rejected", {}).get(key, 0)) for row in source_stats)
                for key in rejection_stats
                if key != "salary_missing_or_negotiable"
            },
            "review_counts": {
                "salary_missing_or_negotiable": sum(
                    int(row.get("rejected", {}).get("salary_missing_or_negotiable", 0))
                    for row in source_stats
                )
            },
        })
        time.sleep(float(config.get("delay_seconds", 0.3)))

    for page in config.get("direct_pages", []):
        results = collect_direct_page(page)
        matched = 0
        rejection_stats = {
            "missing_title_or_url": 0,
            "title_not_targeted": 0,
            "excluded_seniority_or_role": 0,
            "degree_experience_or_skill_gap": 0,
            "score_below_discovery_threshold": 0,
            "salary_below_20k": 0,
            "salary_missing_or_negotiable": 0,
        }
        query = {"source": str(page["source"]), "query": str(page["url"])}
        for result in results:
            normalized = normalize_result(result, query, scanned_at, rejection_stats)
            if normalized:
                records.append(normalized)
                matched += 1
        source_stats.append(
            {
                "source": page["source"],
                "query": page["url"],
                "scanned": len(results),
                "matched": matched,
                "rejected": rejection_stats,
            }
        )
        completed_steps += 1
        write_progress(progress_path, {
            "source": page["source"],
            "phase": "招聘页搜索",
            "message": f"正在读取 {page['source']}：{completed_steps}/{total_steps}",
            "completed": completed_steps,
            "total": total_steps,
            "scanned": sum(int(row["scanned"]) for row in source_stats),
            "eligible": len(records),
            "rejection_reasons": {
                key: sum(int(row.get("rejected", {}).get(key, 0)) for row in source_stats)
                for key in rejection_stats
                if key != "salary_missing_or_negotiable"
            },
            "review_counts": {
                "salary_missing_or_negotiable": sum(
                    int(row.get("rejected", {}).get("salary_missing_or_negotiable", 0))
                    for row in source_stats
                )
            },
        })

    deduplicated: dict[str, dict[str, object]] = {}
    for record in records:
        key = str(record["job_key"])
        current = deduplicated.get(key)
        if current is None or int(record["score"]) > int(current["score"]):
            deduplicated[key] = record
    ordered = sorted(
        deduplicated.values(),
        key=lambda value: (-int(value["score"]), str(value["company"]), str(value["title"])),
    )
    return ordered, source_stats


def write_outputs(
    records: list[dict[str, object]],
    source_stats: list[dict[str, object]],
    output_dir: Path,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "china_jobs_latest.json").write_text(
        json.dumps(records, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    csv_records = [{**record, "skills": " | ".join(record["skills"])} for record in records]
    pd.DataFrame(csv_records).to_csv(output_dir / "china_jobs_latest.csv", index=False)
    (output_dir / "china_scan_summary.json").write_text(
        json.dumps(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "matched_jobs": len(records),
                "sources": source_stats,
                "note": (
                    "Chinese platform results are public-index discoveries. "
                    "BOSS and other protected pages remain pending until a specific JD can be opened."
                ),
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect indexed Chinese PhD-targeted jobs.")
    parser.add_argument("--config", type=Path, default=Path("config/china_search_queries.json"))
    parser.add_argument("--output-dir", type=Path, default=Path("data/scans"))
    parser.add_argument("--progress-file", type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    records, source_stats = run_scan(args.config, args.progress_file)
    write_outputs(records, source_stats, args.output_dir)
    print(f"Wrote {len(records)} eligible, deduplicated China jobs to {args.output_dir}")


if __name__ == "__main__":
    main()
