import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]


class RejectedApplicationVisibilityTests(unittest.TestCase):
    def test_rejected_applications_are_separate_from_submitted_applications(self):
        dashboard = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")

        self.assertIn('submittedApplications = applicationsList.filter((item) => item.status === "已申请")', dashboard)
        self.assertIn('rejectedApplications = applicationsList.filter((item) => item.status === "拒绝")', dashboard)
        self.assertIn('setMessage("已从“我的申请”移出，记录保留在“拒绝记录”中。")', dashboard)
        self.assertIn("保存并移出我的申请", dashboard)

    def test_detail_editor_returns_every_saved_status_to_the_pending_list(self):
        page = (ROOT / "app" / "applications" / "[applicationId]" / "page.tsx").read_text(encoding="utf-8")
        editor = (ROOT / "app" / "applications" / "[applicationId]" / "application-record-editor.tsx").read_text(encoding="utf-8")

        self.assertIn("<ApplicationRecordEditor", page)
        self.assertIn('router.replace("/")', editor)
        self.assertIn('view: "saved"', editor)
        self.assertIn('candidateBucket: "pending"', editor)
        self.assertIn("保存并移出我的申请", editor)

    def test_detail_editor_updates_company_and_title_together(self):
        page = (ROOT / "app" / "applications" / "[applicationId]" / "page.tsx").read_text(encoding="utf-8")
        editor = (ROOT / "app" / "applications" / "[applicationId]" / "application-record-editor.tsx").read_text(encoding="utf-8")
        route = (ROOT / "app" / "api" / "applications" / "route.ts").read_text(encoding="utf-8")

        self.assertIn("initialCompany={application.company}", page)
        self.assertIn("公司名称", editor)
        self.assertIn("company: nextCompany, title: nextTitle", editor)
        self.assertIn('"company",', route)
        self.assertIn('"title",', route)

    def test_status_change_is_preserved_in_history(self):
        route = (ROOT / "app" / "api" / "applications" / "route.ts").read_text(encoding="utf-8")

        self.assertIn("applicationStatusEvents", route)
        self.assertIn("payload.status !== existing.status", route)
        self.assertIn("occurredAt: now", route)


if __name__ == "__main__":
    unittest.main()
