import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CvAtomicRagAndDiffTests(unittest.TestCase):
    def test_analysis_reads_stage3_atomic_facts(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("STAGE3_ATOMIC_FACTS.yaml", route)
        self.assertIn("parseAtomicFacts", route)
        self.assertIn("verifiedFact", route)
        self.assertIn("evidenceLocation", route)
        self.assertIn("personalAttribution", route)
        self.assertIn("claimBoundary", route)

    def test_project_identity_uses_canonical_aliases(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("projectIdentityAliases", route)
        self.assertIn("templateContainsProject", route)
        self.assertIn("hospital_readmission_risk", route)
        self.assertIn("neurostat_virtual_lab", route)
        self.assertIn("pfizer_asthma_clinical_trial_simulation", route)

    def test_compound_capabilities_are_split(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        self.assertNotIn('label: "Clinical and multimodal data"', route)
        self.assertNotIn('label: "Regression and mixed models"', route)
        self.assertNotIn('label: "Reinforcement learning and post-training"', route)
        self.assertNotIn('label: "Scientific problem solving and paper reproduction"', route)

    def test_client_selects_language_and_fifth_track(self):
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        self.assertIn('body: JSON.stringify({ track, language, jd })', client)
        self.assertIn("English", client)
        self.assertIn("中文", client)
        self.assertIn("clinical_neuro", client)
        self.assertIn("脑科学 / 临床数据 / 医疗器械", client)

    def test_analysis_generates_reviewable_latex_diffs(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        self.assertIn("buildModificationDrafts", route)
        self.assertIn("latexDiff", route)
        self.assertIn("modificationDrafts", route)
        self.assertIn("查看 LaTeX diff", client)
        self.assertIn("保留建议", client)
        self.assertIn("拒绝", client)


if __name__ == "__main__":
    unittest.main()
