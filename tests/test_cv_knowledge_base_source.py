import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CvKnowledgeBaseSourceTests(unittest.TestCase):
    def test_private_cv_knowledge_files_are_defined(self):
        source = (ROOT / "app" / "lib" / "cv-knowledge.ts").read_text(encoding="utf-8")
        self.assertIn('knowledge/FACT_INDEX.json', source)
        self.assertIn('knowledge/CAPABILITY_ONTOLOGY.json', source)
        self.assertIn('knowledge/INDUSTRY_TRANSLATION_MAP.json', source)
        self.assertIn('prohibited_overclaims', source)
        self.assertIn('evidence_strength', source)

    def test_knowledge_api_supports_status_and_retrieval(self):
        route = (ROOT / "app" / "api" / "cv-knowledge" / "route.ts").read_text(encoding="utf-8")
        self.assertIn('export async function GET()', route)
        self.assertIn('export async function POST', route)
        self.assertIn('structured-hybrid-retrieval', route)
        self.assertIn('fact-master-fallback', route)

    def test_dashboard_is_linked_from_job_radar(self):
        layout = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        client = (ROOT / "app" / "cv-knowledge" / "cv-knowledge-client.tsx").read_text(encoding="utf-8")
        self.assertIn('href="/cv-knowledge"', layout)
        self.assertIn('CV 知识库', layout)
        self.assertIn('/api/cv-knowledge', client)
        self.assertIn('禁止过度表述', client)


if __name__ == "__main__":
    unittest.main()
