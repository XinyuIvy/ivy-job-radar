from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.company_portal_scan import (
    aggregator_portals,
    company_match_keys,
    company_names_match,
    company_rows,
    previous_portals,
    detect_ats,
    extract_embedded_urls,
    location_matches_region,
    normalize_api_job,
    normalize_posting,
    parse_embedded_jobs,
    parse_enterprise_html,
    parse_html,
    parse_workable_markdown,
)
from scripts.merge_scan_results import canonical_url, enrich_job, merge_record


class CompanyPortalScanTests(unittest.TestCase):
    def test_company_pool_is_deduplicated(self) -> None:
        rows = [
            {"company": "Example Health", "region": "美国", "source": "https://example.com/careers"},
            {"company": "Example Health", "region": "美国", "source": "https://example.com/jobs"},
            {"company": "另一家公司", "region": "中国", "source": "https://example.cn/jobs"},
        ]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pool.json"
            path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
            self.assertEqual(len(company_rows(path)), 2)

    def test_matches_regional_company_aliases_to_upstream_names(self) -> None:
        self.assertIn("pfizer", company_match_keys("辉瑞中国"))
        self.assertIn("iqvia", company_match_keys("IQVIA中国"))
        self.assertIn("genentechroche", company_match_keys("罗氏中国"))

    def test_aggregator_registry_indexes_parent_and_upstream_names(self) -> None:
        rows = [
            {
                "company": "Genentech/Roche",
                "upstream_company": "roche",
                "sample_job_url": "https://roche.wd3.myworkdayjobs.com/roche-ext/job/1",
            }
        ]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "registry.json"
            path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
            portals = aggregator_portals(path)
            self.assertEqual(portals["roche"], rows[0]["sample_job_url"])
            self.assertEqual(
                portals[company_match_keys("罗氏中国")[-1]],
                rows[0]["sample_job_url"],
            )

    def test_company_name_validation_rejects_unrelated_entities(self) -> None:
        self.assertTrue(company_names_match("Apple Inc.", "Apple Inc."))
        self.assertTrue(company_names_match("BeOne Medicines", "BeOne Medicines Ltd."))
        self.assertFalse(company_names_match("Apple Inc.", "Apple Health Foundation"))

    def test_reuses_only_prior_portals_with_job_evidence(self) -> None:
        rows = [
            {
                "company": "Example Health",
                "final_url": "https://jobs.example.com/careers",
                "ats_type": "workday",
                "jobs_scanned": 3,
            },
            {
                "company": "Unverified Corp",
                "final_url": "https://unverified.example.com/",
                "ats_type": "generic",
                "jobs_scanned": 0,
            },
        ]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "previous.json"
            path.write_text(json.dumps(rows), encoding="utf-8")
            portals = previous_portals(path)
            self.assertIn(company_match_keys("Example Health")[0], portals)
            self.assertNotIn(company_match_keys("Unverified Corp")[0], portals)

    def test_detects_supported_ats(self) -> None:
        self.assertEqual(
            detect_ats(["https://jobs.lever.co/example"])[0:2],
            ("lever", "example"),
        )
        self.assertEqual(
            detect_ats(["https://acme.wd5.myworkdayjobs.com/External"])[0:2],
            ("workday", "acme.wd5.myworkdayjobs.com/External"),
        )
        enterprise_cases = {
            "https://careers-acme.icims.com/jobs/search?ss=1": ("icims", "careers-acme.icims.com"),
            "https://recruiting.paylocity.com/recruiting/jobs/All/12345678-1234-1234-1234-123456789abc/acme": (
                "paylocity",
                "12345678-1234-1234-1234-123456789abc",
            ),
            "https://acme.applytojob.com/apply/jobs/": ("jazzhr", "acme"),
            "https://career5.successfactors.eu/career?company=ACME": (
                "successfactors",
                "career5.successfactors.eu|ACME",
            ),
            "https://jobs.gem.com/acme": ("gem", "acme"),
        }
        for url, expected in enterprise_cases.items():
            with self.subTest(url=url):
                self.assertEqual(detect_ats([url])[0:2], expected)

    def test_parses_enterprise_embedded_json_and_links(self) -> None:
        body = """
        <html>
          <script id="__NEXT_DATA__" type="application/json">
            {"props":{"pageProps":{"jobs":[
              {"jobTitle":"Biostatistician","jobUrl":"/jobs/123",
               "location":{"city":"Boston","state":"Massachusetts"}}
            ]}}}
          </script>
          <a href="/jobs/456">Data Scientist</a>
          <a href="/jobs/999">Software Engineer</a>
        </html>
        """
        embedded = parse_embedded_jobs(body, "https://careers.example.com/")
        self.assertEqual(len(embedded), 1)
        self.assertEqual(embedded[0]["location"], "Boston, Massachusetts")
        rows = parse_enterprise_html(body, "https://careers.example.com/")
        self.assertEqual({row["title"] for row in rows}, {"Biostatistician", "Data Scientist"})

    def test_discovers_public_comeet_api_reference(self) -> None:
        body = """
        <script>
        const endpoint = "https://www.comeet.co/careers-api/2.0/company/D4.001/"
          + "positions?token=PUBLIC123&amp;details=true";
        </script>
        """
        # Use one contiguous URL as it appears in production pages.
        body = (
            '<script>const endpoint="https://www.comeet.co/careers-api/2.0/'
            'company/D4.001/positions?token=PUBLIC123&amp;details=true";</script>'
        )
        url = extract_embedded_urls(body)[0]
        self.assertEqual(
            detect_ats([url])[0:2],
            ("comeet", "D4.001|PUBLIC123"),
        )

    def test_parses_paylocity_page_data(self) -> None:
        body = """
        <script>
          window.pageData = {"Jobs":[{
            "JobId":4304721,
            "JobTitle":"Biostatistician II",
            "LocationName":"Remote Worker",
            "JobLocation":{"City":"Washington","State":"DC","Country":"USA"}
          }]};
        </script>
        """
        rows = parse_embedded_jobs(
            body,
            "https://recruiting.paylocity.com/recruiting/jobs/All/"
            "d41cfe64-1dc9-420c-8d79-e98f168d48fa/Example",
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["title"], "Biostatistician II")
        self.assertEqual(
            rows[0]["url"],
            "https://recruiting.paylocity.com/Recruiting/Jobs/Details/4304721",
        )

    def test_normalizes_nested_enterprise_location(self) -> None:
        job = normalize_api_job(
            "Example",
            "美国",
            "gem",
            {
                "title": "Data Scientist",
                "locations": [
                    {
                        "name": "San Francisco",
                        "city": "San Francisco",
                        "isoCountry": "USA",
                        "isRemote": False,
                    }
                ],
                "url": "https://jobs.example.com/1",
            },
            "now",
        )
        self.assertIsNotNone(job)
        self.assertEqual(job["location"], "San Francisco")

    def test_parses_schema_org_job_posting(self) -> None:
        body = """
        <html><script type="application/ld+json">
        {"@context":"https://schema.org","@type":"JobPosting",
         "title":"Biostatistician","description":"PhD and SAS",
         "url":"https://example.com/jobs/1"}
        </script></html>
        """
        _, _, postings = parse_html(body, "https://example.com/careers")
        self.assertEqual(len(postings), 1)
        job = normalize_posting("Example", "美国", postings[0], "https://example.com/jobs/1", "now")
        self.assertIsNotNone(job)
        self.assertEqual(job["title"], "Biostatistician")

    def test_workable_feed_and_region_filter(self) -> None:
        rows = parse_workable_markdown(
            "[Data Scientist](https://apply.workable.com/acme/j/ABC/) "
            "[Software Engineer](https://apply.workable.com/acme/j/DEF/)",
            "acme",
        )
        self.assertEqual(len(rows), 1)
        self.assertTrue(location_matches_region("United States - New York", "美国"))
        self.assertFalse(location_matches_region("Remote - India", "美国"))
        self.assertTrue(location_matches_region("上海, 中国", "中国"))

    def test_canonical_deduplication_merges_sources(self) -> None:
        self.assertEqual(
            canonical_url("https://www.example.com/jobs/1/?utm_source=x&ref=abc"),
            "https://example.com/jobs/1",
        )
        merged = merge_record(
            {"company": "Example", "title": "Data Scientist", "score": 60, "source": "JobSpy", "skills": ["R"]},
            {
                "company": "Example",
                "title": "Data Scientist",
                "score": 70,
                "source": "Company portal",
                "skills": ["Python"],
                "full_description": "Complete description",
                "status": "开放",
            },
        )
        self.assertEqual(merged["score"], 70)
        self.assertEqual(set(merged["skills"]), {"R", "Python"})
        self.assertEqual(set(merged["sources"]), {"JobSpy", "Company portal"})

    def test_verification_enrichment_is_deterministic(self) -> None:
        job = enrich_job(
            {
                "company": "Example",
                "title": "Biostatistician",
                "score": 80,
                "status": "开放",
                "job_url": "https://boards.greenhouse.io/example/jobs/1",
                "full_description": (
                    "Required qualifications: PhD, R, SAS and 2 years experience. "
                    "Preferred qualifications: Python and clinical trials."
                ),
            },
            {},
        )
        self.assertEqual(set(job["required_skills"]), {"R", "SAS"})
        self.assertEqual(set(job["preferred_skills"]), {"Python", "Clinical trials"})
        self.assertEqual(job["evidence_missing"], [])
        self.assertEqual(job["legitimacy_score"], 100)


if __name__ == "__main__":
    unittest.main()
