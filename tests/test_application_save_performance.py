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
        self.assertLess(source.index("setForm(null)", source.index("const saveApplication")), source.index("await loadApplications()", source.index("const saveApplication")))
        self.assertIn("finally {\n      setSaving(false);", source)

    def test_db_schema_initialization_is_shared_within_worker_isolate(self):
        source = (ROOT / "db" / "index.ts").read_text(encoding="utf-8")
        self.assertIn("let schemaInitialization: Promise<void> | null = null", source)
        self.assertIn("if (!schemaInitialization)", source)
        self.assertIn("schemaInitialization = (async () =>", source)
        self.assertIn("await schemaInitialization", source)
        self.assertIn("schemaInitialization = null", source)


if __name__ == "__main__":
    unittest.main()
