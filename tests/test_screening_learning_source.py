from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ScreeningLearningSourceTests(unittest.TestCase):
    def test_learning_page_and_api_exist(self):
        page = (ROOT / "app/screening-learning/screening-learning-client.tsx").read_text(encoding="utf-8")
        api = (ROOT / "app/api/screening-learning/route.ts").read_text(encoding="utf-8")
        self.assertIn("筛选学习", page)
        self.assertIn("批准规则", page)
        self.assertIn("getScreeningLearningSnapshot", api)
        self.assertIn("decideScreeningRule", api)

    def test_feedback_sources_and_guardrails_are_present(self):
        store = (ROOT / "app/lib/screening-learning-store.ts").read_text(encoding="utf-8")
        self.assertIn("Chrome 书签手动加入", store)
        self.assertIn("saved_jobs", store)
        self.assertIn("ignored_jobs", store)
        self.assertIn("screening_rule_decisions", store)
        self.assertIn("boost: Math.min(15", store)

    def test_imports_pass_through_approved_rules(self):
        middleware = (ROOT / "middleware.ts").read_text(encoding="utf-8")
        learned = (ROOT / "app/api/jobs/import-learned/route.ts").read_text(encoding="utf-8")
        self.assertIn('/api/jobs/import-learned', middleware)
        self.assertIn("getApprovedScreeningRules", learned)
        self.assertIn("learnedRuleAdjustment", learned)
        self.assertIn("POST as importJobs", learned)

    def test_verification_queue_has_four_embedded_actions(self):
        enhancer = (ROOT / "app/verification-queue-actions.tsx").read_text(encoding="utf-8")
        self.assertIn('status !== "需复核"', enhancer)
        for label in ("人工通过", "重新核验", "不再推荐", "仅删除记录"):
            self.assertIn(label, enhancer)
        self.assertIn("/api/manual-review", enhancer)

    def test_generic_scientist_queries_are_included(self):
        config = (ROOT / "config/us_search_queries.json").read_text(encoding="utf-8")
        self.assertIn("research scientist digital health", config)
        self.assertIn("research scientist biostatistics", config)
        self.assertIn("research scientist neuroscience", config)
        self.assertIn("applied scientist healthcare", config)


if __name__ == "__main__":
    unittest.main()
