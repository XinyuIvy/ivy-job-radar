import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class NavigationStatePersistenceTests(unittest.TestCase):
    def test_sort_filters_view_and_scroll_are_persisted(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn("sessionStorage", source)
        self.assertIn("NAVIGATION_STORAGE_KEY", source)
        self.assertIn("scrollByView", source)
        self.assertIn('window.addEventListener("scroll", rememberScroll', source)
        self.assertNotIn("MutationObserver", source)

    def test_external_links_open_without_unloading_dashboard(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('target="_blank"', source)
        self.assertIn('rel="noreferrer"', source)

    def test_legacy_dom_observer_is_not_mounted(self):
        layout = (ROOT / "app" / "layout.tsx").read_text(encoding="utf-8")
        self.assertNotIn("NavigationStatePersistence", layout)


if __name__ == "__main__":
    unittest.main()
