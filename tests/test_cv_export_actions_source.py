import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CvExportActionsSourceTests(unittest.TestCase):
    def test_copy_has_fallback_and_visible_feedback(self):
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        self.assertIn("navigator.clipboard?.writeText", client)
        self.assertIn('document.execCommand("copy")', client)
        self.assertIn("已复制到剪贴板", client)
        self.assertIn("复制失败", client)

    def test_markdown_and_latex_are_downloadable(self):
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        self.assertIn("downloadText", client)
        self.assertIn("下载 Markdown", client)
        self.assertIn("下载 LaTeX", client)

    def test_publish_has_timeout_errors_and_clickable_pr(self):
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        self.assertIn("AbortController", client)
        self.assertIn("45000", client)
        self.assertIn("打开 GitHub PR", client)
        self.assertIn('aria-live="polite"', client)


if __name__ == "__main__":
    unittest.main()
