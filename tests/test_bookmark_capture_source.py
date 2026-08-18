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
        self.assertIn('deriveAmbiguousCaptureId', route)
        self.assertIn('description: description || captureId', route)
        self.assertIn('applicationId,', route)
        self.assertIn('db.update(jobs)', route)
        self.assertIn('db.insert(jobs)', route)
        self.assertIn('db.delete(ignoredJobs)', route)
        self.assertNotIn('verifyJob(', route)
        self.assertNotIn('jobRequests', route)

    def test_bookmarklet_extracts_jobposting_and_opens_independent_capture(self):
        installer = (ROOT / "app" / "bookmarklet" / "bookmarklet-installer.tsx").read_text(encoding="utf-8")

        self.assertIn('application/ld+json', installer)
        self.assertIn('type==="JobPosting"', installer)
        self.assertIn('/bookmarklet/capture', installer)
        self.assertIn('window.open(captureUrl.href', installer)
        self.assertIn('popup.postMessage({type:"ivy-job-radar-capture",payload}', installer)
        self.assertIn('event.origin!==captureUrl.origin', installer)
        self.assertIn('window.location.href', installer)
        self.assertIn('hiringOrganization', installer)
        self.assertIn('const captureId=', installer)
        self.assertIn('bookmarkVersion:"v3"', installer)
        self.assertIn('const popupName="ivy_job_radar_capture_"+captureId', installer)
        self.assertNotIn('form.method="POST"', installer)
        self.assertNotIn('encodeURIComponent(JSON.stringify(payload))', installer)

    def test_capture_window_queues_multiple_messages_and_posts_to_private_endpoint(self):
        capture_page = (ROOT / "app" / "bookmarklet" / "capture" / "page.tsx").read_text(encoding="utf-8")

        self.assertIn('event.data?.type !== "ivy-job-radar-capture"', capture_page)
        self.assertIn('const seenMessages = new Set<string>()', capture_page)
        self.assertIn('queue = queue.then(() => save(payload))', capture_page)
        self.assertIn('pendingCount += 1', capture_page)
        self.assertIn('savedCount += 1', capture_page)
        self.assertIn('result.applicationId || payload.applicationId', capture_page)
        self.assertIn('postMessage("ivy-job-radar-ready", "*")', capture_page)
        self.assertIn('fetch("/api/bookmark-capture"', capture_page)
        self.assertIn('"Content-Type": "application/json"', capture_page)
        self.assertNotIn('let received = false', capture_page)
        self.assertNotIn('event.source !== window.opener', capture_page)
        self.assertNotIn('window.location.hash', capture_page)

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
