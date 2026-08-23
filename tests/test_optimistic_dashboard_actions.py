import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class OptimisticDashboardActionsTests(unittest.TestCase):
    def test_saved_job_moves_out_of_today_immediately(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertLess(source.index("setSaved((current)", source.index("const toggleSaved")), source.index("await fetch(", source.index("const toggleSaved")))
        self.assertIn("setDailyJobs((current) => current.map", source)

    def test_saved_job_request_failures_restore_the_previous_state(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        toggle = source[source.index("const toggleSaved"):source.index("const openFromJob")]
        self.assertIn("try {", toggle)
        self.assertIn("if (!response.ok) throw new Error", toggle)
        self.assertIn("catch {", toggle)
        self.assertIn("saved: isSaved", toggle)

    def test_ignore_is_optimistic_with_reconciliation(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn("setDailyJobs((current) => current.filter", source)
        self.assertIn("void loadIgnoredJobs()", source)

    def test_manual_approval_no_longer_reloads_page(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn("resolveManualReview", source)
        self.assertIn('fetch("/api/jobs", { cache: "no-store" })', source)
        self.assertNotIn("window.location.reload", source)

    def test_legacy_dom_component_is_not_mounted(self):
        layout = (ROOT / "app" / "layout.tsx").read_text(encoding="utf-8")
        self.assertNotIn("OptimisticDashboardActions", layout)


if __name__ == "__main__":
    unittest.main()
