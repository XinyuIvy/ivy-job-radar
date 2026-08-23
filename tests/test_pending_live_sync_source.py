import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class PendingLiveSyncSourceTests(unittest.TestCase):
    def test_capture_does_not_broadcast_or_persist_a_pending_application(self):
        capture = (ROOT / "app" / "bookmarklet" / "capture" / "page.tsx").read_text(encoding="utf-8")
        self.assertIn('fetch("/api/saved-jobs"', capture)
        self.assertNotIn('new BroadcastChannel(CHANNEL_NAME)', capture)
        self.assertNotIn('type: "ivy-job-radar-pending-created"', capture)
        self.assertNotIn("localStorage.setItem(STORAGE_KEY", capture)

    def test_live_insert_updates_authoritative_react_state(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('payload.type !== "ivy-job-radar-pending-created"', source)
        self.assertIn("setApplicationsList((current) =>", source)
        self.assertIn("current.filter((item) => item.id !== payload.application?.id)", source)
        self.assertNotIn("window.location.reload", source)

    def test_live_sync_has_storage_and_broadcast_fallbacks_without_dom_observer(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('window.addEventListener("storage", storageHandler)', source)
        self.assertIn("new BroadcastChannel(PENDING_CHANNEL_NAME)", source)
        self.assertNotIn("MutationObserver", source)

    def test_legacy_live_sync_component_is_not_mounted(self):
        layout = (ROOT / "app" / "layout.tsx").read_text(encoding="utf-8")
        self.assertNotIn("PendingApplicationLiveSync", layout)


if __name__ == "__main__":
    unittest.main()
