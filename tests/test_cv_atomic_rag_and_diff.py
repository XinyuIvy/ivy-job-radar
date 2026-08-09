import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CvAtomicRagAndDiffTests(unittest.TestCase):
    def test_analysis_reads_compiled_fact_index(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("FACT_INDEX.jsonl", route)
        self.assertIn("CONCEPT_EDGES.jsonl", route)
        self.assertIn("parseJsonl<FactIndexRecord>", route)
        self.assertIn("runHybridRag", route)
        self.assertIn("verifiedSupportEvidence", route)

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

    def test_analysis_navigation_uses_clickable_result_panels(self):
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        self.assertIn('type ResultPanel = "projects" | "requirements" | "covered"', client)
        self.assertIn('role="tablist"', client)
        self.assertIn('onClick={() => setResultPanel(panel.id)}', client)
        self.assertIn('label: "推荐项目"', client)
        self.assertIn('label: "逐条修改"', client)

    def test_jd_evidence_is_compact_and_highlighted(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        self.assertIn("jdEvidence: rule.sourceText", route)
        self.assertIn("jdMatchedTerms", route)
        self.assertIn("HighlightedText", client)
        self.assertIn("JD 原句", client)

    def test_stage_4_to_7_are_loaded_through_compiled_indexes(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        for filename in [
            "FACT_INDEX.jsonl",
            "CONCEPT_EDGES.jsonl",
            "STAGE7_HYBRID_RAG_MATCHING.yaml",
        ]:
            self.assertIn(filename, route)
        self.assertIn('ragPreparationStages: "1–7"', route)

    def test_non_project_indexes_use_structured_matching(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        for filename in ["CREDENTIAL_INDEX.jsonl", "COURSEWORK_INDEX.jsonl", "PROFILE_INDEX.jsonl", "LITERATURE_INDEX.jsonl", "STAGE7_NON_PROJECT_MATCHING_ADDENDUM.yaml", "STAGE7_LITERATURE_MATCHING_ADDENDUM.yaml"]:
            self.assertIn(filename, route)
        self.assertIn("matchStructuredEvidence", route)
        self.assertIn('"Credential Direct"', route)
        self.assertIn('"Coursework Match"', route)

    def test_incomplete_status_is_not_forced_to_adjacent(self):
        rag = (ROOT / "app" / "lib" / "hybrid-rag.ts").read_text(encoding="utf-8")
        self.assertNotIn('["planned", "project_context"].includes(fact.fact_status)', rag)
        self.assertIn('["planned", "in_progress"].includes(fact.fact_status)', rag)


if __name__ == "__main__":
    unittest.main()
