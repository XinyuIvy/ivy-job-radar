import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ApplicationIdRecoverySourceTests(unittest.TestCase):
    def test_archive_id_is_restored_as_a_separate_persistent_field(self):
        schema = (ROOT / "db" / "schema.ts").read_text(encoding="utf-8")
        runtime = (ROOT / "db" / "index.ts").read_text(encoding="utf-8")
        route = (ROOT / "app" / "api" / "applications" / "route.ts").read_text(encoding="utf-8")

        self.assertIn('archiveId: text("archive_id")', schema)
        self.assertIn('ensureColumn("applications", "archive_id"', runtime)
        self.assertIn("resolveApplicationRecordIds", route)
        self.assertIn("ensureAllApplicationRecordIds", route)

    def test_cv_archive_does_not_overwrite_the_employer_requisition_id(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "archive" / "route.ts").read_text(encoding="utf-8")

        self.assertIn("const resolvedIds = resolveApplicationRecordIds(application)", route)
        self.assertIn("externalApplicationId: resolvedIds.applicationId", route)
        self.assertIn(".set({ ...resolvedIds, resumeVersion:", route)
        self.assertNotIn("jobs).set({ applicationId: archiveId", route)

    def test_old_applications_are_searchable_by_the_recovered_app_id(self):
        dashboard = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        detail = (ROOT / "app" / "applications" / "[applicationId]" / "page.tsx").read_text(encoding="utf-8")

        self.assertIn("搜索公司、岗位或 APP 编号", dashboard)
        self.assertIn("item.archiveId", dashboard)
        self.assertIn("系统申请编号", detail)
        self.assertIn("公司职位编号", detail)

    def test_autofill_prefers_the_internal_archive_column(self):
        for relative in [
            "app/api/autofill/application-context/route.ts",
            "app/api/autofill/application-packet/route.ts",
            "app/api/autofill/resume/route.ts",
        ]:
            source = (ROOT / relative).read_text(encoding="utf-8")
            self.assertIn("archiveId", source)


if __name__ == "__main__":
    unittest.main()
