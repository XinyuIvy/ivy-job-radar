import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PendingJobVisibilitySourceTests(unittest.TestCase):
    def test_pending_applications_are_hidden_from_today_by_stored_url_then_logical_identity(self):
        component = (ROOT / "app" / "api" / "jobs" / "route.ts").read_text(encoding="utf-8")
        layout = (ROOT / "app" / "layout.tsx").read_text(encoding="utf-8")

        self.assertIn('"准备材料"', component)
        self.assertIn('buildTrackedApplicationMatcher', component)
        self.assertIn('sameLogicalJob(job, candidate)', component)
        self.assertIn('const isTrackedForToday', component)
        self.assertIn('todayEligible: shortlist.eligible && !saved && !tracked', component)
        self.assertIn('Strong posting identity outranks unreliable scraped display fields', (ROOT / "app" / "lib" / "job-identity.ts").read_text(encoding="utf-8"))
        self.assertIn('!sameLogicalJob(job, application) && !sameCompanyRole(job, application)', (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8"))
        self.assertNotIn('<PendingJobVisibility />', layout)

    def test_today_view_excludes_favorites_and_pending_applications(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")

        self.assertIn('function applicationHidesToday(application: Application, job: Job)', source)
        self.assertIn('&& !job.saved', source)
        self.assertIn('&& !saved.includes(job.id)', source)
        self.assertIn(
            '&& !applicationsList.some((application) => applicationHidesToday(application, job))',
            source,
        )
        self.assertIn('[dailyJobs, track, region, saved, applicationsList, view, jobSort, deferredJobQuery]', source)

    def test_jobs_api_excludes_pending_and_submitted_jobs_by_stable_identity(self):
        route = (ROOT / "app" / "api" / "jobs" / "route.ts").read_text(encoding="utf-8")

        self.assertIn('"准备材料"', route)
        self.assertIn('const isTrackedApplication = buildTrackedApplicationMatcher(trackedApplications)', route)
        self.assertIn('todayEligible: shortlist.eligible && !saved && !tracked', route)
        self.assertIn('sameCompanyRole(job, candidate)', route)
        self.assertNotIn('appliedFingerprints', route)

    def test_application_post_uses_logical_identity_and_migrates_legacy_generic_rows(self):
        route = (ROOT / "app" / "api" / "applications" / "route.ts").read_text(encoding="utf-8")
        identity = (ROOT / "app" / "lib" / "job-identity.ts").read_text(encoding="utf-8")

        self.assertIn('sameLogicalJob(row, incoming)', route)
        self.assertIn('isPlaceholderJobTitle(incoming.title)', route)
        self.assertIn('!row.applicationId', route)
        self.assertIn('baseJobPageUrl(row.jobUrl) === baseJobPageUrl(jobUrl)', route)
        self.assertIn('normalize(row.title) === normalize(incoming.title)', route)
        self.assertIn('extractStableJobId(left.jobUrl, left.applicationId)', identity)
        self.assertIn('normalizeJobIdentityText(left.title)', identity)
        self.assertIn('.toLowerCase()', identity)
        self.assertIn('return NextResponse.json(duplicate, { status: 200 })', route)
        self.assertIn('return NextResponse.json(updated, { status: 200 })', route)


if __name__ == "__main__":
    unittest.main()
