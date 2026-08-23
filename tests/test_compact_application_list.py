import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CompactApplicationListTests(unittest.TestCase):
    def test_application_tracker_uses_three_column_rows(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        start = source.index('<div className="compact-application-list"')
        end = source.index('</section>', start)
        tracker = source[start:end]

        self.assertIn('role="columnheader">公司', tracker)
        self.assertIn('role="columnheader">岗位', tracker)
        self.assertIn('role="columnheader">申请日期', tracker)
        self.assertIn('item.appliedDate || "未记录"', tracker)
        self.assertNotIn("item.notes", tracker)
        self.assertNotIn("item.nextAction", tracker)
        self.assertNotIn("openTask(item)", tracker)
        self.assertNotIn("编辑记录", tracker)

    def test_application_rows_have_dense_single_line_styles(self):
        styles = (ROOT / "app" / "globals.css").read_text(encoding="utf-8")
        self.assertIn(".compact-application-row", styles)
        self.assertIn("white-space: nowrap", styles)
        self.assertIn("grid-template-columns", styles)


if __name__ == "__main__":
    unittest.main()
