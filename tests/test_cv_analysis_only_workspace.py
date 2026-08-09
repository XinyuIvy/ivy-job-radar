import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CvAnalysisOnlyWorkspaceTests(unittest.TestCase):
    def test_workspace_shows_complete_analysis_categories(self):
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        for phrase in ["全部 JD 原子要求", "母版已覆盖", "事实支持缺口", "仅相邻经验", "无事实支持", "逐条处理", "推荐项目"]:
            self.assertIn(phrase, client)
        self.assertIn("事实库回答", client)
        self.assertIn("当前 CV 片段回答", client)
        self.assertIn("No Evidence 不生成修改", client)
        self.assertNotIn("创建 GitHub PR", client)
        self.assertNotIn("下载 Markdown", client)


if __name__ == "__main__":
    unittest.main()
