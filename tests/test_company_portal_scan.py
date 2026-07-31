from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.company_portal_scan import (
    company_rows,
    detect_ats,
    location_matches_region,
    normalize_posting,
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

    def test_detects_supported_ats(self) -> None:
        self.assertEqual(
            detect_ats(["https://jobs.lever.co/example"])[0:2],
            ("lever", "example"),
        )
        self.assertEqual(
            detect_ats(["https://acme.wd5.myworkdayjobs.com/External"])[0:2],
            ("workday", "acme.wd5.myworkdayjobs.com/External"),
        )

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
