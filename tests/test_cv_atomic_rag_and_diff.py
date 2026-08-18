import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CvAtomicRagAndDiffTests(unittest.TestCase):
    def test_analysis_reads_compiled_fact_and_profile_indexes(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        for filename in ["FACT_INDEX.jsonl", "CONCEPT_EDGES.jsonl", "CREDENTIAL_INDEX.jsonl", "COURSEWORK_INDEX.jsonl", "PROFILE_INDEX.jsonl", "LITERATURE_INDEX.jsonl", "CONFERENCE_INDEX.jsonl"]:
            self.assertIn(filename, route)
        self.assertIn("parseJsonl<FactIndexRecord>", route)
        self.assertIn("matchStructuredEvidence", route)
        self.assertIn("runCompleteHybridRag", route)

    def test_fact_and_template_corpora_are_independent(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("buildCvTemplateIndex", route)
        self.assertIn("searchCvTemplate", route)
        self.assertIn("hasSupported", route)
        self.assertIn("templateSearch.covered", route)
        self.assertNotIn("hasAlias(templateText, rule.literalTerms)", route)

    def test_compound_capabilities_are_split(self):
        ontology = (ROOT / "app" / "lib" / "cv-capability-ontology.ts").read_text(encoding="utf-8")
        for label in ["Reinforcement learning", "PPO", "DPO", "GRPO", "Reward design", "Training stability", "Exploration efficiency", "Generalization", "Tool calling", "Code execution", "Experiment validation", "Data cleaning", "Data filtering", "Data augmentation", "Data mixture", "Data pipeline"]:
            self.assertIn(f'label: "{label}"', ontology)

    def test_client_selects_language_and_fifth_track(self):
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        self.assertIn("const jd = value.jd.trim()", client)
        self.assertIn('track: value.track, language: value.language, jd', client)
        self.assertIn("English", client)
        self.assertIn("中文", client)
        self.assertIn("clinical_neuro", client)

    def test_every_supported_or_adjacent_gap_gets_handling(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        self.assertIn('["supported_gap", "adjacent_gap"].includes(item.status)', route)
        self.assertIn('action: "no_direct_edit"', route)
        self.assertNotIn("if (drafts.length >= 10) break", route)

    def test_jd_evidence_and_template_relation_are_returned(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        archive = (ROOT / "app" / "api" / "cv-tailor" / "archive" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("jdEvidence: hybridMatch.requirement.sourceText", route)
        self.assertIn("jdMatchedTerms", route)
        self.assertIn("templateMatches", route)
        self.assertIn("jd_source_text", archive)
        self.assertIn("literal_terms", archive)
        self.assertIn("support_evidence", archive)

    def test_incomplete_status_is_not_forced_to_adjacent(self):
        rag = (ROOT / "app" / "lib" / "hybrid-rag.ts").read_text(encoding="utf-8")
        self.assertNotIn('["planned", "project_context"].includes(fact.fact_status)', rag)
        self.assertIn('["planned", "in_progress"].includes(fact.fact_status)', rag)


if __name__ == "__main__":
    unittest.main()
