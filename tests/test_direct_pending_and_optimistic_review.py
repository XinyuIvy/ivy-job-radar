import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class DirectPendingAndOptimisticReviewTests(unittest.TestCase):
    def test_bookmark_creates_only_a_favorite(self):
        capture = (ROOT / "app" / "bookmarklet" / "capture" / "page.tsx").read_text(encoding="utf-8")
        installer = (ROOT / "app" / "bookmarklet" / "bookmarklet-installer.tsx").read_text(encoding="utf-8")
        self.assertIn('fetch("/api/saved-jobs"', capture)
        self.assertNotIn('fetch("/api/applications"', capture)
        self.assertNotIn('status: "准备材料"', capture)
        self.assertIn("已加入收藏", capture)
        self.assertIn("保存到收藏", installer)
        self.assertIn("确认并保存", capture)
        self.assertIn("confirmedFields: true", capture)
        self.assertIn('const popupName="ivy_job_radar_capture_"', installer)

    def test_manual_approval_is_optimistic_and_does_not_reload_page(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn("setRequests((current) => current.filter", source)
        self.assertIn("setQuality((current) =>", source)
        self.assertIn("resolveManualReview", source)
        self.assertNotIn("window.location.reload()", source)


if __name__ == "__main__":
    unittest.main()
