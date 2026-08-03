import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class PrivateCvSourceLoadingTests(unittest.TestCase):
    def test_source_route_uses_authenticated_github_contents_api(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "source" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("api.github.com/repos/XinyuIvy/CV/contents", route)
        self.assertIn("CV_GITHUB_TOKEN", route)
        self.assertIn("CV_TOKEN_REQUIRED", route)
        self.assertNotIn("raw.githubusercontent.com/XinyuIvy/CV", route)

    def test_analysis_route_uses_same_private_source(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("api.github.com/repos/XinyuIvy/CV/contents", route)
        self.assertIn("CV_GITHUB_TOKEN", route)
        self.assertIn("CV_TOKEN_REQUIRED", route)
        self.assertNotIn("raw.githubusercontent.com/XinyuIvy/CV", route)


if __name__ == "__main__":
    unittest.main()
