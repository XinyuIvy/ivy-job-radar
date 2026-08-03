import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CvAnalysisOnlyWorkspaceTests(unittest.TestCase):
    def test_workspace_is_analysis_only(self):
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        self.assertIn("CV 修改总结", client)
        self.assertIn("推荐优先使用的项目", client)
        self.assertIn("母版未覆盖但事实支持", client)
        self.assertNotIn("生成 LaTeX", client)
        self.assertNotIn("创建 GitHub PR", client)
        self.assertNotIn("下载 Markdown", client)
        self.assertNotIn("加入岗位专属草稿", client)


if __name__ == "__main__":
    unittest.main()
