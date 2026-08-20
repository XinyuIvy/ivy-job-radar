import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class AutofillManualSelectionPersistenceTests(unittest.TestCase):
    def test_manual_application_selection_is_reused_when_filling(self):
        popup = (ROOT / "browser-extension" / "popup.js").read_text(encoding="utf-8")
        self.assertIn("let selectedApplicationRowId = 0", popup)
        self.assertIn("selectedApplicationRowId = applicationId", popup)
        self.assertIn("currentContext?.matched && currentContext?.application?.id", popup)
        self.assertIn("selectedApplicationRowId || candidateSelect.value || 0", popup)
        self.assertIn("fetchApplicationPacket(stored.ivyRadarConfig, context)", popup)

    def test_matched_context_blocks_manual_fallback_race(self):
        popup = (ROOT / "browser-extension" / "popup.js").read_text(encoding="utf-8")
        fallback = (ROOT / "browser-extension" / "manual-fallback.js").read_text(encoding="utf-8")
        self.assertIn('contextBox.dataset.matched = context?.matched ? "true" : "false"', popup)
        self.assertIn('if (context.dataset.matched === "true") return;', fallback)

    def test_fill_count_is_described_as_form_controls_and_requires_review(self):
        popup = (ROOT / "browser-extension" / "popup.js").read_text(encoding="utf-8")
        self.assertIn("已写入 ${fillResult.filled} 个表单控件", popup)
        self.assertIn("请逐栏检查后手动提交", popup)


if __name__ == "__main__":
    unittest.main()
