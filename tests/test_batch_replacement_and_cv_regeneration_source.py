import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class BatchReplacementAndCvRegenerationSourceTests(unittest.TestCase):
    def test_review_job_is_permanently_ignored_and_replenished(self):
        route = (ROOT / "app/api/application-automation/route.ts").read_text(encoding="utf-8")
        client = (ROOT / "app/job-radar.tsx").read_text(encoding="utf-8")

        self.assertIn('body.action === "remove_from_batch"', route)
        self.assertIn('stage: "user_removed_from_review"', route)
        self.assertIn("db.insert(ignoredJobs)", route)
        self.assertIn("db.delete(savedJobs)", route)
        self.assertIn("if (existingTask?.stage === \"user_removed_from_review\") continue", route)
        self.assertIn("reviewBatch: current.reviewBatch.filter", client)
        self.assertIn("永久排除并补一个", client)
        self.assertIn('fetch("/api/application-automation", { method: "POST" })', client)
        styles = (ROOT / "app/globals.css").read_text(encoding="utf-8")
        self.assertIn(".automation-review-links button", styles)

    def test_all_pending_cvs_can_be_requeued_for_the_latest_prompt(self):
        route = (ROOT / "app/api/cv-prebuild/regenerate-pending/route.ts").read_text(encoding="utf-8")
        client = (ROOT / "app/job-radar.tsx").read_text(encoding="utf-8")

        self.assertIn('eq(applications.status, "准备材料")', route)
        self.assertIn("SET status = 'stale'", route)
        self.assertIn("VALUES (?, ?, 'queued'", route)
        self.assertIn('fetch("/api/cv-prebuild/regenerate-pending"', client)
        self.assertIn("按最新 Prompt 重新生成全部 CV", client)
        self.assertIn("CV_PROMPT_AUTOREGEN_STORAGE_KEY", client)


if __name__ == "__main__":
    unittest.main()
