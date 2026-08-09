import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTE = ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts"
ONTOLOGY = ROOT / "app" / "lib" / "cv-capability-ontology.ts"
TEMPLATE_INDEX = ROOT / "app" / "lib" / "cv-template-index.ts"
LATEX_TEXT = ROOT / "app" / "lib" / "latex-text.ts"


class CvChineseTexAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.route = ROUTE.read_text(encoding="utf-8")
        self.ontology = ONTOLOGY.read_text(encoding="utf-8")
        self.template_index = TEMPLATE_INDEX.read_text(encoding="utf-8")
        self.latex_source = LATEX_TEXT.read_text(encoding="utf-8")

    def test_chinese_auto_research_requirements_are_recognized(self):
        for phrase in [
            "科研智能体",
            "工具调用",
            "代码执行",
            "实验验证",
            "强化学习",
            "数据生成",
            "多模态大模型",
            "论文复现",
            "跨学科合作",
        ]:
            self.assertIn(phrase, self.ontology)

    def test_template_is_parsed_into_traceable_snippets(self):
        self.assertIn("buildCvTemplateIndex", self.route)
        self.assertIn("latexToPlainText", self.template_index)
        self.assertIn("snippetId", self.template_index)
        self.assertIn("rawLatex", self.template_index)
        self.assertIn("visibleText", self.template_index)
        self.assertIn("sourceFile", self.template_index)
        self.assertIn("location", self.template_index)
        self.assertIn('" $1 "', self.latex_source)

    def test_template_coverage_is_not_flattened_literal_matching(self):
        self.assertNotIn("hasAlias(templateText, rule.literalTerms)", self.route)
        self.assertIn("searchCvTemplate", self.route)
        self.assertIn("relationPath", self.route)
        self.assertIn("shared_bilingual_capability_ontology", self.route)

    def test_bilingual_ontology_contains_required_relations(self):
        for relation in ["exact_equivalent", "native_synonym", "narrower_than", "evidence_for", "transferable_to", "related_only", "excluded"]:
            self.assertIn(relation, self.ontology)
        self.assertIn('{ from: "biostatistics", to: "statistics", type: "narrower_than" }', self.ontology)
        self.assertIn('{ from: "python", to: "pytorch", type: "excluded"', self.ontology)

    def test_education_fields_are_atomic(self):
        for label in [
            "Doctoral degree",
            "Statistics background",
            "Computer science background",
            "AI background",
            "Information science background",
            "Mathematics background",
            "Automation background",
            "STEM-related field",
        ]:
            self.assertIn(label, self.ontology)

    def test_chinese_degree_list_uses_context_aliases(self):
        for phrase in ["计算机、AI", "AI、信息", "信息、数学", "数学、统计", "统计、自动化"]:
            self.assertIn(phrase, self.ontology)
        self.assertNotIn('aliasesZh: ["信息"]', self.ontology)
        self.assertNotIn('aliases: ["information science", "信息科学", "信息"]', self.ontology)

    def test_complete_jd_matching_is_chunked_not_truncated_in_route(self):
        self.assertIn("runCompleteHybridRag", self.route)
        self.assertIn("chunkSize = 30", self.route)
        self.assertIn("rules.slice(offset, offset + chunkSize)", self.route)

    def test_chinese_and_english_templates_are_available(self):
        for filename in [
            "cv_tech.tex",
            "cv_tech_cn.tex",
            "cv_quant.tex",
            "cv_quant_cn.tex",
            "cv_pharma.tex",
            "cv_pharma_cn.tex",
            "cv_healthcare_consulting.tex",
            "cv_healthcare_consulting_cn.tex",
            "cv_clinical_data_neuro_cn.tex",
        ]:
            self.assertIn(filename, self.route)


if __name__ == "__main__":
    unittest.main()
