import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ManualReviewActionsSourceTests(unittest.TestCase):
    def test_manual_review_api_supports_approve_ignore_and_delete(self):
        route = (ROOT / "app" / "api" / "manual-review" / "route.ts").read_text(encoding="utf-8")

        self.assertIn('"approve"', route)
        self.assertIn('"ignore"', route)
        self.assertIn('"delete"', route)
        self.assertIn('status: "开放"', route)
        self.assertIn('source: "核验队列人工通过"', route)
        self.assertIn('db.insert(ignoredJobs)', route)
        self.assertIn('db.delete(jobRequests)', route)
        self.assertIn('db.delete(jobs)', route)

    def test_manual_review_page_exposes_all_user_actions(self):
        client = (ROOT / "app" / "manual-review" / "manual-review-client.tsx").read_text(encoding="utf-8")
        layout = (ROOT / "app" / "layout.tsx").read_text(encoding="utf-8")

        self.assertIn('人工通过', client)
        self.assertIn('不再推荐', client)
        self.assertIn('重新核验', client)
        self.assertIn('仅删除记录', client)
        self.assertIn('href="/manual-review"', layout)


if __name__ == "__main__":
    unittest.main()
