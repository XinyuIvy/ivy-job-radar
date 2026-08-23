import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class UnifiedCandidateListContractTests(unittest.TestCase):
    def test_saved_area_is_split_into_two_compact_candidate_pools(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('view === "saved" ? "候选岗位"', source)
        self.assertIn('type CandidateBucket = "favorites" | "pending"', source)
        self.assertIn('className="compact-candidate-list"', source)
        self.assertIn('className="stats stats-two candidate-stage-tabs"', source)
        self.assertIn('role="tablist" aria-label="候选岗位分类"', source)
        self.assertIn('href={`/jobs/${entry.job.id}`}', source)
        self.assertIn('href={`/applications/${entry.application.id}`}', source)
        self.assertIn("groupJobsByCompany(savedOnlyJobs)", source)
        self.assertIn("事实库匹配", source)

    def test_duplicate_saved_job_yields_to_application_record(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('savedApplicationMatchesJob', source)
        self.assertIn('application.status !== "收藏"', source)
        self.assertIn('!applicationsList.some((application) => applicationHidesFavorite(application, job))', source)

    def test_candidate_totals_are_not_reduced_by_today_filters(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")

        self.assertIn('const savedOnlyJobs = view === "saved" ? allFavoriteJobs : [];', source)
        self.assertIn(': pendingApplications.map((application) => ({', source)
        self.assertNotIn('const filteredPendingApplications', source)
        self.assertIn('{view === "today" && <div className="job-controls">', source)
        self.assertIn('{view === "today" && <div className="track-scroller"', source)


if __name__ == "__main__":
    unittest.main()
