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

    def test_client_displays_fact_and_template_evidence(self):
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        self.assertIn("事实证据", client)
        self.assertIn("当前 CV 命中片段", client)
        self.assertIn("代表性事实", client)
        self.assertIn("关系路径", client)
        self.assertNotIn("查看事实母版证据", client)


if __name__ == "__main__":
    unittest.main()
