import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ApplicationSavePerformanceTests(unittest.TestCase):
    def test_application_editor_closes_after_core_save_before_background_reconciliation(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn("if (!form || saving) return", source)
        self.assertIn("const submittedForm = form", source)
        self.assertIn("setApplicationsList((current) =>", source)
        self.assertIn("setForm(null)", source)
        self.assertIn("void (async () =>", source)
        self.assertLess(source.index("setForm(null)", source.index("const saveApplication")), source.index('await fetch("/api/applications"', source.index("const saveApplication")))
        self.assertIn("finally {\n      setSaving(false);", source)

    def test_db_schema_initialization_is_shared_within_worker_isolate(self):
        source = (ROOT / "db" / "index.ts").read_text(encoding="utf-8")
        self.assertIn("let schemaInitialization: Promise<void> | null = null", source)
        self.assertIn("if (!schemaInitialization)", source)
        self.assertIn("schemaInitialization = (async () =>", source)
        self.assertIn("await schemaInitialization", source)
        self.assertIn("schemaInitialization = null", source)

    def test_cold_isolates_use_one_durable_schema_version_check(self):
        source = (ROOT / "db" / "index.ts").read_text(encoding="utf-8")
        self.assertIn("const SCHEMA_VERSION = 3", source)
        self.assertIn("const SCHEMA_MARKER", source)
        self.assertIn("SELECT name FROM sqlite_master", source)
        self.assertIn("version?.name === SCHEMA_MARKER", source)
        self.assertIn("CREATE TABLE IF NOT EXISTS ${SCHEMA_MARKER}", source)
        self.assertNotIn("PRAGMA user_version", source)

    def test_scan_status_exists_before_its_incremental_columns_are_checked(self):
        source = (ROOT / "db" / "index.ts").read_text(encoding="utf-8")
        self.assertLess(
            source.index("CREATE TABLE IF NOT EXISTS scan_status"),
            source.index('ensureColumn("scan_status", "phase"'),
        )

    def test_job_api_failures_are_not_rendered_as_an_empty_database(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn('if (!response.ok) throw new Error(`Job request failed with ${response.status}`)', source)
        self.assertIn('setJobsError("岗位读取暂时失败。已有岗位数据仍然保留，请重试。")', source)
        self.assertIn("jobsError ?", source)
        start = source.index('fetch("/api/jobs"', source.index("const usEtaSeconds"))
        self.assertNotIn('(response.ok ? response.json() : [])', source[start:source.index('const loadRequests')])

    def test_application_save_does_not_refetch_all_applications(self):
        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        save_block = source[source.index("const saveApplication"):source.index("const updateForm")]
        self.assertIn("setApplicationsList((current) =>", save_block)
        self.assertNotIn("loadApplications", save_block)


if __name__ == "__main__":
    unittest.main()
