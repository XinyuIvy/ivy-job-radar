import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class UnifiedCandidateListTests(unittest.TestCase):
    def test_saved_area_has_favorite_and_pending_buckets(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('view === "saved" ? "候选岗位"', source)
        self.assertIn('type CandidateBucket = "favorites" | "pending"', source)
        self.assertIn('candidateBucket === "favorites"', source)
        self.assertIn('savedApplicationMatchesJob', source)
        self.assertIn('pagedCandidateRows', source)
        self.assertIn('进入待申请', source)
        self.assertIn('取消收藏', source)

    def test_candidate_list_deduplicates_saved_job_when_application_exists(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('application.status !== "收藏"', source)
        self.assertIn('!applicationsList.some((application) => applicationHidesFavorite(application, job))', source)
        self.assertIn('application.applicationId === job.applicationId', source)
        self.assertIn('application.jobUrl === job.jobUrl', source)


if __name__ == "__main__":
    unittest.main()
