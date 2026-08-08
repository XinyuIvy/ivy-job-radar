import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class PendingLiveSyncSourceTests(unittest.TestCase):
    def test_capture_broadcasts_and_persists_created_application(self):
        capture = (ROOT / "app" / "bookmarklet" / "capture" / "page.tsx").read_text(encoding="utf-8")
        self.assertIn('new BroadcastChannel(CHANNEL_NAME)', capture)
        self.assertIn('type: "ivy-job-radar-pending-created"', capture)
        self.assertIn("localStorage.setItem(STORAGE_KEY", capture)
        self.assertIn("announcePending(applicationResult)", capture)

    def test_pending_view_prepends_new_card_without_switching_views(self):
        source = (ROOT / "app" / "pending-application-live-sync.tsx").read_text(encoding="utf-8")
        self.assertIn("isPendingViewVisible", source)
        self.assertIn("list.prepend(makeCard(application))", source)
        self.assertNotIn("scrollIntoView", source)
        self.assertNotIn("window.location.reload", source)

    def test_live_sync_has_storage_and_server_reconciliation_fallbacks(self):
        source = (ROOT / "app" / "pending-application-live-sync.tsx").read_text(encoding="utf-8")
        self.assertIn('window.addEventListener("storage", storageHandler)', source)
        self.assertIn('fetch("/api/applications", { cache: "no-store" })', source)
        self.assertIn("reconcilePendingFromServer", source)
        self.assertIn("MutationObserver", source)
        self.assertIn('window.addEventListener("focus", focusHandler)', source)

    def test_live_sync_is_mounted(self):
        layout = (ROOT / "app" / "layout.tsx").read_text(encoding="utf-8")
        self.assertIn("PendingApplicationLiveSync", layout)


if __name__ == "__main__":
    unittest.main()
