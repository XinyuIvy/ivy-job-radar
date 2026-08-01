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
CITY_PATHS = {
    "北京": "beijing",
    "上海": "shanghai",
    "广州": "guangzhou",
    "深圳": "shenzhen",
    "杭州": "hangzhou",
    "南京": "nanjing",
    "苏州": "suzhou",
    "成都": "chengdu",
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
        self.target_id = ""
        self.ws = None
        self._connect(target)

    def _connect(self, target: dict[str, Any]) -> None:
        """Connect this client to a specific visible Chrome page target."""
        if self.ws is not None:
            self.ws.close()
        self.target_id = str(target.get("id", ""))
        self.ws = websocket.create_connection(
            target["webSocketDebuggerUrl"],
            timeout=45,
            origin=f"http://127.0.0.1:{self.port}",
        )
        self.send("Page.enable")
        self.send("Runtime.enable")

    def adopt_page_for_url(self, expected_url: str, timeout: int = 10) -> bool:
        """Switch to a newly opened tab when BOSS submits search with target=_blank."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            targets = self._read_json(f"http://127.0.0.1:{self.port}/json")
            target = find_matching_page_target(targets, expected_url)
            if target:
                if str(target.get("id", "")) != self.target_id:
                    self._connect(target)
                return True
            time.sleep(0.5)
        return False

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
        if self.ws is not None:
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


def find_matching_page_target(
    targets: list[dict[str, Any]], expected_url: str
) -> dict[str, Any] | None:
    """Find the Chrome page target that contains the requested search results."""
    return next(
        (
            target
            for target in targets
            if target.get("type") == "page"
            and urls_match(str(target.get("url", "")), expected_url)
        ),
        None,
    )


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
    diagnostics = page.evaluate(
        "({"
        "url: location.href, "
        "title: document.title, "
        "ready_state: document.readyState, "
        f"expected_selector_matches: document.querySelectorAll({json.dumps(selector)}).length, "
        "job_detail_links: document.querySelectorAll('a[href*=\"/job_detail/\"]').length, "
        "job_card_wrappers: document.querySelectorAll('.job-card-wrapper').length, "
        "job_card_boxes: document.querySelectorAll('.job-card-box').length, "
        "search_results: document.querySelectorAll('.search-job-result').length"
        "})"
    ) or {}
    diagnostics["expected_url_match"] = (
        urls_match(str(diagnostics.get("url", "")), expected_url)
        if expected_url
        else True
    )
    raise PageCollectionError(
        f"The BOSS page did not render the expected content within {timeout} seconds. "
        f"Diagnostics: {json.dumps(diagnostics, ensure_ascii=False)}"
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


def city_landing_url(city: str) -> str:
    """Return the public city page used by the normal BOSS search form."""
    path = CITY_PATHS.get(city, "")
    if not path:
        raise PageCollectionError(f"Unsupported city for page mode: {city}")
    return f"https://www.zhipin.com/{path}/"


def submit_visible_search(page: CDPPage, keyword: str) -> None:
    """Fill and submit BOSS's visible search form like a normal page interaction."""
    input_result = page.evaluate(
        """
(() => {
  const selectors = [
    'input[name="query"]',
    'input.ipt-search',
    '.search-form input',
    '.search-form-con input',
    'input[placeholder*="职位"]',
    'input[placeholder*="搜索"]'
  ];
  const visible = (node) => Boolean(
    node && (node.offsetWidth || node.offsetHeight || node.getClientRects().length)
  );
  const input = selectors.map((selector) => document.querySelector(selector)).find(visible);
  if (!input) {
    return {ok: false, input_count: document.querySelectorAll('input').length};
  }
  input.focus();
  input.select();
  return {ok: true, prior_value_length: input.value.length};
})()
        """
    ) or {}
    if not input_result.get("ok"):
        raise PageCollectionError(
            "The BOSS city page did not expose a visible search input. "
            f"Diagnostics: {json.dumps(input_result, ensure_ascii=False)}"
        )

    # Use Chrome's native text input path so the page framework receives the
    # same beforeinput/input events as it does during a manual search.
    page.send("Input.insertText", {"text": keyword})
    time.sleep(0.5)
    input_state = page.evaluate(
        """
(() => {
  const visible = (node) => Boolean(
    node && (node.offsetWidth || node.offsetHeight || node.getClientRects().length)
  );
  const input = [
    'input[name="query"]',
    'input.ipt-search',
    '.search-form input',
    '.search-form-con input',
    'input[placeholder*="职位"]',
    'input[placeholder*="搜索"]'
  ].map((selector) => document.querySelector(selector)).find(visible);
  if (!input || input.value !== KEYWORD) {
    return {
      ok: false,
      reason: 'keyword_not_committed',
      input_value: input ? input.value : '',
      active_tag: document.activeElement ? document.activeElement.tagName : ''
    };
  }
  return {
    ok: true,
    input_value: input.value,
    active_is_input: document.activeElement === input
  };
})()
        """.replace("KEYWORD", json.dumps(keyword, ensure_ascii=False))
    ) or {}
    if not input_state.get("ok") or not input_state.get("active_is_input"):
        raise PageCollectionError(
            "The BOSS search keyword was not committed to the active input. "
            f"Diagnostics: {json.dumps(input_state, ensure_ascii=False)}"
        )

    # Submit from the focused input. Clicking a broadly matched search button
    # can hit a different control after BOSS changes the city-page layout.
    key = {
        "key": "Enter",
        "code": "Enter",
        "windowsVirtualKeyCode": 13,
        "nativeVirtualKeyCode": 13,
    }
    page.send("Input.dispatchKeyEvent", {"type": "rawKeyDown", **key})
    page.send("Input.dispatchKeyEvent", {"type": "char", "text": "\r", **key})
    page.send("Input.dispatchKeyEvent", {"type": "keyUp", **key})


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
        # Direct navigation is redirected to the city landing page by BOSS. Use
        # the same visible search form that succeeds during a manual search.
        requested_search_url = search_url(keyword, city)
        requested_city_url = city_landing_url(city)
        page.navigate(requested_city_url)
        wait_for_render(
            page,
            'input[name="query"], input.ipt-search, .search-form input, .search-form-con input, '
            'input[placeholder*="职位"], input[placeholder*="搜索"]',
            timeout=60,
            expected_url=requested_city_url,
        )
        submit_visible_search(page, keyword)
        # The BOSS city form can open search results in a new tab. Attach to
        # that tab before waiting so diagnostics do not keep reading the old
        # city landing page.
        page.adopt_page_for_url(requested_search_url, timeout=10)
        wait_for_render(
            page,
            'a[href*="/job_detail/"], .search-job-result',
            timeout=60,
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
