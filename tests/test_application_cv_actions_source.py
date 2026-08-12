import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ApplicationCvActionsSourceTests(unittest.TestCase):
    def test_pending_application_cards_link_to_cv_workspace(self):
        component = (ROOT / "app" / "application-cv-actions.tsx").read_text(encoding="utf-8")
        layout = (ROOT / "app" / "layout.tsx").read_text(encoding="utf-8")
        self.assertIn('row.status === "准备材料"', component)
        self.assertIn('/cv-tailor?applicationId=', component)
        self.assertIn('定制 CV', component)
        self.assertIn('<ApplicationCvActions />', layout)
        self.assertNotIn('href="/cv-tailor"', layout)

    def test_task_action_is_merged_into_edit_application_modal(self):
        component = (ROOT / "app" / "application-cv-actions.tsx").read_text(encoding="utf-8")
        self.assertIn('新增任务', component)
        self.assertIn('编辑申请状态', component)
        self.assertIn('data-task-proxy', component)
        self.assertIn('activeTaskButton?.click()', component)

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
