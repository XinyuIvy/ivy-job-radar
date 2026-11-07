"""Collect source records without applying Job Radar business transformations."""
from __future__ import annotations

import argparse
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import aggregator_scan as aggregator
import cloud_sources_scan as cloud
import company_portal_scan as portals


def envelope(provider: str, row: dict, **context) -> dict:
    """Keep source field names, duplicate rows, and missing values intact."""
    return {"provider": provider, "raw": row, "context": context}


def jobspy_records(config: dict, collected_at: str):
    from jobspy import scrape_jobs

    for query in config["queries"]:
        frame = scrape_jobs(
            site_name=config["sites"], search_term=query,
            location=config["locations"][0],
            results_wanted=int(config["results_wanted_per_query"]),
            hours_old=int(config["hours_old"]), country_indeed=config["country_indeed"],
            linkedin_fetch_description=True,
        )
        # JSON serialization converts pandas missing sentinels to JSON null.
        for row in json.loads(frame.to_json(orient="records", date_format="iso")):
            yield envelope("jobspy", row, region="美国", collectedAt=collected_at,
                           source=f"JobSpy · {row.get('site') or 'unknown'}", status="待官网核验")


def cloud_records(collected_at: str, sources=None):
    for source, url in (cloud.SOURCES if sources is None else sources):
        body = cloud.fetch(url)
        rows = cloud.rss_items(body) if source == "weworkremotely" else cloud.json_items(source, json.loads(body))
        for row in rows:
            yield envelope(source, row, source=source, collectedAt=collected_at,
                           baseUrl=url, status="待官网核验")


def aggregator_records(collected_at: str, failures=None):
    manifest = aggregator.fetch_json(f"{aggregator.DEFAULT_BASE_URL}/jobs_manifest.json")
    if not isinstance(manifest, dict) or not isinstance(manifest.get("chunks"), list):
        raise ValueError("Aggregator manifest is missing its chunk list")
    for chunk in manifest["chunks"]:
        try:
            rows = aggregator.fetch_json(f"{aggregator.DEFAULT_BASE_URL}/{chunk}", compressed=True)
            if not isinstance(rows, list):
                raise ValueError("Aggregator chunk must be an array")
        except Exception as error:
            if failures is not None:
                failures.append({"source": f"Aggregator/{chunk}", "error": str(error)[:300]})
            continue
        for row in rows:
            if isinstance(row, dict):
                yield envelope("aggregator", row, source="Job Board Aggregator",
                               collectedAt=collected_at, status="待官网核验")


def portal_records(company_row: dict, collected_at: str, max_pages: int = 8) -> list[dict]:
    company = company_row.get("company", "")
    region = company_row.get("region", "美国")
    seed = portals.verified_company_portal(company) or company_row.get("source", "")
    if not str(seed).startswith(("http://", "https://")):
        seed, error = portals.discover_homepage(company)
        if not seed:
            raise ValueError(error or "No career homepage found")
    ats, tenant, base_url = portals.detect_ats([seed])
    rows, endpoint = portals.api_jobs(ats, tenant, base_url, raw_only=True)
    records = []

    def append(row: dict, url: str, provider: str = "portal"):
        records.append(envelope(provider, row, company=company, region=region,
                                ats=ats, tenant=tenant, baseUrl=url,
                                collectedAt=collected_at, source=f"{ats} · 公司官方招聘系统",
                                status="开放"))

    if rows:
        for row in rows:
            if ats == "workday" and row.get("externalPath"):
                detail_url = endpoint.removesuffix("/jobs") + str(row["externalPath"])
                detail = portals.json_payload(portals.fetch(detail_url))
                row = {**row, "_detail": detail}
            append(row, base_url or seed)
        return records
    response = portals.fetch(seed)
    if response.status != 200:
        raise ValueError(response.error or f"HTTP {response.status}")
    _, links, postings = portals.parse_html(response.body, response.url)
    next_ats, next_tenant, next_url = portals.detect_ats([response.url] + [url for url, _ in links] + portals.extract_embedded_urls(response.body))
    if next_ats != "generic":
        ats, tenant, base_url = next_ats, next_tenant, next_url
        rows, _ = portals.api_jobs(ats, tenant, base_url, raw_only=True)
        for row in rows:
            append(row, base_url)
    for row in postings:
        append(row, response.url, "jsonld")
    if not rows and not postings:
        # The set prevents fetching the same URL repeatedly, not job deduplication.
        visited = set()
        for url, anchor in [(u, a) for u, a in links if portals.JOB_LINK.search(u)][:max_pages]:
            if url in visited:
                continue
            visited.add(url)
            detail = portals.fetch(url, retries=1)
            if detail.status != 200:
                raise ValueError(detail.error or f"HTTP {detail.status}")
            _, _, details = portals.parse_html(detail.body, detail.url)
            for row in details:
                append(row, detail.url, "jsonld")
            if not details:
                append({"title": anchor, "description": detail.body, "url": detail.url}, detail.url, "html")
    return records


def collect(output_dir: Path, config_path: Path, pool_path: Path, workers: int, region: str) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    collected_at = datetime.now(timezone.utc).isoformat()
    receipt = {"generated_at": collected_at, "pipeline": "shared-backend-v1", "received": 0, "failed_sources": [], "sources": []}
    snapshot = output_dir / "raw_jobs_latest.json"
    with snapshot.open("w", encoding="utf-8") as handle:
        handle.write("[")

        def write(rows):
            count = 0
            for row in rows:
                encoded = json.dumps(row, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
                if receipt["received"]:
                    handle.write(",\n")
                handle.write(encoded)
                receipt["received"] += 1
                count += 1
            return count

        config = json.loads(config_path.read_text(encoding="utf-8"))
        sources = [
            (f"JobSpy/{query}", lambda query=query: jobspy_records({**config, "queries": [query]}, collected_at))
            for query in config["queries"]
        ]
        sources += [
            (name, lambda name=name, url=url: cloud_records(collected_at, [(name, url)]))
            for name, url in cloud.SOURCES
        ]
        sources.append(("Aggregator", lambda: aggregator_records(collected_at, receipt["failed_sources"])))
        for name, source in sources:
            try:
                count = write(source())
                receipt["sources"].append({"source": name, "collected": count, "state": "success"})
            except Exception as error:
                receipt["failed_sources"].append({"source": name, "error": str(error)[:300]})
        companies = portals.company_rows(pool_path)
        companies = [row for row in companies if not region or row.get("region") == region]
        with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
            tasks = {executor.submit(portal_records, row, collected_at): row["company"] for row in companies}
            for future in as_completed(tasks):
                name = tasks[future]
                try:
                    count = write(future.result())
                    receipt["sources"].append({"source": name, "collected": count, "state": "success"})
                except Exception as error:
                    receipt["failed_sources"].append({"source": name, "error": str(error)[:300]})
        handle.write("]\n")
    (output_dir / "raw_collection_receipt_latest.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path("data/scans"))
    parser.add_argument("--config", type=Path, default=Path("config/us_search_queries.json"))
    parser.add_argument("--pool", type=Path, default=Path("app/company-pool.json"))
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--region", default="美国", choices=["美国", "中国"])
    args = parser.parse_args()
    result = collect(args.output_dir, args.config, args.pool, args.workers, args.region)
    print(f"Collected {result['received']} raw records; {len(result['failed_sources'])} sources failed.")
    if not result["received"]:
        raise SystemExit("No records collected; ingestion was not attempted.")


if __name__ == "__main__":
    main()
