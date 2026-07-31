from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote_plus, unquote, urljoin, urlsplit
from urllib.request import Request, urlopen
from xml.etree import ElementTree


USER_AGENT = "Mozilla/5.0 (compatible; IvyJobRadar/2.0; +personal-job-search)"
TARGET_TITLE = re.compile(
    r"(?:biostatistic|statistical scientist|clinical statistic|medical statistic|"
    r"data scientist|applied scientist|research scientist|decision scientist|"
    r"quantitative researcher|quantitative analyst|quant researcher|"
    r"epidemiolog|health econom|outcomes research|real.world evidence|"
    r"healthcare consultant|life sciences consultant|clinical data scientist|"
    r"生物统计|统计科学|数据科学|应用科学|量化研究|流行病|卫生经济|"
    r"真实世界|医药咨询|医疗咨询|算法科学|医学数据)",
    re.IGNORECASE,
)
EXCLUDED_TITLE = re.compile(
    r"(?:\bintern(?:ship)?\b|postdoc|postdoctoral|\bsenior\b|\bsr\.?\b|"
    r"\bprincipal\b|\bstaff\b|\bdirector\b|\bmanager\b|\blead\b|"
    r"\bhead\b|vice president|\bvp\b|software engineer|data engineer|"
    r"machine learning engineer|generative ai|large language model|\bllm\b|\bnlp\b|"
    r"实习|博士后|高级|资深|总监|经理|负责人)",
    re.IGNORECASE,
)
JOB_LINK = re.compile(r"(?:job|career|position|opening|vacan|recruit|招聘|职位)", re.IGNORECASE)
CLOSED_SIGNALS = (
    "job is no longer available",
    "position is no longer available",
    "this job has expired",
    "position has been filled",
    "no longer accepting applications",
    "job not found",
    "职位已下线",
    "职位已关闭",
)
US_LOCATION = re.compile(
    r"\b(?:united states|usa|u\.s\.|remote|alabama|alaska|arizona|arkansas|california|"
    r"colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|"
    r"iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|"
    r"mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|"
    r"new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|"
    r"rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|"
    r"washington|west virginia|wisconsin|wyoming|district of columbia)\b",
    re.I,
)
CHINA_LOCATION = re.compile(
    r"(?:中国|北京|上海|深圳|广州|杭州|南京|苏州|成都|武汉|西安|天津|重庆|"
    r"\bchina\b|\bbeijing\b|\bshanghai\b|\bshenzhen\b|\bguangzhou\b|\bhangzhou\b)",
    re.I,
)
NON_US_LOCATION = re.compile(
    r"\b(?:canada|india|germany|france|united kingdom|uk|ireland|spain|italy|"
    r"netherlands|switzerland|australia|brazil|mexico|singapore|japan|korea|"
    r"poland|sweden|denmark|norway|belgium|austria|portugal|israel)\b",
    re.I,
)
ATS_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("greenhouse", re.compile(r"(?:boards|job-boards)\.greenhouse\.io/([^/?#]+)", re.I)),
    ("lever", re.compile(r"jobs\.lever\.co/([^/?#]+)", re.I)),
    ("ashby", re.compile(r"jobs\.ashbyhq\.com/([^/?#]+)", re.I)),
    ("smartrecruiters", re.compile(r"(?:jobs|careers)\.smartrecruiters\.com/([^/?#]+)", re.I)),
    ("workable", re.compile(r"apply\.workable\.com/([^/?#]+)", re.I)),
    ("teamtailor", re.compile(r"https?://([^.]+)\.teamtailor\.com", re.I)),
    ("recruitee", re.compile(r"https?://([^.]+)\.recruitee\.com", re.I)),
    ("bamboohr", re.compile(r"https?://([^.]+)\.bamboohr\.com", re.I)),
    ("breezy", re.compile(r"https?://([^.]+)\.breezy\.hr", re.I)),
    ("personio", re.compile(r"https?://([^.]+)\.jobs\.personio\.(?:de|com)", re.I)),
    ("paylocity", re.compile(r"recruiting\.paylocity\.com/recruiting/jobs/(?:all|details)/([0-9a-f-]{36})", re.I)),
    ("icims", re.compile(r"https?://(?:careers|jobs)-?([^.]+)\.icims\.com", re.I)),
    ("jobvite", re.compile(r"jobs\.jobvite\.com/([^/?#]+)", re.I)),
    ("taleo", re.compile(r"(?:taleo\.net|oraclecloud\.com)", re.I)),
    ("successfactors", re.compile(r"successfactors\.(?:com|eu)", re.I)),
    ("dayforce", re.compile(r"(?:dayforcehcm\.com|dayforce\.com)", re.I)),
    ("ukg", re.compile(r"(?:ultipro\.com|recruiting\.ultipro\.ca|ukg\.com)", re.I)),
    ("adp", re.compile(r"(?:workforcenow\.adp\.com|recruiting\.adp\.com)", re.I)),
    ("jazzhr", re.compile(r"applytojob\.com/apply/[^/?#]+", re.I)),
    ("rippling", re.compile(r"ats\.rippling\.com/([^/?#]+)", re.I)),
    ("pinpoint", re.compile(r"pinpointhq\.com", re.I)),
    ("comeet", re.compile(r"(?:comeet\.com|comeet\.co)", re.I)),
    ("jibeapply", re.compile(r"https?://([^.]+)\.jibeapply\.com", re.I)),
    ("oraclecloud", re.compile(r"https?://([^.]+(?:\.[^.]+)*)\.oraclecloud\.com/.+?/sites/([^/?#]+)/jobs", re.I)),
    ("gem", re.compile(r"jobs\.gem\.com/([^/?#]+)", re.I)),
)
AGGREGATOR_DOMAINS = {
    "linkedin.com",
    "indeed.com",
    "glassdoor.com",
    "ziprecruiter.com",
    "talent.com",
    "wellfound.com",
}
COMMON_CRAWL_BUDGET = threading.BoundedSemaphore(20)
WIKIDATA_BUDGET = threading.BoundedSemaphore(100)
_common_crawl_index = ""
_common_crawl_lock = threading.Lock()

# Map regional and legacy company-pool labels to the parent name used by upstream ATS data.
COMPANY_NAME_ALIASES = {
    "iqvia中国": "IQVIA",
    "礼来中国": "Eli Lilly",
    "罗氏中国": "Genentech/Roche",
    "葛兰素史克中国": "GSK",
    "诺华中国": "Novartis",
    "赛诺菲中国": "Sanofi",
    "辉瑞中国": "Pfizer",
    "阿斯利康中国": "AstraZeneca",
    "默沙东中国": "Merck & Co.",
    "强生创新制药中国": "Johnson & Johnson Innovative Medicine",
    "apple health": "Apple Inc.",
    "google/fitbit": "Fitbit",
    "microsoft health & life sciences": "Microsoft",
    "ppd/thermo fisher scientific": "Thermo Fisher Scientific",
    "beone medicines（原百济神州）": "BeOne Medicines",
    "英矽智能（insilico medicine）": "Insilico Medicine",
    "晶泰科技（xtalpi）": "XtalPi",
}

# Stable public career portals verified from employer pages or public ATS boards.
# These seeds avoid relying on search-engine HTML when a company has no current
# targeted posting in the upstream Aggregator sample.
VERIFIED_COMPANY_PORTALS = {
    "abbvie": "https://careers.smartrecruiters.com/abbvie",
    "actigraph": "https://apply.workable.com/ametris/",
    "alivecor": "https://jobs.jobvite.com/alivecor/jobs",
    "analysisgroup": "https://professionalcareers-analysisgroup.icims.com/jobs/search?ss=1",
    "biogen": "https://biibhr.wd3.myworkdayjobs.com/external",
    "biomarin": "https://jobs.jobvite.com/biomarin/jobs",
    "cytel": "https://iblyjb.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/cytel/jobs",
    "denalitherapeutics": "https://dnli.wd1.myworkdayjobs.com/Discovery",
    "dexcom": "https://dexcom.wd1.myworkdayjobs.com/Dexcom",
    "empatica": "https://apply.workable.com/empatica/",
    "foundationmedicine": "https://careers.foundationmedicine.com/jobs/search",
    "gehealthcare": "https://gehc.wd5.myworkdayjobs.com/GEHC_ExternalSite",
    "gileadsciences": "https://gilead.wd1.myworkdayjobs.com/gileadcareers",
    "guardanthealth": "https://gh.wd1.myworkdayjobs.com/gh",
    "johnsonjohnsoninnovativemedicine": "https://jj.wd5.myworkdayjobs.com/JJ",
    "koneksa": "https://careers.smartrecruiters.com/Koneksa",
    "merck": "https://msd.wd5.myworkdayjobs.com/SearchJobs",
    "elililly": "https://lilly.wd115.myworkdayjobs.com/LLY",
    "neurocrinebiosciences": "https://neurocrine.wd5.myworkdayjobs.com/Neurocrinecareers",
    "om1": "https://job-boards.greenhouse.io/om1",
    "siemenshealthineers": "https://onehealthineers.wd3.myworkdayjobs.com/SHSJB",
    "tempusai": "https://tempus.wd5.myworkdayjobs.com/Tempus_Careers",
    "trinetx": "https://globaleur241.dayforcehcm.com/CandidatePortal/en-US/trinetx1",
    "vertexpharmaceuticals": "https://vrtx.wd501.myworkdayjobs.com/Vertex_Careers",
    "腾讯医疗健康": "https://tencent.wd1.myworkdayjobs.com/Tencent_Careers",
}


class PortalParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self.json_ld: list[str] = []
        self.text: list[str] = []
        self._href = ""
        self._anchor: list[str] = []
        self._script_type = ""
        self._script: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value or "" for key, value in attrs}
        if tag in {"style", "noscript"}:
            self._skip += 1
        if tag == "a":
            self._href = values.get("href", "")
            self._anchor = []
        if tag == "script":
            self._script_type = values.get("type", "").lower()
            self._script = []

    def handle_endtag(self, tag: str) -> None:
        if tag in {"style", "noscript"} and self._skip:
            self._skip -= 1
        if tag == "a" and self._href:
            self.links.append((self._href, clean(" ".join(self._anchor))))
            self._href = ""
            self._anchor = []
        if tag == "script":
            if "ld+json" in self._script_type and self._script:
                self.json_ld.append("".join(self._script))
            self._script_type = ""
            self._script = []

    def handle_data(self, data: str) -> None:
        if self._script_type:
            self._script.append(data)
        elif self._href:
            self._anchor.append(data)
        elif not self._skip:
            self.text.append(data)


@dataclass
class FetchResult:
    status: int
    url: str
    body: str
    attempts: int
    error: str = ""


@dataclass
class CompanyReceipt:
    company: str
    region: str
    career_homepage: str
    final_url: str = ""
    ats_type: str = "unidentified"
    ats_tenant: str = ""
    state: str = "failed"
    http_status: int = 0
    attempts: int = 0
    jobs_scanned: int = 0
    jobs_matched: int = 0
    error: str = ""
    checked_at: str = ""


def clean(value: object) -> str:
    return re.sub(r"\s+", " ", unescape(str(value or ""))).strip()


def fetch(
    url: str,
    timeout: int = 18,
    retries: int = 2,
    request_body: bytes | None = None,
) -> FetchResult:
    last_error = ""
    for attempt in range(1, retries + 2):
        request = Request(
            url,
            data=request_body,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/json,application/ld+json,text/html,application/xml,text/xml,*/*",
                "Accept-Language": "en-US,en;q=0.8,zh-CN;q=0.6",
                "Content-Type": "application/json",
            },
        )
        try:
            with urlopen(request, timeout=timeout) as response:
                body = response.read(6_000_000).decode(
                    response.headers.get_content_charset() or "utf-8", "replace"
                )
                return FetchResult(response.status, response.geturl(), body, attempt)
        except HTTPError as error:
            body = error.read(300_000).decode("utf-8", "replace")
            if error.code not in {408, 425, 429, 500, 502, 503, 504}:
                return FetchResult(error.code, error.geturl(), body, attempt, str(error))
            last_error = f"HTTP {error.code}"
        except (URLError, TimeoutError, ValueError) as error:
            last_error = str(error)
        if attempt <= retries:
            # Add jitter so parallel company requests do not retry at the same instant.
            time.sleep((2 ** (attempt - 1)) + random.random())
    return FetchResult(0, url, "", retries + 1, last_error[:300])


def parse_html(body: str, base_url: str) -> tuple[str, list[tuple[str, str]], list[dict[str, Any]]]:
    parser = PortalParser()
    try:
        parser.feed(body)
    except Exception:
        pass
    links = [(urljoin(base_url, href), anchor) for href, anchor in parser.links]
    postings: list[dict[str, Any]] = []
    for raw in parser.json_ld:
        try:
            payload = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            continue
        stack = payload if isinstance(payload, list) else [payload]
        while stack:
            item = stack.pop()
            if isinstance(item, list):
                stack.extend(item)
            elif isinstance(item, dict):
                item_type = item.get("@type")
                types = item_type if isinstance(item_type, list) else [item_type]
                if "JobPosting" in types:
                    postings.append(item)
                graph = item.get("@graph")
                if isinstance(graph, list):
                    stack.extend(graph)
    return clean(" ".join(parser.text)), links, postings


def detect_ats(urls: list[str]) -> tuple[str, str, str]:
    for url in urls:
        parsed = urlsplit(url)
        hostname = (parsed.hostname or "").lower()
        path_parts = [part for part in parsed.path.split("/") if part]
        query = parse_qs(parsed.query)

        if hostname.endswith("myworkdayjobs.com"):
            site = path_parts[0] if path_parts else ""
            return "workday", f"{hostname}/{site}".rstrip("/"), url
        if hostname.endswith("oraclecloud.com") and "CandidateExperience" in parsed.path:
            site_match = re.search(r"/sites/([^/?#]+)", parsed.path, re.I)
            if site_match:
                host_prefix = hostname[: -len(".oraclecloud.com")]
                return "oraclecloud", f"{host_prefix}/{site_match.group(1)}", url
        if hostname.endswith(".icims.com"):
            return "icims", hostname, url
        if hostname == "recruiting.paylocity.com":
            feed_match = re.search(r"/api/feed/jobs/([0-9a-f-]{36})", parsed.path, re.I)
            if feed_match:
                return "paylocity", f"feed|{feed_match.group(1)}", url
            match = re.search(
                r"/recruiting/jobs/(?:all|details)/([0-9a-f-]{36})",
                parsed.path,
                re.I,
            )
            if match:
                return "paylocity", match.group(1), url
        if hostname.endswith(".applytojob.com"):
            return "jazzhr", hostname.split(".", 1)[0], url
        if hostname in {"www.comeet.com", "comeet.com", "www.comeet.co", "comeet.co"}:
            api_match = re.search(
                r"/careers-api/2\.0/company/([^/]+)/positions",
                parsed.path,
                re.I,
            )
            company_id = (
                unquote(api_match.group(1))
                if api_match
                else clean((query.get("company") or query.get("companyId") or [""])[0])
            )
            token = clean((query.get("token") or [""])[0])
            tenant = "|".join(value for value in (company_id, token) if value)
            return "comeet", tenant, url
        if hostname.endswith("successfactors.com") or hostname.endswith("successfactors.eu"):
            company = clean((query.get("company") or [""])[0])
            return "successfactors", "|".join(value for value in (hostname, company) if value), url
        if "dayforcehcm.com" in hostname or hostname.endswith("dayforce.com"):
            tenant = path_parts[1] if len(path_parts) > 1 and path_parts[0].lower() in {"en-us", "en-ca", "fr-ca"} else ""
            return "dayforce", tenant, url
        if "ultipro.com" in hostname or hostname.endswith("ukg.com"):
            tenant = path_parts[0] if path_parts else hostname
            return "ukg", tenant, url
        if hostname in {"workforcenow.adp.com", "recruiting.adp.com"}:
            company = clean((query.get("cid") or query.get("clientId") or [""])[0])
            return "adp", company, url

        for name, pattern in ATS_PATTERNS:
            match = pattern.search(url)
            if not match:
                continue
            groups = [clean(value) for value in match.groups() if clean(value)]
            tenant = "/".join(groups)
            return name, tenant, url
    return "generic", "", urls[0] if urls else ""


def extract_search_links(body: str) -> list[str]:
    links: list[str] = []
    for match in re.finditer(r'href=["\']([^"\']+)', body, re.I):
        url = unescape(match.group(1))
        redirect = re.search(r"[?&](?:uddg|url|q)=([^&]+)", url)
        if redirect:
            url = unquote(redirect.group(1))
        if url.startswith("http"):
            links.append(url)
    return links


def extract_embedded_urls(body: str) -> list[str]:
    """Recover public ATS endpoints referenced inside scripts and inline page state."""
    urls: list[str] = []
    for match in re.finditer(r"https?://[^\s\"'<>]+", body, re.I):
        url = unescape(match.group(0)).replace("\\/", "/").rstrip("),;:'\"")
        if url not in urls:
            urls.append(url)
    return urls


def plausible_company_portal(url: str, company: str) -> bool:
    hostname = (urlsplit(url).hostname or "").lower().removeprefix("www.")
    if not hostname or any(hostname == domain or hostname.endswith("." + domain) for domain in AGGREGATOR_DOMAINS):
        return False
    if detect_ats([url])[0] != "generic":
        return True
    tokens = [
        token
        for token in re.findall(r"[a-z0-9]+", company.casefold())
        if len(token) >= 4 and token not in {"health", "group", "pharma", "medical", "technology"}
    ]
    compact_host = hostname.replace("-", "")
    return bool(tokens) and any(token in compact_host for token in tokens) and bool(JOB_LINK.search(url))


def company_names_match(left: str, right: str) -> bool:
    """Reject unrelated Wikidata search results before trusting their website claim."""
    left_keys = company_match_keys(left)
    right_keys = company_match_keys(right)
    for left_key in left_keys:
        for right_key in right_keys:
            if min(len(left_key), len(right_key)) >= 4 and (
                left_key in right_key or right_key in left_key
            ):
                return True
    return False


def wikidata_official_website(company: str) -> str:
    """Resolve an official homepage from Wikidata's P856 claim without an API key."""
    if not WIKIDATA_BUDGET.acquire(blocking=False):
        return ""
    language = "zh" if re.search(r"[\u4e00-\u9fff]", company) else "en"
    search_name = COMPANY_NAME_ALIASES.get(clean(company).casefold(), company)
    endpoint = (
        "https://www.wikidata.org/w/api.php?action=wbsearchentities"
        f"&search={quote_plus(search_name)}&language={language}&format=json&limit=3&origin=*"
    )
    payload = json_payload(fetch(endpoint, retries=1))
    candidates = payload.get("search", []) if isinstance(payload, dict) else []
    for candidate in candidates:
        entity_id = clean(candidate.get("id")) if isinstance(candidate, dict) else ""
        label = clean(candidate.get("label")) if isinstance(candidate, dict) else ""
        if not entity_id or not company_names_match(search_name, label):
            continue
        entity_url = (
            "https://www.wikidata.org/w/api.php?action=wbgetentities"
            f"&ids={quote_plus(entity_id)}&props=claims&format=json&origin=*"
        )
        entity_payload = json_payload(fetch(entity_url, retries=1))
        entities = entity_payload.get("entities", {}) if isinstance(entity_payload, dict) else {}
        claims = entities.get(entity_id, {}).get("claims", {}) if isinstance(entities, dict) else {}
        websites = claims.get("P856", []) if isinstance(claims, dict) else []
        for claim in websites:
            try:
                website = clean(claim["mainsnak"]["datavalue"]["value"])
            except (KeyError, TypeError):
                continue
            if website.startswith(("http://", "https://")):
                return website
    return ""


def discover_homepage(company: str) -> tuple[str, str]:
    query = quote_plus(f'"{company}" careers jobs')
    errors: list[str] = []
    for endpoint in (
        f"https://html.duckduckgo.com/html/?q={query}",
        f"https://www.bing.com/search?q={query}",
    ):
        result = fetch(endpoint, retries=1)
        if result.status != 200:
            errors.append(result.error or f"HTTP {result.status}")
            continue
        for link in extract_search_links(result.body):
            if plausible_company_portal(link, company):
                return link, ""
    official_website = wikidata_official_website(company)
    if official_website:
        return official_website, ""
    return "", "; ".join(errors)[:300] or "No official career portal found by public discovery."


def common_crawl_career_url(seed_url: str) -> str:
    """Use a bounded Common Crawl lookup only when live-page discovery found nothing."""
    global _common_crawl_index
    if not COMMON_CRAWL_BUDGET.acquire(blocking=False):
        return ""
    try:
        hostname = (urlsplit(seed_url).hostname or "").lower().removeprefix("www.")
        if not hostname:
            return ""
        with _common_crawl_lock:
            if not _common_crawl_index:
                collections = json_payload(fetch("https://index.commoncrawl.org/collinfo.json", retries=1))
                if isinstance(collections, list) and collections and isinstance(collections[0], dict):
                    _common_crawl_index = clean(collections[0].get("id"))
        if not _common_crawl_index:
            return ""
        endpoint = (
            f"https://index.commoncrawl.org/{_common_crawl_index}-index"
            f"?url={quote_plus(hostname + '/*')}&output=json&filter=status:200&collapse=urlkey"
        )
        result = fetch(endpoint, retries=1)
        if result.status != 200:
            return ""
        for line in result.body.splitlines()[:1000]:
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            url = clean(row.get("url")) if isinstance(row, dict) else ""
            if url and JOB_LINK.search(url):
                return url
        return ""
    finally:
        # The semaphore is intentionally not released: it is a per-process request budget.
        pass


def company_rows(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    unique: dict[str, dict[str, Any]] = {}
    for row in payload:
        company = clean(row.get("company"))
        if not company:
            continue
        key = re.sub(r"\W+", "", company).casefold()
        current = unique.get(key)
        source = clean(row.get("source"))
        if current is None or (not clean(current.get("source")) and source):
            unique[key] = row
    return sorted(unique.values(), key=lambda row: (clean(row.get("region")), int(row.get("rank") or 9999)))


def company_match_keys(company: str) -> list[str]:
    """Return stable keys for matching regional, legacy, and parent company labels."""
    raw = clean(company)
    alias = COMPANY_NAME_ALIASES.get(raw.casefold(), "")
    candidates = [raw, alias]
    candidates.extend(re.split(r"[/（(]", raw, maxsplit=1)[:1])
    keys: list[str] = []
    for candidate in candidates:
        normalized = re.sub(
            r"(?:中国|china|incorporated|corporation|corp|company|co|limited|ltd)$",
            "",
            re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "", clean(candidate).casefold()),
        )
        if normalized and normalized not in keys:
            keys.append(normalized)
    return keys


def verified_company_portal(company: str) -> str:
    """Return a reviewed public portal seed for a company or one of its aliases."""
    return next(
        (VERIFIED_COMPANY_PORTALS[key] for key in company_match_keys(company) if key in VERIFIED_COMPANY_PORTALS),
        "",
    )


def aggregator_portals(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    portals: dict[str, str] = {}
    for row in payload:
        if not isinstance(row, dict):
            continue
        url = clean(row.get("sample_job_url"))
        if not url:
            continue
        for label in (clean(row.get("company")), clean(row.get("upstream_company"))):
            for key in company_match_keys(label):
                portals.setdefault(key, url)
    return portals


def previous_portals(path: Path) -> dict[str, str]:
    """Reuse the strongest portal evidence from the prior production receipt."""
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    portals: dict[str, str] = {}
    for row in payload if isinstance(payload, list) else []:
        if not isinstance(row, dict):
            continue
        url = clean(row.get("final_url")) or clean(row.get("career_homepage"))
        company = clean(row.get("company"))
        has_evidence = (
            clean(row.get("ats_type")) not in {"", "generic", "unidentified"}
            or int(row.get("jobs_scanned") or 0) > 0
            or bool(re.search(r"(?:career|jobs?|recruit|招聘|职位)", url, re.I))
        )
        if company and url.startswith(("http://", "https://")) and has_evidence:
            for key in company_match_keys(company):
                portals.setdefault(key, url)
    return portals


def json_payload(result: FetchResult) -> Any:
    if result.status != 200:
        return None
    try:
        return json.loads(result.body)
    except json.JSONDecodeError:
        return None


def nested_location(value: Any) -> str:
    """Flatten common ATS location shapes into a readable string."""
    if isinstance(value, str):
        return clean(value)
    if isinstance(value, list):
        return ", ".join(filter(None, (nested_location(item) for item in value)))
    if not isinstance(value, dict):
        return ""
    parts = [
        clean(value.get(key))
        for key in (
            "name",
            "city",
            "state",
            "region",
            "country",
            "isoCountry",
            "addressLocality",
            "addressRegion",
            "addressCountry",
        )
        if clean(value.get(key))
    ]
    address = value.get("address")
    if isinstance(address, dict):
        parts.extend(
            clean(address.get(key))
            for key in ("addressLocality", "addressRegion", "addressCountry")
            if clean(address.get(key))
        )
    return ", ".join(dict.fromkeys(parts))


def generic_job_row(row: dict[str, Any], base_url: str) -> dict[str, Any] | None:
    """Normalize one job-like object found in an enterprise ATS payload."""
    title = value(
        row,
        "title",
        "Title",
        "name",
        "Name",
        "jobTitle",
        "JobTitle",
        "positionTitle",
        "requisitionTitle",
    )
    raw_url = value(
        row,
        "url",
        "jobUrl",
        "jobURL",
        "applyUrl",
        "applyURL",
        "absolute_url",
        "hostedUrl",
        "externalPath",
        "PositionUrl",
        "position_url",
    )
    identifier = value(
        row,
        "id",
        "Id",
        "jobId",
        "JobId",
        "jobID",
        "requisitionId",
        "requisitionNumber",
    )
    if not title or (not raw_url and not identifier):
        return None
    location_value = (
        row.get("location")
        or row.get("Location")
        or row.get("locations")
        or row.get("Locations")
        or row.get("jobLocation")
        or row.get("JobLocation")
        or row.get("primaryLocation")
        or row.get("LocationName")
    )
    description = value(
        row,
        "description",
        "Description",
        "jobDescription",
        "summary",
        "content",
    )
    if raw_url:
        resolved_url = urljoin(base_url, raw_url)
    elif identifier and (urlsplit(base_url).hostname or "").lower() == "recruiting.paylocity.com":
        resolved_url = urljoin(base_url, f"/Recruiting/Jobs/Details/{identifier}")
    else:
        resolved_url = base_url
    return {
        "title": title,
        "location": nested_location(location_value),
        "description": description,
        "url": resolved_url,
        "id": identifier,
    }


def job_rows_from_payload(payload: Any, base_url: str) -> list[dict[str, Any]]:
    """Recursively collect job records from public embedded or feed JSON."""
    rows: list[dict[str, Any]] = []
    stack = [payload]
    seen_objects: set[int] = set()
    while stack:
        item = stack.pop()
        if isinstance(item, list):
            stack.extend(item)
            continue
        if not isinstance(item, dict) or id(item) in seen_objects:
            continue
        seen_objects.add(id(item))
        normalized = generic_job_row(item, base_url)
        if normalized and TARGET_TITLE.search(normalized["title"]):
            rows.append(normalized)
        stack.extend(value for value in item.values() if isinstance(value, (dict, list)))
    deduplicated = {
        clean(row.get("url")) or f"{clean(row.get('title')).casefold()}::{clean(row.get('id'))}": row
        for row in rows
    }
    return list(deduplicated.values())


def parse_embedded_jobs(body: str, base_url: str) -> list[dict[str, Any]]:
    """Read public JSON state embedded by client-rendered enterprise ATS pages."""
    rows: list[dict[str, Any]] = []
    decoder = json.JSONDecoder()
    scripts = re.findall(r"<script\b[^>]*>(.*?)</script>", body, re.I | re.S)
    for script in scripts:
        candidate = unescape(script).strip()
        starts = [index for index in (candidate.find("{"), candidate.find("[")) if index >= 0]
        if not starts:
            continue
        try:
            payload, _ = decoder.raw_decode(candidate[min(starts):])
        except (json.JSONDecodeError, TypeError):
            continue
        rows.extend(job_rows_from_payload(payload, base_url))
    deduplicated = {
        clean(row.get("url")) or f"{clean(row.get('title')).casefold()}::{clean(row.get('id'))}": row
        for row in rows
    }
    return list(deduplicated.values())


def parse_enterprise_html(body: str, base_url: str) -> list[dict[str, Any]]:
    """Extract public jobs from enterprise ATS HTML without browser automation."""
    if not body:
        return []
    _, links, postings = parse_html(body, base_url)
    rows = job_rows_from_payload(postings, base_url)
    rows.extend(parse_embedded_jobs(body, base_url))
    for url, anchor in links:
        if not TARGET_TITLE.search(anchor) or EXCLUDED_TITLE.search(anchor):
            continue
        if not JOB_LINK.search(url):
            continue
        rows.append({"title": anchor, "url": url, "location": "", "description": ""})
    deduplicated = {
        clean(row.get("url")) or f"{clean(row.get('title')).casefold()}::{clean(row.get('id'))}": row
        for row in rows
    }
    return list(deduplicated.values())


def enterprise_board_url(ats_type: str, tenant: str, portal_url: str) -> str:
    """Return a stable public listing page when the input points at one job."""
    parsed = urlsplit(portal_url)
    origin = f"{parsed.scheme or 'https'}://{parsed.netloc}"
    first_tenant = tenant.split("|", 1)[0].split("/", 1)[0]
    if ats_type == "icims":
        return f"{origin}/jobs/search?ss=1"
    if ats_type == "jobvite" and first_tenant:
        return f"https://jobs.jobvite.com/{first_tenant}/jobs"
    if ats_type == "jazzhr" and first_tenant:
        return f"https://{first_tenant}.applytojob.com/apply/jobs/"
    if ats_type == "gem" and first_tenant:
        return f"https://jobs.gem.com/{first_tenant}"
    return portal_url


def api_jobs(ats_type: str, tenant: str, portal_url: str) -> tuple[list[dict[str, Any]], str]:
    tenant_parts = tenant.split("/")
    endpoint = ""
    parser = ""
    if ats_type == "greenhouse" and tenant:
        endpoint = f"https://boards-api.greenhouse.io/v1/boards/{tenant_parts[0]}/jobs?content=true"
        parser = "greenhouse"
    elif ats_type == "lever" and tenant:
        endpoint = f"https://api.lever.co/v0/postings/{tenant_parts[0]}?mode=json"
        parser = "lever"
    elif ats_type == "ashby" and tenant:
        endpoint = f"https://api.ashbyhq.com/posting-api/job-board/{tenant_parts[0]}"
        parser = "ashby"
    elif ats_type == "smartrecruiters" and tenant:
        endpoint = f"https://api.smartrecruiters.com/v1/companies/{tenant_parts[0]}/postings?limit=100"
        parser = "smartrecruiters"
    elif ats_type == "recruitee" and tenant:
        endpoint = f"https://{tenant_parts[0]}.recruitee.com/api/offers"
        parser = "recruitee"
    elif ats_type == "workable" and tenant:
        endpoint = f"https://apply.workable.com/{tenant_parts[0]}/jobs.md"
        parser = "workable_markdown"
    elif ats_type == "bamboohr" and tenant:
        endpoint = f"https://{tenant_parts[0]}.bamboohr.com/careers/list"
        parser = "bamboohr"
    elif ats_type == "breezy" and tenant:
        endpoint = f"https://{tenant_parts[0]}.breezy.hr/json"
        parser = "breezy"
    elif ats_type == "pinpoint":
        endpoint = f"https://{urlsplit(portal_url).hostname}/postings.json"
        parser = "pinpoint"
    elif ats_type == "rippling" and tenant:
        endpoint = f"https://api.rippling.com/platform/api/ats/v1/board/{tenant_parts[0]}/jobs"
        parser = "rippling"
    elif ats_type == "paylocity" and tenant.startswith("feed|"):
        feed_key = tenant.split("|", 1)[1]
        endpoint = f"https://recruiting.paylocity.com/recruiting/v2/api/feed/jobs/{feed_key}"
        parser = "enterprise_json"
    elif ats_type == "paylocity":
        endpoint = portal_url
        parser = "enterprise_html"
    elif ats_type == "comeet" and "|" in tenant:
        company_id, token = tenant.split("|", 1)
        endpoint = (
            f"https://www.comeet.co/careers-api/2.0/company/{quote_plus(company_id)}"
            f"/positions/?token={quote_plus(token)}&details=true"
        )
        parser = "enterprise_json"
    elif ats_type == "gem" and tenant:
        endpoint = "https://jobs.gem.com/api/public/graphql"
        parser = "gem_graphql"
    elif ats_type in {
        "icims",
        "jobvite",
        "taleo",
        "successfactors",
        "dayforce",
        "ukg",
        "adp",
        "jazzhr",
        "comeet",
    }:
        endpoint = enterprise_board_url(ats_type, tenant, portal_url)
        parser = "enterprise_html"
    elif ats_type == "personio":
        endpoint = f"https://{urlsplit(portal_url).hostname}/xml"
        parser = "personio_xml"
    elif ats_type == "teamtailor":
        endpoint = f"https://{urlsplit(portal_url).hostname}/jobs.rss"
        parser = "teamtailor_xml"
    elif ats_type == "jibeapply":
        endpoint = f"https://{urlsplit(portal_url).hostname}/api/jobs"
        parser = "jibeapply"
    elif ats_type == "oraclecloud" and len(tenant_parts) >= 2:
        host_name = f"{tenant_parts[0]}.oraclecloud.com"
        site_number = tenant_parts[1]
        endpoint = oracle_api_url(host_name, site_number, 0)
        parser = "oraclecloud"
    elif ats_type == "workday" and len(tenant_parts) >= 2:
        host_name, site = tenant_parts[0], tenant_parts[1]
        tenant_name = host_name.split(".", 1)[0]
        endpoint = f"https://{host_name}/wday/cxs/{tenant_name}/{site}/jobs"
        parser = "workday"
    if not endpoint:
        return [], ""

    request_body = None
    if parser == "gem_graphql":
        query = """
        query JobBoardList($boardId: String!) {
          oatsExternalJobPostings(boardId: $boardId) {
            jobPostings {
              id
              extId
              title
              locations { name city isoCountry isRemote }
              job { employmentType }
            }
          }
        }
        """
        request_body = json.dumps(
            {
                "operationName": "JobBoardList",
                "variables": {"boardId": tenant_parts[0]},
                "query": query,
            }
        ).encode("utf-8")
    if parser == "workday":
        request_body = json.dumps(
            {"appliedFacets": {}, "limit": 20, "offset": 0, "searchText": ""}
        ).encode("utf-8")
    result = fetch(endpoint, request_body=request_body)
    if parser == "enterprise_html":
        return parse_enterprise_html(result.body, result.url or endpoint), endpoint
    if parser == "workable_markdown":
        return parse_workable_markdown(result.body, tenant_parts[0]), endpoint
    if parser == "personio_xml":
        return parse_personio_xml(result.body, portal_url), endpoint
    if parser == "teamtailor_xml":
        return parse_teamtailor_xml(result.body), endpoint
    payload = json_payload(result)
    if payload is None:
        return [], endpoint
    if parser == "enterprise_json":
        return job_rows_from_payload(payload, endpoint), endpoint
    if parser == "gem_graphql":
        data = payload.get("data", {}) if isinstance(payload, dict) else {}
        container = data.get("oatsExternalJobPostings", {}) if isinstance(data, dict) else {}
        rows = container.get("jobPostings", []) if isinstance(container, dict) else []
        for row in rows if isinstance(rows, list) else []:
            if not isinstance(row, dict):
                continue
            identifier = clean(row.get("id") or row.get("extId"))
            row["location"] = row.get("locations")
            row["url"] = (
                f"https://jobs.gem.com/{tenant_parts[0]}?job_id={quote_plus(identifier)}"
                if identifier
                else f"https://jobs.gem.com/{tenant_parts[0]}"
            )
        return [row for row in rows if isinstance(row, dict)], endpoint
    if parser == "workday":
        rows: list[dict[str, Any]] = []
        page_size = 20
        search_terms = (
            "biostatistician",
            "statistical scientist",
            "data scientist",
            "quantitative researcher",
            "health economics",
        )
        for search_text in search_terms:
            for page in range(3):
                page_body = json.dumps(
                    {
                        "appliedFacets": {},
                        "limit": page_size,
                        "offset": page * page_size,
                        "searchText": search_text,
                    }
                ).encode("utf-8")
                page_payload = json_payload(fetch(endpoint, request_body=page_body))
                page_rows = page_payload.get("jobPostings", []) if isinstance(page_payload, dict) else []
                page_rows = [row for row in page_rows if isinstance(row, dict)]
                rows.extend(page_rows)
                if len(page_rows) < page_size:
                    break
        deduplicated = {
            value(row, "externalPath", "jobReqId", "title"): row
            for row in rows
            if value(row, "externalPath", "jobReqId", "title")
        }
        return list(deduplicated.values()), endpoint
    if parser == "oraclecloud":
        host_name = f"{tenant_parts[0]}.oraclecloud.com"
        site_number = tenant_parts[1]
        rows: list[dict[str, Any]] = []
        for page in range(25):
            page_payload = json_payload(fetch(oracle_api_url(host_name, site_number, page * 200)))
            item = page_payload.get("items", [None])[0] if isinstance(page_payload, dict) else None
            page_rows = item.get("requisitionList", []) if isinstance(item, dict) else []
            page_rows = [row for row in page_rows if isinstance(row, dict)]
            for row in page_rows:
                job_id = clean(row.get("Id") or row.get("RequisitionNumber"))
                row["title"] = row.get("Title")
                row["location"] = row.get("PrimaryLocation")
                row["description"] = row.get("ShortDescriptionStr")
                row["url"] = clean(row.get("ExternalURL")) or (
                    f"https://{host_name}/hcmUI/CandidateExperience/en/sites/{site_number}/job/{job_id}"
                    if job_id else ""
                )
            rows.extend(page_rows)
            if len(page_rows) < 200:
                break
        return rows, endpoint
    if parser == "greenhouse":
        rows = payload.get("jobs", []) if isinstance(payload, dict) else []
    elif parser == "lever":
        rows = payload if isinstance(payload, list) else []
    elif parser == "ashby":
        rows = payload.get("jobs", []) if isinstance(payload, dict) else []
    elif parser == "smartrecruiters":
        rows = payload.get("content", []) if isinstance(payload, dict) else []
    elif parser == "recruitee":
        rows = payload.get("offers", []) if isinstance(payload, dict) else []
    elif parser == "workable":
        rows = payload.get("results", payload.get("jobs", [])) if isinstance(payload, dict) else []
    elif parser == "bamboohr":
        rows = payload.get("result", []) if isinstance(payload, dict) else []
        origin = f"https://{tenant_parts[0]}.bamboohr.com"
        for row in rows:
            if isinstance(row, dict):
                row["title"] = row.get("jobOpeningName")
                row["url"] = f"{origin}/careers/{row.get('id', '')}"
    elif parser == "breezy":
        rows = payload if isinstance(payload, list) else payload.get("positions", []) if isinstance(payload, dict) else []
    elif parser == "pinpoint":
        rows = payload.get("data", []) if isinstance(payload, dict) else []
    elif parser == "rippling":
        rows = payload if isinstance(payload, list) else []
        for row in rows:
            if isinstance(row, dict):
                row["title"] = row.get("name")
    elif parser == "jibeapply":
        rows = payload.get("jobs", payload.get("data", [])) if isinstance(payload, dict) else []
    else:
        rows = []
    return [row for row in rows if isinstance(row, dict)], endpoint


def parse_workable_markdown(body: str, tenant: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    # Workable publishes one Markdown link per job in its public jobs.md feed.
    for match in re.finditer(r"\[([^\]]+)\]\((https?://[^)]+|/[^)]+)\)", body):
        title, url = clean(match.group(1)), clean(match.group(2))
        if not TARGET_TITLE.search(title):
            continue
        rows.append({"title": title, "url": urljoin(f"https://apply.workable.com/{tenant}/", url)})
    return rows


def oracle_api_url(host_name: str, site_number: str, offset: int) -> str:
    facets = (
        "LOCATIONS%3BWORK_LOCATIONS%3BWORKPLACE_TYPES%3BTITLES%3BCATEGORIES"
        "%3BORGANIZATIONS%3BPOSTING_DATES%3BFLEX_FIELDS"
    )
    finder = (
        f"findReqs;siteNumber={site_number},facetsList={facets},limit=200,"
        f"sortBy=POSTING_DATES_DESC,offset={offset}"
    )
    expand = "requisitionList.workLocation%2CrequisitionList.secondaryLocations"
    return (
        f"https://{host_name}/hcmRestApi/resources/latest/recruitingCEJobRequisitions"
        f"?onlyData=true&expand={expand}&finder={finder}&limit=200&offset={offset}"
    )


def parse_personio_xml(body: str, portal_url: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    try:
        root = ElementTree.fromstring(body)
    except ElementTree.ParseError:
        return rows
    hostname = urlsplit(portal_url).hostname or ""
    for position in root.findall(".//position"):
        title = clean(position.findtext("name"))
        job_id = clean(position.findtext("id"))
        offices = [clean(node.text) for node in position.findall(".//office") if clean(node.text)]
        if title and job_id:
            rows.append(
                {
                    "title": title,
                    "id": job_id,
                    "url": f"https://{hostname}/job/{job_id}",
                    "location": ", ".join(dict.fromkeys(offices)),
                }
            )
    return rows


def parse_teamtailor_xml(body: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    try:
        root = ElementTree.fromstring(body)
    except ElementTree.ParseError:
        return rows
    for item in root.findall(".//item"):
        title = clean(item.findtext("title"))
        url = clean(item.findtext("link"))
        location = clean(item.findtext("{*}city")) or clean(item.findtext("{*}country"))
        if title and url:
            rows.append({"title": title, "url": url, "location": location})
    return rows


def value(row: dict[str, Any], *keys: str) -> str:
    for key in keys:
        current: Any = row
        for part in key.split("."):
            current = current.get(part) if isinstance(current, dict) else None
        if current not in (None, "", []):
            return clean(current)
    return ""


def normalize_api_job(
    company: str,
    region: str,
    ats_type: str,
    row: dict[str, Any],
    scanned_at: str,
    portal_url: str = "",
) -> dict[str, Any] | None:
    title = value(row, "title", "name", "jobTitle")
    location = nested_location(
        row.get("location")
        or row.get("locations")
        or row.get("jobLocation")
        or row.get("primaryLocation")
    ) or value(
        row,
        "location.name",
        "location.city",
        "primaryLocation",
        "locationsText",
    )
    url = value(row, "absolute_url", "hostedUrl", "jobUrl", "careersPageUrl", "url", "externalPath")
    description = value(row, "content", "description", "jobAd.sections.jobDescription.text")
    if not title or not TARGET_TITLE.search(title) or EXCLUDED_TITLE.search(title):
        return None
    if not location_matches_region(location, region):
        return None
    if url.startswith("/") and ats_type == "workday" and portal_url:
        portal_parts = urlsplit(portal_url)
        site_parts = [part for part in portal_parts.path.split("/") if part]
        site = site_parts[0] if site_parts else ""
        url = f"{portal_parts.scheme}://{portal_parts.netloc}/{site}{url}"
    elif url.startswith("/"):
        url = urljoin(portal_url, url) if portal_url else ""
    identity = url or f"{company.casefold()}::{title.casefold()}::{location.casefold()}"
    return {
        "job_key": hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24],
        "company": company,
        "title": title,
        "location": location or ("中国" if region == "中国" else "Location not listed"),
        "region": region,
        "track": infer_track(title),
        "score": score_job(title, description),
        "visa": "不适用" if region == "中国" else "JD 未明确",
        "evidence": f"{company} 官方招聘门户通过 {ats_type} 适配器发现并读取。",
        "skills": extract_skills(description),
        "job_url": url,
        "canonical_url": url,
        "application_id": value(row, "id", "jobId", "shortcode", "jobReqId"),
        "source": f"Company portal · {ats_type}",
        "discovered_at": scanned_at,
        "checked_at": scanned_at,
        "status": "开放",
        "full_description": clean(re.sub(r"<[^>]+>", " ", description))[:120_000],
    }


def normalize_posting(
    company: str,
    region: str,
    posting: dict[str, Any],
    page_url: str,
    scanned_at: str,
) -> dict[str, Any] | None:
    title = clean(posting.get("title"))
    if not title or not TARGET_TITLE.search(title) or EXCLUDED_TITLE.search(title):
        return None
    description = clean(re.sub(r"<[^>]+>", " ", str(posting.get("description") or "")))
    url = clean(posting.get("url")) or page_url
    location_obj = posting.get("jobLocation")
    locations = location_obj if isinstance(location_obj, list) else [location_obj]
    location_parts: list[str] = []
    for item in locations:
        if not isinstance(item, dict):
            continue
        address = item.get("address")
        if isinstance(address, dict):
            location_parts.extend(
                clean(address.get(key)) for key in ("addressLocality", "addressRegion", "addressCountry")
                if clean(address.get(key))
            )
    resolved_location = ", ".join(dict.fromkeys(location_parts))
    if not location_matches_region(resolved_location, region):
        return None
    identity = url or f"{company.casefold()}::{title.casefold()}::{' '.join(location_parts).casefold()}"
    return {
        "job_key": hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24],
        "company": company,
        "title": title,
        "location": resolved_location or ("中国" if region == "中国" else "Location not listed"),
        "region": region,
        "track": infer_track(title),
        "score": score_job(title, description),
        "visa": "不适用" if region == "中国" else "JD 未明确",
        "evidence": f"{company} 官方招聘页面的 schema.org JobPosting 结构化数据。",
        "skills": extract_skills(description),
        "job_url": url,
        "canonical_url": url,
        "application_id": clean(
            posting.get("identifier", {}).get("value")
            if isinstance(posting.get("identifier"), dict)
            else posting.get("identifier")
        ),
        "source": "Company portal · schema.org",
        "discovered_at": scanned_at,
        "checked_at": scanned_at,
        "status": "开放",
        "full_description": description[:120_000],
    }


def infer_track(title: str) -> str:
    if re.search(r"quant|量化", title, re.I):
        return "Quant"
    if re.search(r"consult|咨询", title, re.I):
        return "Consulting"
    if re.search(r"biostat|clinical statistic|epidemiol|health econom|outcomes|生物统计|流行病|卫生经济", title, re.I):
        return "Pharma"
    return "Technology"


def location_matches_region(location: str, region: str) -> bool:
    if not clean(location):
        return True
    if region == "中国":
        return bool(CHINA_LOCATION.search(location))
    if region == "美国":
        if NON_US_LOCATION.search(location) and not re.search(r"\bunited states\b|\busa\b|\bu\.s\.\b", location, re.I):
            return False
        return bool(US_LOCATION.search(location))
    return True


def score_job(title: str, description: str) -> int:
    combined = f"{title} {description}"
    score = 58
    if re.search(r"ph\.?d|doctorate|doctoral|博士", combined, re.I):
        score += 10
    if re.search(r"biostat|clinical trial|causal inference|survival|longitudinal|生物统计|临床试验|因果", combined, re.I):
        score += 12
    if re.search(r"\bR\b|Python|SAS|SQL", combined):
        score += 6
    return min(score, 90)


def extract_skills(text: str) -> list[str]:
    patterns = (
        ("R", r"(?:^|\W)R(?:\W|$)"),
        ("Python", r"\bPython\b"),
        ("SAS", r"\bSAS\b"),
        ("SQL", r"\bSQL\b"),
        ("Clinical trials", r"clinical trial|临床试验"),
        ("Causal inference", r"causal inference|因果推断"),
        ("Machine learning", r"machine learning|机器学习"),
        ("Real-world evidence", r"real.world evidence|真实世界"),
    )
    return [name for name, pattern in patterns if re.search(pattern, text, re.I)][:8]


def scan_company(row: dict[str, Any], scanned_at: str, max_pages: int) -> tuple[CompanyReceipt, list[dict[str, Any]]]:
    company = clean(row.get("company"))
    region = clean(row.get("region")) or "美国"
    homepage = clean(row.get("source"))
    receipt = CompanyReceipt(company, region, homepage, checked_at=scanned_at)
    if not homepage.startswith(("http://", "https://")):
        homepage, discovery_error = discover_homepage(company)
        receipt.career_homepage = homepage
        if not homepage:
            receipt.state = "unidentified"
            receipt.error = discovery_error
            return receipt, []

    # Prefer the ATS API discovered from an upstream job URL. The sample posting may
    # have closed, while the company board and its public API remain valid.
    seed_ats, seed_tenant, seed_portal = detect_ats([homepage])
    if seed_ats != "generic":
        api_rows, api_url = api_jobs(seed_ats, seed_tenant, seed_portal)
        if api_rows:
            receipt.ats_type = seed_ats
            receipt.ats_tenant = seed_tenant
            receipt.final_url = seed_portal
            receipt.http_status = 200
            receipt.jobs_scanned = len(api_rows)
            jobs = [
                job
                for api_row in api_rows
                if (job := normalize_api_job(
                    company, region, seed_ats, api_row, scanned_at, seed_portal
                ))
            ]
            for job in jobs:
                if not job["job_url"] and api_url:
                    job["job_url"] = seed_portal
                    job["canonical_url"] = seed_portal
            deduplicated = {
                clean(job.get("canonical_url")) or clean(job.get("job_key")): job
                for job in jobs
                if clean(job.get("canonical_url")) or clean(job.get("job_key"))
            }
            receipt.jobs_matched = len(deduplicated)
            receipt.state = "success"
            return receipt, list(deduplicated.values())

    first = fetch(homepage)
    receipt.attempts = first.attempts
    if first.status in {404, 410} and re.search(r"(?:gh_jid=|/jobs?/|/job-board/)", homepage, re.I):
        # Aggregator samples can point at a job that closed after the dataset was built.
        # Retry the stable board parent so the company remains discoverable.
        parsed_homepage = urlsplit(homepage)
        parent_path = re.sub(r"/(?:\d{5,}|[^/]*_[A-Z0-9-]{5,})/?$", "/", parsed_homepage.path)
        parent_url = f"{parsed_homepage.scheme}://{parsed_homepage.netloc}{parent_path}"
        parent = fetch(parent_url, retries=1)
        receipt.attempts += parent.attempts
        if parent.status == 200 and parent.body:
            first = parent
    receipt.http_status = first.status
    receipt.final_url = first.url
    if first.status != 200 or not first.body:
        receipt.error = first.error or f"HTTP {first.status or 'connection failed'}"
        return receipt, []

    text, links, postings = parse_html(first.body, first.url)
    # If a company homepage was supplied, follow one obvious careers link before scanning.
    embedded_urls = extract_embedded_urls(first.body)
    ats_on_first, _, _ = detect_ats(
        [first.url] + [url for url, _ in links] + embedded_urls
    )
    career_links = [
        url for url, anchor in links
        if JOB_LINK.search(f"{url} {anchor}") and plausible_company_portal(url, company)
    ]
    if ats_on_first == "generic" and not postings and career_links:
        career_page = fetch(career_links[0], retries=1)
        receipt.attempts += career_page.attempts
        if career_page.status == 200 and career_page.body:
            first = career_page
            receipt.final_url = career_page.url
            receipt.http_status = career_page.status
            text, links, postings = parse_html(first.body, first.url)
    elif ats_on_first == "generic" and not postings and not career_links:
        archived_career_url = common_crawl_career_url(first.url)
        if archived_career_url:
            archived_page = fetch(archived_career_url, retries=1)
            receipt.attempts += archived_page.attempts
            if archived_page.status == 200 and archived_page.body:
                first = archived_page
                receipt.final_url = archived_page.url
                receipt.http_status = archived_page.status
                text, links, postings = parse_html(first.body, first.url)
    candidate_urls = [first.url] + [url for url, _ in links] + extract_embedded_urls(first.body)
    ats_type, tenant, portal_url = detect_ats(candidate_urls)
    receipt.ats_type = ats_type
    receipt.ats_tenant = tenant

    jobs: list[dict[str, Any]] = []
    api_rows, api_url = api_jobs(ats_type, tenant, portal_url)
    receipt.jobs_scanned += len(api_rows)
    for api_row in api_rows:
        job = normalize_api_job(company, region, ats_type, api_row, scanned_at, portal_url)
        if job:
            if not job["job_url"] and api_url:
                job["job_url"] = portal_url
                job["canonical_url"] = portal_url
            jobs.append(job)

    receipt.jobs_scanned += len(postings)
    for posting in postings:
        job = normalize_posting(company, region, posting, first.url, scanned_at)
        if job:
            jobs.append(job)

    # Generic career sites often expose job detail links without an API.
    likely_links: list[tuple[str, str]] = []
    if not api_rows:
        likely_links = [
            (url, anchor)
            for url, anchor in links
            if JOB_LINK.search(f"{url} {anchor}") and (TARGET_TITLE.search(anchor) or "/job" in url.lower())
        ]
        seen: set[str] = set()
        for url, anchor in likely_links[:max_pages]:
            normalized = url.split("#", 1)[0]
            if normalized in seen:
                continue
            seen.add(normalized)
            detail = fetch(normalized, retries=1)
            receipt.attempts += detail.attempts
            if detail.status != 200 or not detail.body:
                continue
            detail_text, _, detail_postings = parse_html(detail.body, detail.url)
            receipt.jobs_scanned += max(1, len(detail_postings))
            if detail_postings:
                for posting in detail_postings:
                    job = normalize_posting(company, region, posting, detail.url, scanned_at)
                    if job:
                        jobs.append(job)
            elif TARGET_TITLE.search(anchor or detail_text[:3000]) and not any(
                signal in detail_text.casefold() for signal in CLOSED_SIGNALS
            ):
                title = anchor if TARGET_TITLE.search(anchor) else clean(detail_text[:180])
                pseudo = {"title": title, "description": detail_text, "url": detail.url}
                job = normalize_posting(company, region, pseudo, detail.url, scanned_at)
                if job:
                    jobs.append(job)

    deduplicated = {
        clean(job.get("canonical_url")) or clean(job.get("job_key")): job
        for job in jobs
        if clean(job.get("canonical_url")) or clean(job.get("job_key"))
    }
    receipt.jobs_matched = len(deduplicated)
    receipt.state = "success"
    if ats_type == "generic" and not postings and not likely_links:
        receipt.state = "unidentified"
        receipt.error = "Career page loaded, but no ATS or job listing structure was identified."
    return receipt, list(deduplicated.values())


def run(
    pool_path: Path,
    aggregator_registry_path: Path,
    workers: int,
    max_pages: int,
    company_limit: int,
    previous_registry_path: Path | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any], list[dict[str, Any]]]:
    scanned_at = datetime.now(timezone.utc).isoformat()
    companies = company_rows(pool_path)
    discovered_portals = aggregator_portals(aggregator_registry_path)
    prior_portals = previous_portals(previous_registry_path) if previous_registry_path else {}
    for row in companies:
        company = clean(row.get("company"))
        aggregator_url = next(
            (discovered_portals[key] for key in company_match_keys(company) if key in discovered_portals),
            "",
        )
        prior_url = next(
            (prior_portals[key] for key in company_match_keys(company) if key in prior_portals),
            "",
        )
        verified_url = verified_company_portal(company)
        current_source = clean(row.get("source"))
        # A structured upstream ATS URL is stronger evidence than a generic corporate homepage.
        if aggregator_url and detect_ats([aggregator_url])[0] != "generic":
            row["source"] = aggregator_url
        elif verified_url:
            row["source"] = verified_url
        elif not current_source and aggregator_url:
            row["source"] = aggregator_url
        elif not current_source and prior_url:
            row["source"] = prior_url
    if company_limit > 0:
        companies = companies[:company_limit]
    receipts: list[CompanyReceipt] = []
    jobs: list[dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        futures = {
            executor.submit(scan_company, row, scanned_at, max_pages): clean(row.get("company"))
            for row in companies
        }
        for future in as_completed(futures):
            company = futures[future]
            try:
                receipt, matched = future.result()
            except Exception as error:
                receipt = CompanyReceipt(company, "", "", error=str(error)[:300], checked_at=scanned_at)
                matched = []
            receipts.append(receipt)
            jobs.extend(matched)

    deduplicated = {
        clean(job.get("canonical_url")) or clean(job.get("job_key")): job
        for job in jobs
        if clean(job.get("canonical_url")) or clean(job.get("job_key"))
    }
    registry = sorted((asdict(receipt) for receipt in receipts), key=lambda item: (item["region"], item["company"]))
    counts = {
        state: sum(1 for receipt in receipts if receipt.state == state)
        for state in ("success", "failed", "unidentified")
    }
    summary = {
        "generated_at": scanned_at,
        "companies_in_pool": len(company_rows(pool_path)),
        "companies_attempted": len(receipts),
        "companies_succeeded": counts["success"],
        "companies_failed": counts["failed"],
        "companies_unidentified": counts["unidentified"],
        "jobs_scanned": sum(receipt.jobs_scanned for receipt in receipts),
        "jobs_matched": len(deduplicated),
        "ats_counts": {
            name: sum(1 for receipt in receipts if receipt.ats_type == name)
            for name in sorted({receipt.ats_type for receipt in receipts})
        },
        "failure_companies": [
            {"company": receipt.company, "url": receipt.career_homepage, "error": receipt.error}
            for receipt in receipts
            if receipt.state != "success"
        ],
    }
    return sorted(deduplicated.values(), key=lambda item: (-int(item["score"]), clean(item["company"]))), summary, registry


def main() -> None:
    parser = argparse.ArgumentParser(description="Scan every unique company-pool career portal.")
    parser.add_argument("--pool", type=Path, default=Path("app/company-pool.json"))
    parser.add_argument("--output-dir", type=Path, default=Path("data/scans"))
    parser.add_argument(
        "--aggregator-registry",
        type=Path,
        default=Path("data/scans/aggregator_company_registry.json"),
    )
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--max-pages", type=int, default=8)
    parser.add_argument("--company-limit", type=int, default=0)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    jobs, summary, registry = run(
        args.pool,
        args.aggregator_registry,
        args.workers,
        args.max_pages,
        args.company_limit,
        args.output_dir / "company_portal_registry.json",
    )
    outputs = {
        "company_portal_jobs_latest.json": jobs,
        "company_portal_summary.json": summary,
        "company_portal_registry.json": registry,
    }
    for filename, payload in outputs.items():
        (args.output_dir / filename).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    print(
        f"Attempted {summary['companies_attempted']} company portals; "
        f"{summary['companies_succeeded']} succeeded and {len(jobs)} targeted jobs matched."
    )


if __name__ == "__main__":
    main()
