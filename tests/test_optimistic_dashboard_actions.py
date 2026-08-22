import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class OptimisticDashboardActionsTests(unittest.TestCase):
    def test_saved_job_moves_out_of_today_immediately_in_react_state(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('(view !== "today" || !saved.includes(job.id))', source)
        self.assertIn('setSaved((current) => isSaved ? current.filter', source)
        self.assertIn('setDailyJobs((current) => {', source)
        self.assertIn('saved: !isSaved', source)
        self.assertIn('writeJobSessionCache(next)', source)

    def test_ignore_is_optimistic_with_rollback(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('const jobsSnapshot = dailyJobs;', source)
        self.assertIn('const savedSnapshot = saved;', source)
        self.assertIn('setIgnoreTarget(null);', source)
        self.assertIn('setDailyJobs(jobsSnapshot);', source)
        self.assertIn('setSaved(savedSnapshot);', source)

    def test_manual_approval_updates_job_state_without_page_reload(self):
        actions = (ROOT / "app" / "verification-queue-actions.tsx").read_text(encoding="utf-8")
        dashboard = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('ivy-job-radar:jobs-updated', actions)
        self.assertIn('ivy-job-radar:jobs-updated', dashboard)
        self.assertNotIn('window.location.reload', actions)

    def test_obsolete_global_optimistic_dom_watcher_is_not_mounted(self):
        layout = (ROOT / "app" / "layout.tsx").read_text(encoding="utf-8")
        self.assertNotIn("<OptimisticDashboardActions />", layout)


if __name__ == "__main__":
    unittest.main()
