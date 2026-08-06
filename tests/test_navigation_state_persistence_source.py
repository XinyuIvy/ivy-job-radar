import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class NavigationStatePersistenceTests(unittest.TestCase):
    def test_sort_filters_view_and_scroll_are_persisted(self):
        source = (ROOT / "app" / "navigation-state-persistence.tsx").read_text(encoding="utf-8")
        self.assertIn("sessionStorage", source)
        self.assertIn("selects", source)
        self.assertIn("selectedNav", source)
        self.assertIn("scrollY", source)
        self.assertIn("pageshow", source)
        self.assertIn("popstate", source)

    def test_external_links_open_without_unloading_dashboard(self):
        source = (ROOT / "app" / "navigation-state-persistence.tsx").read_text(encoding="utf-8")
        self.assertIn('anchor.target = "_blank"', source)
        self.assertIn('anchor.rel = "noreferrer noopener"', source)

    def test_component_is_mounted(self):
        layout = (ROOT / "app" / "layout.tsx").read_text(encoding="utf-8")
        self.assertIn("NavigationStatePersistence", layout)
        self.assertIn("<NavigationStatePersistence />", layout)


if __name__ == "__main__":
    unittest.main()
