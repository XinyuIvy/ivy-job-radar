import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class OptimisticDashboardActionsTests(unittest.TestCase):
    def test_saved_job_moves_out_of_today_immediately(self):
        source = (ROOT / "app" / "optimistic-dashboard-actions.tsx").read_text(encoding="utf-8")
        self.assertIn('card.dataset.optimisticSaved = "true"', source)
        self.assertIn('card.style.setProperty("display", "none", "important")', source)
        self.assertIn('save?.classList.contains("saved")', source)

    def test_failed_saved_job_request_restores_the_card_and_server_state(self):
        client = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        toggle = client[client.index("const toggleSaved"):client.index("const openFromJob")]
        optimistic = (ROOT / "app" / "optimistic-dashboard-actions.tsx").read_text(encoding="utf-8")
        self.assertIn("catch {", toggle)
        self.assertIn("await loadSavedJobs()", toggle)
        self.assertIn("optimisticallyMoving && !saved", optimistic)
        self.assertIn("delete card.dataset.optimisticSaved", optimistic)
        self.assertIn('card.style.removeProperty("display")', optimistic)

    def test_ignore_is_optimistic_with_reconciliation(self):
        source = (ROOT / "app" / "optimistic-dashboard-actions.tsx").read_text(encoding="utf-8")
        self.assertIn("optimisticIgnoreClick", source)
        self.assertIn('fetch("/api/ignored-jobs", { cache: "no-store" })', source)
        self.assertIn("persisted", source)

    def test_manual_approval_no_longer_reloads_page(self):
        source = (ROOT / "app" / "verification-queue-actions.tsx").read_text(encoding="utf-8")
        self.assertIn("refreshJobsCache", source)
        self.assertIn("ivy-job-radar-approved", source)
        self.assertNotIn("window.location.reload", source)

    def test_approved_job_can_appear_progressively_on_today(self):
        source = (ROOT / "app" / "optimistic-dashboard-actions.tsx").read_text(encoding="utf-8")
        self.assertIn("showApprovedPlaceholder", source)
        self.assertIn("刚刚人工通过", source)
        self.assertIn("详细信息正在后台同步", source)

    def test_component_is_mounted(self):
        layout = (ROOT / "app" / "layout.tsx").read_text(encoding="utf-8")
        self.assertIn("OptimisticDashboardActions", layout)
        self.assertIn("<OptimisticDashboardActions />", layout)


if __name__ == "__main__":
    unittest.main()
