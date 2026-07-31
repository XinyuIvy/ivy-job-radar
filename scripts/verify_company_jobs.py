from __future__ import annotations

import argparse
import html
import json
import re
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus, unquote, urljoin, urlsplit
from urllib.request import Request, urlopen


AGGREGATOR_HOSTS = {
    "indeed.com",
    "linkedin.com",
    "glassdoor.com",
    "ziprecruiter.com",
    "talent.com",
    "google.com",
}
OFFICIAL_ATS_SUFFIXES = (
    "greenhouse.io",
    "lever.co",
    "ashbyhq.com",
    "myworkdayjobs.com",
    "workday.com",
    "smartrecruiters.com",
    "icims.com",
    "oraclecloud.com",
    "successfactors.com",
    "dayforcehcm.com",
    "ultipro.com",
)
CLOSED_SIGNALS = (
    "job is no longer available",
    "position is no longer available",
    "this job has expired",
    "job posting has expired",
    "position has been filled",
    "no longer accepting applications",
    "job not found",
)
SPONSORSHIP_BLOCK_PATTERNS = (
    r"(?:will not|does not|do not|unable to|not eligible to).{0,80}(?:sponsor|sponsorship)",
    r"(?:sponsorship|visa sponsorship).{0,80}(?:not available|not provided|unavailable)",
    r"must be (?:a )?u\.?s\.? citizen",
)
SPONSORSHIP_SUPPORT_PATTERNS = (
    r"(?:visa|h-?1b).{0,80}(?:sponsor|sponsorship)",
    r"sponsorship (?:is )?available",
    r"eligible for (?:employment|visa) sponsorship",
)


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.text: list[str] = []
        self.links: list[str] = []
        self.json_ld: list[str] = []
        self._script_type = ""
        self._script_data: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value or "" for key, value in attrs}
        if tag in {"style", "noscript"}:
            self._skip += 1
        if tag == "script":
            self._script_type = values.get("type", "").lower()
            self._script_data = []
        if tag == "a" and values.get("href"):
            self.links.append(values["href"])

    def handle_endtag(self, tag: str) -> None:
        if tag in {"style", "noscript"} and self._skip:
            self._skip -= 1
        if tag == "script":
            if "ld+json" in self._script_type and self._script_data:
                self.json_ld.append("".join(self._script_data))
            self._script_type = ""
            self._script_data = []

    def handle_data(self, data: str) -> None:
        if self._script_type:
            self._script_data.append(data)
        elif not self._skip:
            self.text.append(data)


def clean_text(value: object) -> str:
    return re.sub(r"\s+", " ", html.unescape(str(value or ""))).strip()


def host(url: str) -> str:
    return urlsplit(url).hostname.lower().removeprefix("www.") if urlsplit(url).hostname else ""


def is_aggregator(url: str) -> bool:
    current = host(url)
    return any(current == item or current.endswith("." + item) for item in AGGREGATOR_HOSTS)


def is_official_candidate(url: str, company: str) -> bool:
    current = host(url)
    if not current or is_aggregator(url):
        return False
    if any(current.endswith(suffix) for suffix in OFFICIAL_ATS_SUFFIXES):
        return True
    company_tokens = [
        token for token in re.findall(r"[a-z0-9]+", company.lower())
        if len(token) >= 4 and token not in {"health", "research", "hospital", "university"}
    ]
    return any(token in current.replace("-", "") for token in company_tokens)


def fetch_page(url: str, timeout: int = 25) -> tuple[int, str, str]:
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; IvyJobRadar/1.0; +job-verification)",
            "Accept": "text/html,application/xhtml+xml,application/json",
            "Accept-Language": "en-US,en;q=0.8",
        },
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read(3_000_000).decode(response.headers.get_content_charset() or "utf-8", "replace")
            return response.status, response.geturl(), body
    except HTTPError as exc:
        body = exc.read(200_000).decode("utf-8", "replace")
        return exc.code, exc.geturl(), body
    except (URLError, TimeoutError, ValueError):
        return 0, url, ""


def parse_page(body: str, base_url: str) -> tuple[str, list[str], list[dict[str, object]]]:
    parser = PageParser()
    parser.feed(body)
    text = clean_text(" ".join(parser.text))
    links = [urljoin(base_url, html.unescape(item)) for item in parser.links]
    postings: list[dict[str, object]] = []
    for raw in parser.json_ld:
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        items = payload if isinstance(payload, list) else payload.get("@graph", [payload]) if isinstance(payload, dict) else []
        for item in items:
            if isinstance(item, dict) and item.get("@type") == "JobPosting":
                postings.append(item)
    return text, links, postings


def title_overlap(expected: str, actual: str) -> bool:
    ignore = {"the", "and", "or", "of", "for", "a", "an", "i", "ii", "iii"}
    left = {token for token in re.findall(r"[a-z0-9]+", expected.lower()) if token not in ignore}
    right = {token for token in re.findall(r"[a-z0-9]+", actual.lower()) if token not in ignore}
    return bool(left) and len(left & right) / len(left) >= 0.55


def extract_job_posting(postings: list[dict[str, object]], expected_title: str) -> dict[str, object] | None:
    for posting in postings:
        if title_overlap(expected_title, clean_text(posting.get("title"))):
            return posting
    return postings[0] if len(postings) == 1 else None


def extract_search_links(body: str) -> list[str]:
    links: list[str] = []
    for match in re.finditer(r'href="([^"]+)"', body):
        url = html.unescape(match.group(1))
        redirect = re.search(r"[?&](?:uddg|url|q)=([^&]+)", url)
        if redirect:
            url = unquote(redirect.group(1))
        if url.startswith("http"):
            links.append(url)
    return links


def discover_official_url(job: dict[str, object]) -> str:
    original = clean_text(job.get("job_url"))
    if is_official_candidate(original, clean_text(job.get("company"))):
        return original

    status, final_url, body = fetch_page(original)
    if status == 200:
        _, links, _ = parse_page(body, final_url)
        for link in links:
            if is_official_candidate(link, clean_text(job.get("company"))):
                return link

    query = quote_plus(f'"{clean_text(job.get("title"))}" "{clean_text(job.get("company"))}" careers')
    for endpoint in (
        f"https://html.duckduckgo.com/html/?q={query}",
        f"https://www.bing.com/search?q={query}",
    ):
        search_status, _, search_body = fetch_page(endpoint)
        if search_status != 200:
            continue
        for link in extract_search_links(search_body):
            if is_official_candidate(link, clean_text(job.get("company"))):
                return link
        time.sleep(0.5)
    return ""


def infer_sponsorship(text: str) -> tuple[str, str]:
    for pattern in SPONSORSHIP_BLOCK_PATTERNS:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return "明确不支持", clean_text(match.group(0))
    for pattern in SPONSORSHIP_SUPPORT_PATTERNS:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return "可能支持", clean_text(match.group(0))
    return "JD 未明确", ""


def extract_application_id(url: str, text: str, posting: dict[str, object] | None) -> str:
    if posting:
        identifier = posting.get("identifier")
        if isinstance(identifier, dict) and clean_text(identifier.get("value")):
            return clean_text(identifier.get("value"))
        if isinstance(identifier, str) and identifier.strip():
            return identifier.strip()
    patterns = (
        r"[?&](?:jobId|job_id|jobReq|gh_jid)=([^&]+)",
        r"/jobs?/([A-Za-z]*\d[A-Za-z0-9_-]{2,})(?:/|\s|$)",
        r"\b(?:requisition|req(?:uisition)? id|job id)\s*[:#]?\s*([A-Z]{0,4}\d[A-Z0-9-]{2,})",
    )
    for pattern in patterns:
        match = re.search(pattern, f"{url} {text}", flags=re.IGNORECASE)
        if match:
            return clean_text(match.group(1))
    return ""


def verify_job(job: dict[str, object], checked_at: str) -> dict[str, object]:
    result = dict(job)
    result["original_job_url"] = clean_text(job.get("job_url"))
    official_url = discover_official_url(job)
    result.update(
        {
            "official_url": official_url,
            "verification_method": "company_site_or_official_ats",
            "verification_note": "",
            "full_description": "",
            "sponsorship_evidence": "",
            "checked_at": checked_at,
        }
    )
    if not official_url:
        result["status"] = "待官网核验"
        result["verification_note"] = "未自动定位到可审计的公司官网或官方 ATS 页面。"
        return result

    status_code, final_url, body = fetch_page(official_url)
    result["official_url"] = final_url
    if status_code in {404, 410}:
        result["status"] = "已关闭"
        result["verification_note"] = f"公司页面返回 HTTP {status_code}。"
        return result
    if status_code != 200 or not body:
        result["status"] = "待官网核验"
        result["verification_note"] = f"公司页面暂时无法自动读取（HTTP {status_code or '连接失败'}）。"
        return result

    page_text, _, postings = parse_page(body, final_url)
    posting = extract_job_posting(postings, clean_text(job.get("title")))
    description = clean_text(posting.get("description")) if posting else page_text
    page_title = clean_text(posting.get("title")) if posting else ""
    closed = any(signal in page_text.lower() for signal in CLOSED_SIGNALS)
    title_matches = title_overlap(clean_text(job.get("title")), page_title or page_text[:1500])

    result["full_description"] = description[:120_000]
    result["application_id"] = (
        extract_application_id(final_url, page_text, posting)
        or clean_text(job.get("application_id"))
    )
    visa, visa_evidence = infer_sponsorship(description or page_text)
    result["visa"] = visa
    result["sponsorship_evidence"] = visa_evidence
    result["canonical_url"] = final_url
    result["job_url"] = final_url
    result["source"] = f"官网核验 · {host(final_url)}"

    if closed:
        result["status"] = "已关闭"
        result["verification_note"] = "公司页面显示岗位已关闭或不再接受申请。"
    elif posting and title_matches and len(description) >= 300:
        result["status"] = "开放"
        result["verification_note"] = "已在公司官网或官方 ATS 找到完整且仍开放的具体 JD。"
    else:
        result["status"] = "待官网核验"
        result["verification_note"] = "已定位公司页面，但未取得足够证据确认具体 JD 仍开放。"

    evidence_parts = [
        result["verification_note"],
        f"官网：{final_url}",
        f"岗位编号：{result['application_id'] or '未提取'}",
        f"Sponsorship：{visa}",
    ]
    if visa_evidence:
        evidence_parts.append(f"原文证据：{visa_evidence}")
    result["evidence"] = "；".join(evidence_parts)
    return result


def write_outputs(records: list[dict[str, object]], output_dir: Path) -> None:
    verified_path = output_dir / "us_jobs_verified_latest.json"
    verified_path.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "received": len(records),
        "open_verified": sum(item.get("status") == "开放" for item in records),
        "closed": sum(item.get("status") == "已关闭" for item in records),
        "needs_manual_verification": sum(item.get("status") == "待官网核验" for item in records),
        "official_urls_found": sum(bool(item.get("official_url")) for item in records),
        "job_ids_found": sum(bool(item.get("application_id")) for item in records),
        "sponsorship_explicit": sum(item.get("visa") in {"可能支持", "明确不支持"} for item in records),
    }
    (output_dir / "us_verification_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify JobSpy candidates on company career sites.")
    parser.add_argument("--input", type=Path, default=Path("data/scans/us_jobs_latest.json"))
    parser.add_argument("--output-dir", type=Path, default=Path("data/scans"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    jobs = json.loads(args.input.read_text(encoding="utf-8"))
    checked_at = datetime.now(timezone.utc).isoformat()
    records = [verify_job(job, checked_at) for job in jobs]
    write_outputs(records, args.output_dir)
    counts = {
        status: sum(item["status"] == status for item in records)
        for status in ("开放", "已关闭", "待官网核验")
    }
    print(
        "Verification complete: "
        f"{counts['开放']} open, {counts['已关闭']} closed, "
        f"{counts['待官网核验']} require manual review."
    )


if __name__ == "__main__":
    main()
