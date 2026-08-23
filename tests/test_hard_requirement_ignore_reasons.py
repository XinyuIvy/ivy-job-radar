import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class HardRequirementIgnoreReasonTests(unittest.TestCase):
    def test_hard_requirement_reasons_are_available(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        for label in [
            "经验年限或职级不符合",
            "学历或专业要求不符合",
            "工作授权或 sponsorship 不符合",
            "地点或工作方式不符合",
            "必备技能、证书或语言不符合",
            "其他硬性条件不符合",
        ]:
            self.assertIn(label, source)

    def test_hard_requirement_mismatch_is_not_learning_eligible(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('exclusionType: "hard_requirement_mismatch"', source)
        self.assertIn("learningEligible: false", source)
        self.assertNotIn('/api/screening-learning', source)

    def test_hard_requirement_actions_are_native_react_without_reload(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn("hardRequirementOpen", source)
        self.assertNotIn("window.location.reload", source)
        self.assertNotIn("MutationObserver", source)


if __name__ == "__main__":
    unittest.main()
