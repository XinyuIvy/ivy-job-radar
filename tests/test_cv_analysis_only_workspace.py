import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CvAnalysisOnlyWorkspaceTests(unittest.TestCase):
    def test_workspace_creates_archive_then_hands_off_to_chat(self):
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        for phrase in ["申请档案已创建", "复制 Prompt", "完整 JD", "初步匹配", "Chat 中完成"]:
            self.assertIn(phrase, client)
        self.assertIn("/api/cv-tailor/analyze", client)
        self.assertIn("/api/cv-tailor/archive", client)
        self.assertIn("navigator.clipboard.writeText", client)
        self.assertNotIn("创建 GitHub PR", client)
        self.assertNotIn("下载 Markdown", client)


if __name__ == "__main__":
    unittest.main()
