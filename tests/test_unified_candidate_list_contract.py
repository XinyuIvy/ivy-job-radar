import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class UnifiedCandidateListContractTests(unittest.TestCase):
    def test_saved_area_is_one_candidate_pool(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('view === "saved" ? "候选岗位"', source)
        self.assertIn('我的候选岗位（${mergedSavedItems.length}）', source)
        self.assertNotIn('type SavedBucket', source)
        self.assertNotIn('savedBucket', source)
        self.assertNotIn('setSavedBucket', source)
        self.assertNotIn('stats stats-two" aria-label="收藏概览', source)
        self.assertNotIn('<b>状态</b>待提交申请', source)

    def test_duplicate_saved_job_yields_to_application_record(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('savedApplicationMatchesJob', source)
        self.assertIn('!pendingApplications.some((application) => savedApplicationMatchesJob(application, job))', source)


if __name__ == "__main__":
    unittest.main()
