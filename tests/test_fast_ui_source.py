import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class FastUiSourceTests(unittest.TestCase):
    def test_scan_polling_is_view_scoped_and_not_every_second(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('if (view !== "today" || !scanPanelOpen) return;', source)
        self.assertIn('window.setInterval(refreshStatus, 10000)', source)
        self.assertIn('window.setInterval(() => setClock(Date.now()), 5000)', source)
        self.assertNotIn('window.setInterval(() => setClock(Date.now()), 1000)', source)

    def test_heavy_data_is_loaded_by_view(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('if (view !== "applications") return;', source)
        self.assertIn('if (view !== "companies") return;', source)
        self.assertIn('if (view !== "verify") return;', source)
        self.assertIn('["saved", "applications", "companies"].includes(view)', source)

    def test_large_lists_use_pagination(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('JOB_PAGE_SIZE = 20', source)
        self.assertIn('COMPANY_PAGE_SIZE = 20', source)
        self.assertIn('APPLICATION_PAGE_SIZE = 15', source)
        self.assertIn('PaginationControls', source)
        self.assertNotIn('setVisibleJobCount', source)
        self.assertNotIn('再显示 20 个岗位', source)

    def test_common_mutations_are_optimistic(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('setForm(null);\n    try {', source)
        self.assertIn('const savedSnapshot = saved;', source)
        self.assertLess(source.index('setSaved((current)', source.index('const toggleSaved')), source.index('await fetch(', source.index('const toggleSaved')))
        self.assertIn('setTasks((current) => current.map', source)

    def test_application_save_does_not_scan_full_table(self):
        route = (ROOT / "app" / "api" / "applications" / "route.ts").read_text(encoding="utf-8")
        self.assertIn('candidateCondition', route)
        self.assertIn('.where(candidateCondition)', route)
        self.assertNotIn('const rows = await db.select().from(applications);', route)

    def test_jobs_get_does_not_write_legacy_seed_rows(self):
        route = (ROOT / "app" / "api" / "jobs" / "route.ts").read_text(encoding="utf-8")
        self.assertNotIn('initialJobs', route)
        self.assertNotIn('seedInitialJobs', route)
        self.assertIn('export async function GET()', route)
        self.assertIn('const db = await getDb();', route)

    def test_jobs_response_carries_saved_state_and_uses_indexed_deduplication(self):
        route = (ROOT / "app" / "api" / "jobs" / "route.ts").read_text(encoding="utf-8")
        client = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('saved: savedIds.has(row.id)', route)
        self.assertIn('deduplicateDisplayedJobs', route)
        self.assertIn('buildTrackedApplicationMatcher', route)
        self.assertNotIn('result.findIndex((candidate) => sameDisplayedJob', route)
        self.assertIn('setSaved(rows.filter((row) => row.saved).map((row) => row.id))', client)
        self.assertNotIn('fetch("/api/saved-jobs", { cache: "no-store" })', client)


if __name__ == "__main__":
    unittest.main()
