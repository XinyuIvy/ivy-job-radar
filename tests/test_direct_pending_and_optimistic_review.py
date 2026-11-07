import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class DirectPendingAndOptimisticReviewTests(unittest.TestCase):
    def test_bookmark_can_create_a_pending_or_applied_record(self):
        capture = (ROOT / "app" / "bookmarklet" / "capture" / "page.tsx").read_text(encoding="utf-8")
        route = (ROOT / "app" / "api" / "bookmark-capture" / "route.ts").read_text(encoding="utf-8")
        installer = (ROOT / "app" / "bookmarklet" / "bookmarklet-installer.tsx").read_text(encoding="utf-8")
        self.assertIn("const saved = await saveJob", route)
        self.assertNotIn('fetch("/api/saved-jobs"', capture)
        self.assertIn('fetch("/api/applications"', capture)
        self.assertIn('target === "applied" ? "已申请" : "准备材料"', capture)
        self.assertIn("保存到待申请", capture)
        self.assertIn("保存到已申请", capture)
        self.assertIn("可以选择保存到待申请或已申请", installer)
        self.assertIn("确认并保存岗位", capture)
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
