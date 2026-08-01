import unittest

from scripts.verify_company_jobs import (
    extract_application_id,
    normalize_application_id,
)


class ApplicationIdExtractionTests(unittest.TestCase):
    def test_stops_query_identifier_before_embedded_json(self):
        page_text = (
            'gh_jid=5364702004\\",\\\"department\\":\\\"Sales\\\"},'
            '{\\\"title\\":\\\"Account Executive\\\"}'
        )

        application_id = extract_application_id("", page_text, None)

        self.assertEqual(application_id, "5364702004")

    def test_rejects_oversized_structured_identifier(self):
        posting = {"identifier": {"value": "X" * 200}}

        self.assertEqual(extract_application_id("", "", posting), "")

    def test_accepts_normal_ats_identifier(self):
        self.assertEqual(normalize_application_id("REQ-2026-1234"), "REQ-2026-1234")


if __name__ == "__main__":
    unittest.main()
