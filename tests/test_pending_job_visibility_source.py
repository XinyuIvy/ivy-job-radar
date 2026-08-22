import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PendingJobVisibilitySourceTests(unittest.TestCase):
    def test_pending_visibility_is_server_authoritative_without_global_poller(self):
        route = (ROOT / "app" / "api" / "jobs" / "route.ts").read_text(encoding="utf-8")
        layout = (ROOT / "app" / "layout.tsx").read_text(encoding="utf-8")

        self.assertIn('"准备材料"', route)
        self.assertIn('byStableId', route)
        self.assertIn('byRole', route)
        self.assertIn('sameLogicalJob(row, application)', route)
        self.assertIn('trackedIds', route)
        self.assertIn('!activeJobStatuses.has(row.status) || !trackedIds.has(row.id)', route)
        self.assertNotIn('<PendingJobVisibility />', layout)

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
