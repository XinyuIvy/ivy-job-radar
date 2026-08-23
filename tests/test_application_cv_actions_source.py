import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ApplicationCvActionsSourceTests(unittest.TestCase):
    def test_pending_application_rows_link_to_automatic_and_manual_cv_workspaces(self):
        component = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        detail = (ROOT / "app" / "applications" / "[applicationId]" / "page.tsx").read_text(encoding="utf-8")
        layout = (ROOT / "app" / "layout.tsx").read_text(encoding="utf-8")
        self.assertIn('pendingApplications', component)
        self.assertIn('href={`/applications/${entry.application.id}`}', component)
        self.assertIn('手动定制 CV', detail)
        self.assertIn('打开 CV Chat', detail)
        self.assertIn('查看 CV 进度', detail)
        self.assertNotIn('<ApplicationCvActions />', layout)
        self.assertNotIn('href="/cv-tailor"', layout)

    def test_pending_rows_are_direct_detail_links(self):
        component = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('className="compact-candidate-row pending"', component)
        self.assertIn('href={`/applications/${entry.application.id}`}', component)
        self.assertNotIn('data-task-proxy', component)

    def test_cv_workspace_loads_application_and_full_jd(self):
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        route = (ROOT / "app" / "api" / "cv-tailor" / "application" / "route.ts").read_text(encoding="utf-8")
        self.assertIn('applicationId', client)
        self.assertIn('/api/cv-tailor/application', client)
        self.assertIn('job?.description', route)

    def test_automatic_cv_publish_is_disabled(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "publish" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("AUTOMATIC_CV_PUBLISH_DISABLED", route)
        self.assertIn("status: 410", route)
        self.assertNotIn('/pulls', route)


if __name__ == "__main__":
    unittest.main()
