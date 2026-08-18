import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PendingJobVisibilitySourceTests(unittest.TestCase):
    def test_pending_applications_are_hidden_from_today_by_logical_identity(self):
        component = (ROOT / "app" / "pending-job-visibility.tsx").read_text(encoding="utf-8")
        layout = (ROOT / "app" / "layout.tsx").read_text(encoding="utf-8")

        self.assertIn('row.status === "准备材料"', component)
        self.assertIn('sameLogicalJob(row, identity)', component)
        self.assertIn('a.job-link', component)
        self.assertIn('locationParts.join("·")', component)
        self.assertIn('card.style.setProperty("display", "none", "important")', component)
        self.assertIn('<PendingJobVisibility />', layout)

    def test_jobs_api_excludes_pending_and_submitted_jobs_by_stable_identity(self):
        route = (ROOT / "app" / "api" / "jobs" / "route.ts").read_text(encoding="utf-8")

        self.assertIn('"准备材料"', route)
        self.assertIn('hiddenApplications.some((application) => sameLogicalJob(row, application))', route)
        self.assertIn('!activeJobStatuses.has(row.status) || !isTrackedApplication(row)', route)
        self.assertNotIn('appliedFingerprints', route)

    def test_application_post_uses_case_insensitive_logical_identity(self):
        route = (ROOT / "app" / "api" / "applications" / "route.ts").read_text(encoding="utf-8")
        identity = (ROOT / "app" / "lib" / "job-identity.ts").read_text(encoding="utf-8")

        self.assertIn('sameLogicalJob(row, incoming)', route)
        self.assertIn('normalize(row.title) === normalize(payload.title)', route)
        self.assertIn('extractStableJobId(left.jobUrl, left.applicationId)', identity)
        self.assertIn('normalizeJobIdentityText(left.title)', identity)
        self.assertIn('.toLowerCase()', identity)
        self.assertIn('return NextResponse.json(duplicate, { status: 200 })', route)


if __name__ == "__main__":
    unittest.main()
