import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CvStructuredFactEvidenceTests(unittest.TestCase):
    def test_analysis_returns_structured_support_evidence(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        for phrase in ["supportEvidence", "verifiedSupportEvidence", "preverificationScore", "retrievalChannels", "factId", "claimBoundary", "matchStructuredEvidence"]:
            self.assertIn(phrase, route)

    def test_publication_status_controls_peer_reviewed_evidence(self):
        structured = (ROOT / "app" / "lib" / "structured-evidence.ts").read_text(encoding="utf-8")
        template_index = (ROOT / "app" / "lib" / "cv-template-index.ts").read_text(encoding="utf-8")
        self.assertIn('record.publication_status !== "published"', structured)
        self.assertIn('record.publication_status === "published"', template_index)
        self.assertIn('concepts.add("published_journal_article")', template_index)

    def test_archive_preserves_fact_evidence_for_chat_review(self):
        archive = (ROOT / "app" / "api" / "cv-tailor" / "archive" / "route.ts").read_text(encoding="utf-8")
        for field in ["fact_id", "verified_fact", "source", "evidence_location", "claim_boundary", "industry_guardrail"]:
            self.assertIn(field, archive)
        self.assertIn("preliminary_only", archive)


if __name__ == "__main__":
    unittest.main()
