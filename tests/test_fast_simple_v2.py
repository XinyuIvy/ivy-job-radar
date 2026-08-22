import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class FastSimpleV2Tests(unittest.TestCase):
    def test_primary_navigation_and_filters_are_progressively_disclosed(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('type View = "today" | "saved" | "applications" | "tools"', source)
        for label in [">今日</button>", ">候选</button>", ">申请</button>", ">工具</button>", ">我的</button>"]:
            self.assertIn(label, source)
        self.assertIn('const [filtersOpen, setFiltersOpen] = useState(false);', source)
        self.assertIn('数据 / AI', source)
        self.assertIn('医药 / 生物统计', source)
        self.assertIn('清除筛选', source)
        self.assertIn('求职工具', source)

    def test_heavy_panels_and_search_work_are_lazy(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('useDeferredValue(jobQuery)', source)
        self.assertIn('if (view !== "today" || !scanPanelOpen) return;', source)
        self.assertIn('if (view !== "applications" || !applicationInsightsOpen) return;', source)
        self.assertIn('JOB_SESSION_CACHE_TTL_MS = 5 * 60 * 1000', source)
        self.assertIn('readJobSessionCache()', source)
        self.assertIn('ivy-job-radar:pending-refresh', source)

    def test_jobs_api_uses_candidate_indexes_and_warm_cache(self):
        route = (ROOT / "app" / "api" / "jobs" / "route.ts").read_text(encoding="utf-8")
        self.assertIn('VISIBLE_JOBS_CACHE_MS = 2000', route)
        self.assertIn('Promise.all([', route)
        self.assertIn('byStableId', route)
        self.assertIn('jobDisplayIdentityKey', route)
        self.assertIn('inArray(applications.status, hiddenStatuses)', route)
        self.assertIn('saved: savedIds.has(row.id)', route)
        self.assertNotIn('hiddenApplications.some((application)', route)
        self.assertNotIn('rows.findIndex((candidate)', route)

    def test_d1_initialization_has_version_fast_path_and_hot_indexes(self):
        source = (ROOT / "db" / "index.ts").read_text(encoding="utf-8")
        self.assertIn('RUNTIME_SCHEMA_VERSION', source)
        self.assertIn("SELECT value FROM app_meta WHERE key = 'schema_version'", source)
        self.assertIn('const knownColumns = new Map<string, Set<string>>();', source)
        self.assertIn('applications_status_updated_idx', source)
        self.assertIn('jobs_status_discovered_idx', source)
        self.assertIn('jobs_region_track_score_idx', source)

    def test_obsolete_global_pollers_are_not_mounted(self):
        layout = (ROOT / "app" / "layout.tsx").read_text(encoding="utf-8")
        self.assertNotIn('<JobDataCache />', layout)
        self.assertNotIn('<PendingJobVisibility />', layout)
        self.assertNotIn('<OptimisticDashboardActions />', layout)
        live_sync = (ROOT / "app" / "pending-application-live-sync.tsx").read_text(encoding="utf-8")
        self.assertNotIn('new MutationObserver', live_sync)
        self.assertNotIn('setInterval', live_sync)
        verification = (ROOT / "app" / "verification-queue-actions.tsx").read_text(encoding="utf-8")
        self.assertIn('verifyViewActive()', verification)
        self.assertIn('now - lastRunAt < 1000', verification)

    def test_candidate_enhancements_avoid_redundant_reads_and_eager_scoring(self):
        cv_actions = (ROOT / "app" / "application-cv-actions.tsx").read_text(encoding="utf-8")
        self.assertIn('data-application-row-id', (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8"))
        self.assertNotIn('fetch("/api/applications"', cv_actions)
        fit = (ROOT / "app" / "pending-application-fit-scores.tsx").read_text(encoding="utf-8")
        self.assertIn('new IntersectionObserver', fit)
        self.assertIn('rootMargin: "300px 0px"', fit)
        self.assertNotIn('attributeFilter: ["class", "href"]', fit)
        nav = (ROOT / "app" / "navigation-state-persistence.tsx").read_text(encoding="utf-8")
        self.assertNotIn('new MutationObserver', nav)


if __name__ == "__main__":
    unittest.main()
