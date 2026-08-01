#!/usr/bin/env python3
"""Collect BOSS job data from rendered pages without calling private web APIs."""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

import websocket


CITY_CODES = {
    "北京": "101010100",
    "上海": "101020100",
    "广州": "101280100",
    "深圳": "101280600",
    "杭州": "101210100",
    "南京": "101190100",
    "苏州": "101190400",
    "成都": "101270100",
}
BLOCK_MARKERS = (
    "环境存在异常",
    "访问频繁",
    "操作太频繁",
    "安全验证",
    "请完成验证",
    "验证码",
)


class PageCollectionError(RuntimeError):
    """Raised when the rendered page cannot be safely collected."""


class CDPPage:
    """Minimal Chrome DevTools Protocol client for one visible page target."""

    def __init__(self, port: int = 9222) -> None:
        self.port = port
        self.message_id = 0
        targets = self._read_json(f"http://127.0.0.1:{port}/json")
        pages = [item for item in targets if item.get("type") == "page"]
        zhipin_pages = [item for item in pages if "zhipin.com" in item.get("url", "")]
        if not zhipin_pages:
            encoded_url = urllib.parse.quote("https://www.zhipin.com", safe="")
            self._read_json(
                f"http://127.0.0.1:{port}/json/new?{encoded_url}",
                method="PUT",
            )
            time.sleep(1)
            targets = self._read_json(f"http://127.0.0.1:{port}/json")
            pages = [item for item in targets if item.get("type") == "page"]
            zhipin_pages = [item for item in pages if "zhipin.com" in item.get("url", "")]
        if not zhipin_pages:
            raise PageCollectionError("The dedicated Chrome could not open a BOSS page.")
        target = zhipin_pages[0]
        self.ws = websocket.create_connection(
            target["webSocketDebuggerUrl"],
            timeout=45,
            origin=f"http://127.0.0.1:{port}",
        )
        self.send("Page.enable")
        self.send("Runtime.enable")

    @staticmethod
    def _read_json(url: str, method: str = "GET") -> Any:
        try:
            request = urllib.request.Request(url, method=method)
            with urllib.request.urlopen(request, timeout=10) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as error:
            raise PageCollectionError(
                "Cannot connect to the dedicated Chrome on CDP port 9222."
            ) from error

    def send(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self.message_id += 1
        current_id = self.message_id
        self.ws.send(json.dumps({"id": current_id, "method": method, "params": params or {}}))
        deadline = time.time() + 45
        while time.time() < deadline:
            response = json.loads(self.ws.recv())
            if response.get("id") == current_id:
                if "error" in response:
                    raise PageCollectionError(str(response["error"]))
                return response
        raise PageCollectionError(f"Chrome did not respond to {method}.")

    def evaluate(self, expression: str) -> Any:
        response = self.send(
            "Runtime.evaluate",
            {"expression": expression, "returnByValue": True, "awaitPromise": True},
        )
        result = response.get("result", {}).get("result", {})
        if result.get("subtype") == "error":
            raise PageCollectionError(result.get("description", "Page JavaScript failed."))
        return result.get("value")

    def navigate(self, url: str) -> None:
        self.send("Page.navigate", {"url": url})

    def close(self) -> None:
        self.ws.close()


def page_snapshot(page: CDPPage) -> dict[str, str]:
    return page.evaluate(
        "({url: location.href, title: document.title, "
        "text: document.body ? document.body.innerText.slice(0, 12000) : ''})"
    ) or {}


def assert_page_is_usable(snapshot: dict[str, str]) -> None:
    url = snapshot.get("url", "")
    content = snapshot.get("text", "")
    if "zhipin.com" not in url:
        raise PageCollectionError("The connected tab is not a BOSS page.")
    marker = next((item for item in BLOCK_MARKERS if item in content), "")
    if marker:
        raise PageCollectionError(
            f"BOSS displayed '{marker}'. Complete the check manually and do not retry repeatedly."
        )
    if "/user/login" in url or "扫码登录" in content:
        raise PageCollectionError("The dedicated Chrome is not logged in to BOSS.")


def urls_match(actual_url: str, expected_url: str) -> bool:
    """Return whether Chrome has reached the requested BOSS page."""
    actual = urllib.parse.urlparse(actual_url)
    expected = urllib.parse.urlparse(expected_url)
    if actual.netloc != expected.netloc or actual.path.rstrip("/") != expected.path.rstrip("/"):
        return False
    actual_query = urllib.parse.parse_qs(actual.query)
    expected_query = urllib.parse.parse_qs(expected.query)
    return all(actual_query.get(key) == value for key, value in expected_query.items())


def wait_for_render(
    page: CDPPage,
    selector: str,
    timeout: int = 25,
    expected_url: str | None = None,
    allow_missing: bool = False,
) -> dict[str, str] | None:
    """Wait for the requested navigation and its new DOM, not a stale prior page."""
    deadline = time.time() + timeout
    last_snapshot: dict[str, str] = {}
    while time.time() < deadline:
        last_snapshot = page_snapshot(page)
        assert_page_is_usable(last_snapshot)
        if expected_url and not urls_match(last_snapshot.get("url", ""), expected_url):
            time.sleep(1)
            continue
        ready = page.evaluate(
            f"document.readyState === 'complete' && Boolean(document.querySelector({json.dumps(selector)}))"
        )
        if ready:
            return last_snapshot
        time.sleep(1)
    if allow_missing:
        return None
    raise PageCollectionError(
        f"The BOSS page did not render the expected content within {timeout} seconds."
    )


EXTRACT_CARDS_JS = r"""
(() => {
  const clean = (node) => node ? node.innerText.trim() : '';
  const links = Array.from(document.querySelectorAll('a[href*="/job_detail/"]'));
  const seen = new Set();
    return links.map((titleLink) => {
    const card = titleLink.closest(
      'li.job-card-wrapper, li.job-card-box, .job-card-wrapper, .job-card-box, [class*="job-card"]'
    ) || titleLink.closest('li') || titleLink.parentElement;
    const titleNode = card?.querySelector('.job-name, [class*="job-name"]') || titleLink;
    const companyNode = card?.querySelector(
      'h3.company-name a, .company-name a, .company-name, '
      + '.company-info h3 a, .company-info a[href*="/gongsi/"], [class*="company-name"]'
    );
    const locationNode = card?.querySelector(
      '.job-area, .company-location, [class*="job-area"], [class*="location"]'
    );
    const tagNodes = Array.from(card?.querySelectorAll('.tag-list li, .job-info li') || []);
    const rawHref = titleLink ? titleLink.getAttribute('href') || '' : '';
    const jobUrl = rawHref ? new URL(rawHref, location.origin).href : '';
    const match = jobUrl.match(/\/job_detail\/([^./?]+)\.html/);
    return {
      title: clean(titleNode),
      company: clean(companyNode),
      location: clean(locationNode),
      tags: tagNodes.map(clean).filter(Boolean),
      skills: tagNodes.map(clean).filter(Boolean),
      card_text: clean(card),
      job_id: match ? match[1] : jobUrl,
      job_link: jobUrl,
      salary_source: 'rendered_page'
    };
  }).filter((job) => {
    if (!job.title || !job.job_link || seen.has(job.job_link)) return false;
    seen.add(job.job_link);
    return true;
  });
})()
"""


PAGE_DIAGNOSTICS_JS = r"""
(() => ({
  url: location.href,
  title: document.title,
  ready_state: document.readyState,
  job_detail_links: document.querySelectorAll('a[href*="/job_detail/"]').length,
  job_card_wrappers: document.querySelectorAll('.job-card-wrapper').length,
  job_card_boxes: document.querySelectorAll('.job-card-box').length,
  search_results: document.querySelectorAll('.search-job-result').length
}))()
"""


EXTRACT_DETAIL_JS = r"""
(() => {
  const clean = (node) => node ? node.innerText.trim() : '';
  const selectors = [
    '.job-sec-text',
    '.job-detail-section .text',
    '.job-detail-body',
    '[class*="job-description"]'
  ];
  let jd = '';
  for (const selector of selectors) {
    const value = clean(document.querySelector(selector));
    if (value.length > jd.length) jd = value;
  }
  const company = clean(document.querySelector(
    '.sider-company .company-info a, .company-info .name, .company-name'
  ));
  const tags = Array.from(document.querySelectorAll(
    '.job-detail-section .job-tags span, .job-tags span, .job-tags li'
  )).map(clean).filter(Boolean);
  return {jd, description: jd, company, skill_tags: tags};
})()
"""


def search_url(keyword: str, city: str) -> str:
    code = CITY_CODES.get(city, city if city.isdigit() else "")
    if not code:
        raise PageCollectionError(f"Unsupported city for page mode: {city}")
    query = urllib.parse.urlencode({"query": keyword, "city": code})
    return f"https://www.zhipin.com/web/geek/job?{query}"


def prioritize_jobs(jobs: list[dict[str, Any]], keyword: str) -> list[dict[str, Any]]:
    """Put cards that visibly contain the requested keyword first."""
    needle = keyword.casefold().strip()
    if not needle:
        return jobs

    def relevance(job: dict[str, Any]) -> int:
        title = str(job.get("title", "")).casefold()
        card_text = str(job.get("card_text", "")).casefold()
        if needle in title:
            return 2
        if needle in card_text:
            return 1
        return 0

    return sorted(jobs, key=relevance, reverse=True)


def collect(keyword: str, city: str, max_details: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    page = CDPPage()
    try:
        requested_search_url = search_url(keyword, city)
        page.navigate(requested_search_url)
        wait_for_render(
            page,
            'a[href*="/job_detail/"], .search-job-result',
            expected_url=requested_search_url,
        )
        page.evaluate("window.scrollTo(0, Math.min(document.body.scrollHeight, 1400))")
        time.sleep(2)
        assert_page_is_usable(page_snapshot(page))
        jobs = prioritize_jobs(page.evaluate(EXTRACT_CARDS_JS) or [], keyword)
        if not jobs:
            diagnostics = page.evaluate(PAGE_DIAGNOSTICS_JS) or {}
            raise PageCollectionError(
                "The rendered search page contained no readable job cards. "
                f"Diagnostics: {json.dumps(diagnostics, ensure_ascii=False)}"
            )

        for job in jobs:
            job["source_keyword"] = keyword
            job["source_city"] = city
            job.pop("card_text", None)

        details: list[dict[str, Any]] = []
        for job in jobs:
            if len(details) >= max_details:
                break
            page.navigate(job["job_link"])
            rendered = wait_for_render(
                page,
                ".job-detail-box, .job-sec-text, .job-detail-section",
                expected_url=job["job_link"],
                allow_missing=True,
            )
            if rendered is None:
                print(
                    f"Skipped {job.get('title', 'a job')}: the detail page did not render.",
                    file=sys.stderr,
                )
                continue
            time.sleep(1)
            detail = page.evaluate(EXTRACT_DETAIL_JS) or {}
            if len(detail.get("jd", "")) < 40:
                print(
                    f"Skipped {job.get('title', 'a job')}: no readable job description.",
                    file=sys.stderr,
                )
                continue
            detail["job_id"] = job["job_id"]
            detail["job_link"] = job["job_link"]
            detail["company"] = detail.get("company") or job["company"]
            details.append(detail)
            time.sleep(2)
        return jobs, details
    finally:
        page.close()


def check() -> int:
    page = CDPPage()
    try:
        snapshot = page_snapshot(page)
        assert_page_is_usable(snapshot)
        print(f"OK    BOSS rendered page: {snapshot.get('title', 'open')}")
        return 0
    except PageCollectionError as error:
        print(f"FAIL  BOSS rendered page: {error}", file=sys.stderr)
        return 1
    finally:
        page.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--keyword")
    parser.add_argument("--city")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--detail-output", type=Path)
    parser.add_argument("--max-details", type=int, default=10)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.check:
        raise SystemExit(check())
    if not all((args.keyword, args.city, args.output, args.detail_output)):
        raise SystemExit("keyword, city, output, and detail-output are required")
    try:
        jobs, details = collect(args.keyword, args.city, max(1, min(args.max_details, 15)))
    except PageCollectionError as error:
        print(f"Collection stopped: {error}", file=sys.stderr)
        raise SystemExit(1) from error
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps({"keyword": args.keyword, "city": args.city, "jobs": jobs}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    args.detail_output.write_text(json.dumps(details, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Collected {len(jobs)} rendered job cards and {len(details)} full descriptions.")


if __name__ == "__main__":
    main()
