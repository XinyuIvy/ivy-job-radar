import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CvStructuredFactEvidenceTests(unittest.TestCase):
    def test_analysis_returns_structured_support_evidence(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("supportEvidence", route)
        self.assertIn("collectAtomicEvidence", route)
        self.assertIn("supportReasons", route)
        self.assertIn("factId", route)
        self.assertIn("claimBoundary", route)
        self.assertIn("isRestrictionLine", route)

    def test_client_uses_structured_evidence_not_raw_excerpt(self):
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        self.assertIn("代表性事实", client)
        self.assertIn("支持事实", client)
        self.assertIn("为什么相关", client)
        self.assertIn("Direct｜直接证据", client)
        self.assertIn("Transferable｜强可迁移能力", client)
        self.assertIn("Adjacent｜相邻经验", client)
        self.assertNotIn("查看事实母版证据", client)


if __name__ == "__main__":
    unittest.main()
