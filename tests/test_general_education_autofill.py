import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "browser-extension"


class GeneralEducationAutofillTests(unittest.TestCase):
    def test_popup_loads_general_education_addon(self):
        popup = (EXT / "popup.html").read_text(encoding="utf-8")
        addon = (EXT / "education-addon.js").read_text(encoding="utf-8")
        self.assertIn('src="education-addon.js"', popup)
        self.assertIn("IVY_FILL_GENERAL_EDUCATION", addon)
        self.assertIn("/api/autofill/general-profile", addon)
        self.assertIn("education-autofill.js", addon)

    def test_general_pass_uses_nearby_labels_and_school_context(self):
        source = (EXT / "education-autofill.js").read_text(encoding="utf-8")
        self.assertIn("nearbyLabelText", source)
        self.assertIn("educationIndexFromContext", source)
        self.assertIn("contextSignature", source)
        self.assertIn("schoolVariants", source)
        self.assertIn("groupedPeriodKey", source)
        self.assertIn("起止时间", source)
        self.assertIn("研究单位", source)
        self.assertIn("实验室", source)
        self.assertIn("学院", source)
        self.assertIn("degree_type", source)
        self.assertIn("start_month", source)
        self.assertIn("end_month", source)

    def test_general_pass_is_not_site_specific_and_does_not_invent_dates(self):
        source = (EXT / "education-autofill.js").read_text(encoding="utf-8")
        self.assertNotIn("join.qq.com", source)
        self.assertNotIn("bytedance", source.lower())
        self.assertNotIn("alibaba", source.lower())
        self.assertIn("yearOnlyControl", source)
        self.assertIn('entry.degree_type || ""', source)
        self.assertIn('startFull || (yearOnlyControl', source)
        self.assertIn('endFull || (yearOnlyControl', source)


if __name__ == "__main__":
    unittest.main()
