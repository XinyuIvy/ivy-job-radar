import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CvPrebuildPhase1SourceTests(unittest.TestCase):
    def test_schema_and_safe_runtime_initializer_include_the_state_table(self):
        schema = (ROOT / "db" / "schema.ts").read_text(encoding="utf-8")
        runtime = (ROOT / "db" / "index.ts").read_text(encoding="utf-8")
        migration = (ROOT / "drizzle" / "0013_secret_boom_boom.sql").read_text(encoding="utf-8")
        self.assertIn('sqliteTable("cv_prebuild_jobs"', schema)
        self.assertIn('CREATE TABLE IF NOT EXISTS cv_prebuild_jobs', runtime)
        self.assertIn('const SCHEMA_MARKER = `ivy_schema_v${SCHEMA_VERSION}`', runtime)
        self.assertIn('CREATE TABLE `cv_prebuild_jobs`', migration)
        self.assertNotIn('ALTER TABLE `scan_status`', migration)

    def test_saved_job_route_only_persists_the_favorite(self):
        route = (ROOT / "app" / "api" / "saved-jobs" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("cancelCvPrebuildJob", route)
        self.assertNotIn("initializeCvPrebuildJob", route)
        self.assertNotIn("prebuildStatus", route)
        self.assertNotIn("fetch(", route)
        self.assertNotIn("api.openai.com", route)

    def test_job_cards_render_prebuild_status_badges(self):
        component = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        styles = (ROOT / "app" / "globals.css").read_text(encoding="utf-8")
        self.assertIn("CvPrebuildStatusBadge", component)
        self.assertIn("cvPrebuildStatus", component)
        self.assertIn(".cv-prebuild-badge.blocked", styles)
        self.assertIn(".cv-prebuild-badge.warning", styles)


if __name__ == "__main__":
    unittest.main()
