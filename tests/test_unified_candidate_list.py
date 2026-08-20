import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class UnifiedCandidateListTests(unittest.TestCase):
    def test_saved_and_pending_are_one_list_without_bucket_toggle(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('view === "saved" ? "候选岗位"', source)
        self.assertIn('我的候选岗位（${mergedSavedItems.length}）', source)
        self.assertIn('mergedSavedItems', source)
        self.assertIn('savedApplicationMatchesJob', source)
        self.assertIn('pagedSavedItems', source)
        self.assertNotIn('type SavedBucket', source)
        self.assertNotIn('savedBucket', source)
        self.assertNotIn('stats stats-two" aria-label="收藏概览', source)
        self.assertNotIn('<b>状态</b>待提交申请', source)

    def test_candidate_list_deduplicates_saved_job_when_application_exists(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('!pendingApplications.some((application) => savedApplicationMatchesJob(application, job))', source)
        self.assertIn('application.applicationId === job.applicationId', source)
        self.assertIn('application.jobUrl === job.jobUrl', source)


if __name__ == "__main__":
    unittest.main()
