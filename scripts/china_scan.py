from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, quote_plus, unquote, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen

import pandas as pd


LAST_SEARCH_STATUS = "ok"
LAST_SEARCH_DETAIL = ""


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
    "数据分析师",
    "数据分析",
    "人工智能",
    "机器学习",
    "深度学习",
    "计算机视觉",
    "医学影像",
    "生物信息",
    "生信分析",
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
    "machine learning",
    "artificial intelligence",
    "computer vision",
    "bioinformatics",
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
    "iguopin.com": "国聘",
    "yingjiesheng.com": "应届生求职网",
}

# Public search engines may ignore a site: operator when a query has few
# results. A result can enter the candidate pool only when both its hostname
# and URL path match the platform that was searched.
PLATFORM_URL_RULES = {
    "BOSS直聘公开索引": {
        "hosts": ("zhipin.com",),
        "paths": (r"^/job_detail/[^/]+\.html$",),
    },
    "猎聘": {
        "hosts": ("liepin.com",),
        "paths": (r"^/job/\d+\.shtml$",),
    },
    "智联招聘": {
        "hosts": ("zhaopin.com",),
        "paths": (r"^/jobdetail/[^/]+\.htm$", r"^/jobs/[^/]+\.htm$"),
    },
    "前程无忧": {
        "hosts": ("51job.com",),
        "paths": (r"^/job/[^/]+", r"^/[^/]+/[^/]+\.html$"),
    },
    "拉勾": {
        "hosts": ("lagou.com",),
        "paths": (r"^/(?:wn/)?jobs/\d+\.html$",),
    },
    "牛客招聘": {
        "hosts": ("nowcoder.com",),
        "paths": (r"^/jobs/detail/\d+", r"^/job/\d+"),
    },
    "国聘": {
        "hosts": ("iguopin.com",),
        "paths": (r"^/job/detail", r"^/jobs/\d+"),
    },
    "应届生求职网": {
        "hosts": ("yingjiesheng.com",),
        "paths": (r"^/job[-/]", r"^/jobview/", r"^/job/\d+"),
    },
}

HARD_REJECTION_KEYS = (
    "missing_title_or_url",
    "source_domain_mismatch",
    "not_specific_job_page",
    "title_not_targeted",
    "excluded_seniority_or_role",
    "degree_experience_or_skill_gap",
    "score_below_discovery_threshold",
    "salary_below_20k",
)


def empty_filter_stats() -> dict[str, int]:
    return {**{key: 0 for key in HARD_REJECTION_KEYS}, "salary_missing_or_negotiable": 0}


def platform_rule(source: str) -> dict[str, tuple[str, ...]] | None:
    for name, rule in PLATFORM_URL_RULES.items():
        if source == name or source.startswith(name + "·"):
            return rule
    return None


def hostname_matches(hostname: str, allowed_hosts: tuple[str, ...]) -> bool:
    return any(hostname == host or hostname.endswith("." + host) for host in allowed_hosts)


def platform_url_rejection(url: str, source: str) -> str | None:
    """Return the rejection key when a platform URL is outside its source contract."""
    rule = platform_rule(source)
    if rule is None:
        return None
    parts = urlsplit(url)
    hostname = (parts.hostname or "").lower().removeprefix("www.")
    if not hostname_matches(hostname, rule["hosts"]):
        return "source_domain_mismatch"
    if not any(re.search(pattern, parts.path, flags=re.IGNORECASE) for pattern in rule["paths"]):
        return "not_specific_job_page"
    return None


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


def parse_brave_results(body: str) -> list[dict[str, str]]:
    """Extract ordinary web results from Brave's server-rendered HTML."""
    starts = [match.start() for match in re.finditer(r'<div class="snippet[^>]+data-type="web"', body)]
    records: list[dict[str, str]] = []
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else len(body)
        block = body[start:end]
        link_match = re.search(
            r'<a href="(https?://[^"]+)"[^>]*class="[^"]*\bl1\b[^"]*"',
            block,
            flags=re.IGNORECASE,
        )
        title_match = re.search(
            r'<div class="title search-snippet-title[^"]*"[^>]*title="([^"]*)"',
            block,
            flags=re.IGNORECASE,
        )
        if not link_match or not title_match:
            continue
        description_match = re.search(
            r'<div class="content [^"]*line-clamp-dynamic[^"]*">([\s\S]*?)</div>',
            block,
            flags=re.IGNORECASE,
        )
        description = description_match.group(1) if description_match else ""
        description = re.sub(r"<!--[\s\S]*?-->|<[^>]+>", " ", description)
        records.append({
            "title": clean_text(title_match.group(1)),
            "url": clean_text(link_match.group(1)),
            "description": clean_text(description),
        })
    return records


def parse_yahoo_results(body: str) -> list[dict[str, str]]:
    """Extract ordinary web results and decode Yahoo redirect URLs."""
    starts = [match.start() for match in re.finditer(r'<div class="dd [^"]*\balgo\b', body)]
    records: list[dict[str, str]] = []
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else len(body)
        block = body[start:end]
        redirect_match = re.search(
            r'href="https://r\.search\.yahoo\.com/[^"]*/RU=([^/]+)/RK=',
            block,
            flags=re.IGNORECASE,
        )
        direct_match = re.search(r'href="(https?://[^"]+)"', block, flags=re.IGNORECASE)
        title_match = re.search(r'<h3[^>]*>([\s\S]*?)</h3>', block, flags=re.IGNORECASE)
        if not title_match or not (redirect_match or direct_match):
            continue
        raw_url = unquote(redirect_match.group(1)) if redirect_match else html.unescape(direct_match.group(1))
        description_match = re.search(
            r'<div class="compText[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)</p>',
            block,
            flags=re.IGNORECASE,
        )
        title = re.sub(r"<[^>]+>", "", title_match.group(1))
        description = re.sub(r"<[^>]+>", " ", description_match.group(1)) if description_match else ""
        records.append({
            "title": clean_text(title),
            "url": clean_text(raw_url),
            "description": clean_text(description),
        })
    return records


def fetch_yahoo_results(query: str, timeout: int = 20) -> list[dict[str, str]]:
    global LAST_SEARCH_DETAIL, LAST_SEARCH_STATUS
    url = f"https://search.yahoo.com/search?p={quote_plus(query)}"
    request = Request(
        url,
        headers={
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/150 Safari/537.36",
        },
    )
    for attempt in range(2):
        try:
            with urlopen(request, timeout=timeout) as response:
                text = response.read(2_000_000).decode("utf-8", "replace")
            break
        except Exception as exc:
            detail = str(exc)
            LAST_SEARCH_STATUS = "rate_limited" if "429" in detail else "search_source_error"
            LAST_SEARCH_DETAIL = f"Yahoo: {detail}"
            print(f"Yahoo fallback search failed: {query}: {exc}")
            if attempt == 0 and "429" in detail:
                time.sleep(2)
                continue
            return []
    if "captcha" in text.lower() or "challenge-form" in text.lower():
        LAST_SEARCH_STATUS = "verification_required"
        LAST_SEARCH_DETAIL = "Yahoo returned a verification page."
        return []
    records = parse_yahoo_results(text)
    LAST_SEARCH_STATUS = "ok" if records else "no_results"
    LAST_SEARCH_DETAIL = ""
    return records


def fetch_bing_rss(query: str, timeout: int = 20) -> list[dict[str, str]]:
    """Fetch public-index results; retain the legacy name for test compatibility."""
    global LAST_SEARCH_DETAIL, LAST_SEARCH_STATUS
    LAST_SEARCH_STATUS = "ok"
    LAST_SEARCH_DETAIL = ""
    url = f"https://search.brave.com/search?source=web&q={quote_plus(query)}"
    request = Request(
        url,
        headers={
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/150 Safari/537.36",
        },
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read(2_000_000)
    except Exception as exc:
        print(f"Public-index search failed: {query}: {exc}")
        # A blocked primary provider must not prevent the independent fallback.
        primary_status = "rate_limited" if "429" in str(exc) else "search_source_error"
        primary_detail = f"Brave: {exc}"
        records = fetch_yahoo_results(query, timeout)
        if not records and LAST_SEARCH_STATUS == "no_results":
            LAST_SEARCH_STATUS = primary_status
            LAST_SEARCH_DETAIL = f"{primary_detail}; Yahoo returned no results."
        return records
    text = body.decode("utf-8", "replace")
    if "challenge-form" in text or '<div class="captcha"' in text.lower():
        print(f"Public-index search requires verification: {query}")
        return fetch_yahoo_results(query, timeout)
    records = parse_brave_results(text)
    if records:
        LAST_SEARCH_STATUS = "ok"
        return records
    return fetch_yahoo_results(query, timeout)


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
    if suffix_match := re.search(r"[-—]\s*([^|]{2,60}(?:公司|集团|研究院|中心))$", title):
        return clean_text(suffix_match.group(1))
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
        (r"(?:月薪|薪资)[:：]?\s*(\d{4,6})\s*元?(?:\s*/?\s*月)?", 0.001),
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


def unsupported_core_role(title: str, description: str) -> bool:
    """Identify LLM/NLP roles only when the unsupported area is explicitly core."""
    lower_title = title.lower()
    if any(signal in lower_title for signal in UNSUPPORTED_CORE_SIGNALS):
        return True
    lower_description = description.lower()
    core_phrase = r"(?:核心工作|核心职责|主要工作|主要职责|主要负责|岗位方向|专注于)"
    unsupported_phrase = r"(?:大语言模型|大模型(?:训练|研发)?|自然语言处理|\bllm\b|\brag\b|\bnlp\b)"
    return bool(re.search(core_phrase + r".{0,30}" + unsupported_phrase, lower_description))


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
    # LLM or NLP terminology in a description is a ranking penalty, not a hard
    # filter. A role is rejected only when its title says that is the core job.
    eligible = (
        (quantitative_degree or targeted_role)
        and not experience_blocked
        and not unsupported_core_role(title, evidence)
    )
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
    url_rejection = platform_url_rejection(url, str(query.get("source", "")))
    if url_rejection:
        if rejection_stats is not None:
            rejection_stats[url_rejection] += 1
        return None
    content_is_targeted = any(signal in combined.lower() for signal in WANTED_TITLE_SIGNALS)
    # The query is the recall step, but it cannot prove that a returned page is
    # relevant because public search engines sometimes ignore query operators.
    if not content_is_targeted:
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
    # Search snippets often omit the employer. Use the canonical URL in that
    # case so different jobs with the same generic title are not collapsed.
    identity = url if company == "待核验公司" else f"{company_key}::{title_key}"
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
        "salary": f"月薪下限约 {salary_floor:g}K" if salary_floor is not None else "未公布或面议",
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
    query_override: dict[str, str] | None = None,
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    scanned_at = datetime.now(timezone.utc).isoformat()
    records: list[dict[str, object]] = []
    source_stats: list[dict[str, object]] = []
    queries = [query_override] if query_override else config["queries"]
    direct_pages = [] if query_override else config.get("direct_pages", [])
    total_steps = len(queries) + len(direct_pages)
    completed_steps = 0

    for item in queries:
        global LAST_SEARCH_DETAIL, LAST_SEARCH_STATUS
        LAST_SEARCH_STATUS = "ok"
        LAST_SEARCH_DETAIL = ""
        results = fetch_bing_rss(item["query"])
        matched = 0
        rejection_stats = empty_filter_stats()
        for result in results:
            normalized = normalize_result(result, item, scanned_at, rejection_stats)
            if normalized:
                records.append(normalized)
                matched += 1
        hard_rejected = sum(rejection_stats[key] for key in HARD_REJECTION_KEYS)
        valid_platform_urls = len(results) - rejection_stats["source_domain_mismatch"] - rejection_stats["not_specific_job_page"]
        source_stats.append({
            "source": item["source"],
            "query": item["query"],
            "scanned": len(results),
            "valid_platform_urls": valid_platform_urls,
            "matched": matched,
            "rejected_total": hard_rejected,
            "accounted_for": matched + hard_rejected == len(results),
            "source_status": (
                LAST_SEARCH_STATUS if not results and LAST_SEARCH_STATUS != "ok"
                else "no_results" if not results
                else "job_pages_not_indexed" if (
                    item["source"] == "拉勾"
                    and valid_platform_urls == 0
                    and rejection_stats["not_specific_job_page"] == len(results)
                )
                else "search_source_anomaly" if valid_platform_urls == 0
                else "ok"
            ),
            "source_detail": (
                "Public search returned only Lagou activity or listing pages; no specific job page is publicly indexed."
                if item["source"] == "拉勾" and valid_platform_urls == 0 and results
                else LAST_SEARCH_DETAIL
            ),
            "rejected": rejection_stats,
        })
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

    for page in direct_pages:
        results = collect_direct_page(page)
        matched = 0
        rejection_stats = empty_filter_stats()
        query = {"source": str(page["source"]), "query": str(page["url"])}
        for result in results:
            normalized = normalize_result(result, query, scanned_at, rejection_stats)
            if normalized:
                records.append(normalized)
                matched += 1
        hard_rejected = sum(rejection_stats[key] for key in HARD_REJECTION_KEYS)
        valid_platform_urls = len(results) - rejection_stats["source_domain_mismatch"] - rejection_stats["not_specific_job_page"]
        source_stats.append({
            "source": page["source"],
            "query": page["url"],
            "scanned": len(results),
            "valid_platform_urls": valid_platform_urls,
            "matched": matched,
            "rejected_total": hard_rejected,
            "accounted_for": matched + hard_rejected == len(results),
            "source_status": "no_results" if not results else "ok",
            "rejected": rejection_stats,
        })
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
                "scanned_results": sum(int(row["scanned"]) for row in source_stats),
                "valid_platform_urls": sum(int(row.get("valid_platform_urls", 0)) for row in source_stats),
                "search_source_anomalies": sum(row.get("source_status") == "search_source_anomaly" for row in source_stats),
                "unavailable_sources": sum(
                    row.get("source_status") in {
                        "job_pages_not_indexed",
                        "rate_limited",
                        "verification_required",
                        "search_source_error",
                    }
                    for row in source_stats
                ),
                "all_counts_reconcile": all(bool(row.get("accounted_for")) for row in source_stats),
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
    parser.add_argument("--source", help="Source label for a single-query smoke test.")
    parser.add_argument("--query", help="Run one public-index query instead of the full config.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if bool(args.source) != bool(args.query):
        raise SystemExit("--source and --query must be provided together")
    query_override = {"source": args.source, "query": args.query} if args.query else None
    records, source_stats = run_scan(args.config, args.progress_file, query_override)
    write_outputs(records, source_stats, args.output_dir)
    print(f"Wrote {len(records)} eligible, deduplicated China jobs to {args.output_dir}")


if __name__ == "__main__":
    main()
