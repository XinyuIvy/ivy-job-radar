import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class DirectPendingAndOptimisticReviewTests(unittest.TestCase):
    def test_bookmark_creates_pending_application(self):
        capture = (ROOT / "app" / "bookmarklet" / "capture" / "page.tsx").read_text(encoding="utf-8")
        installer = (ROOT / "app" / "bookmarklet" / "bookmarklet-installer.tsx").read_text(encoding="utf-8")
        self.assertIn('fetch("/api/applications"', capture)
        self.assertIn('status: "准备材料"', capture)
        self.assertIn("不需要核验或人工通过", capture)
        self.assertIn('const popupName="ivy_job_radar_capture_"', installer)

    def test_manual_approval_is_optimistic_and_refreshes_job_cache(self):
        source = (ROOT / "app" / "verification-queue-actions.tsx").read_text(encoding="utf-8")
        self.assertIn('card.style.setProperty("display", "none", "important")', source)
        self.assertIn("refreshJobsCache", source)
        self.assertIn('selectedNav: "今日"', source)
        self.assertIn("window.location.reload()", source)


if __name__ == "__main__":
    unittest.main()
