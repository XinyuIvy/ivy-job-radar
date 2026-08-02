import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class BookmarkCaptureSourceTests(unittest.TestCase):
    def test_capture_endpoint_bypasses_verification_and_deduplicates(self):
        route = (ROOT / "app" / "api" / "bookmark-capture" / "route.ts").read_text(encoding="utf-8")

        self.assertIn('source: BOOKMARK_CAPTURE_SOURCE', route)
        self.assertIn('status: BOOKMARK_CAPTURE_STATUS', route)
        self.assertIn('eq(jobs.canonicalUrl, canonicalUrl)', route)
        self.assertIn('eq(jobs.applicationId, applicationId)', route)
        self.assertIn('db.update(jobs)', route)
        self.assertIn('db.insert(jobs)', route)
        self.assertIn('db.delete(ignoredJobs)', route)
        self.assertNotIn('verifyJob(', route)
        self.assertNotIn('jobRequests', route)

    def test_bookmarklet_extracts_jobposting_and_posts_to_private_endpoint(self):
        installer = (ROOT / "app" / "bookmarklet" / "bookmarklet-installer.tsx").read_text(encoding="utf-8")

        self.assertIn('application/ld+json', installer)
        self.assertIn('type==="JobPosting"', installer)
        self.assertIn('form.method="POST"', installer)
        self.assertIn('/api/bookmark-capture', installer)
        self.assertIn('window.location.href', installer)
        self.assertIn('hiringOrganization', installer)

    def test_install_entry_and_scoped_key_are_present(self):
        layout = (ROOT / "app" / "layout.tsx").read_text(encoding="utf-8")
        helpers = (ROOT / "app" / "lib" / "bookmark-capture.ts").read_text(encoding="utf-8")

        self.assertIn('href="/bookmarklet"', layout)
        self.assertIn('BOOKMARK_CAPTURE_STATUS = "开放"', helpers)
        self.assertIn('ivy-job-radar-bookmark-v1:', helpers)
        self.assertIn('secureBookmarkKeyEqual', helpers)
        installer = (ROOT / "app" / "bookmarklet" / "bookmarklet-installer.tsx").read_text(encoding="utf-8")
        self.assertNotIn('IVY_JOB_RADAR_SYNC_TOKEN', installer)


if __name__ == "__main__":
    unittest.main()
