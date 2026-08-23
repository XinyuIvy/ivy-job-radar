import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CvPrebuildPhase2SourceTests(unittest.TestCase):
    def test_prepare_route_requires_a_real_saved_job_and_complete_jd(self):
        route = (ROOT / "app" / "api" / "cv-prebuild" / "prepare" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("getChatGPTUser", route)
        self.assertIn("Only a saved job can create a PRECV bundle", route)
        self.assertIn('code: "JOB_NOT_SAVED"', route)
        self.assertIn('code: "JD_REQUIRED"', route)
        self.assertIn("activeJobStatuses.has(job.status)", route)

    def test_bundle_freezes_one_cv_commit_and_does_not_create_an_application(self):
        route = (ROOT / "app" / "api" / "cv-prebuild" / "prepare" / "route.ts").read_text(encoding="utf-8")
        bundle = (ROOT / "app" / "lib" / "cv-prebuild-bundle.ts").read_text(encoding="utf-8")
        self.assertIn("const cvCommit = cvMain.commitSha", route)
        self.assertIn("sourcePairs.map", route)
        self.assertIn("sourcePath, cvCommit, cvToken", route)
        self.assertIn("application_id: null", bundle)
        self.assertIn("application_row_id: null", bundle)
        self.assertNotIn("db.insert(applications)", route)
        self.assertNotIn("stableArchiveId", route)

    def test_generation_key_covers_every_frozen_authority(self):
        bundle = (ROOT / "app" / "lib" / "cv-prebuild-bundle.ts").read_text(encoding="utf-8")
        for field in [
            "jobIdentitySha256",
            "jdSha256",
            "templateFile: selection.templateFile",
            "cvCommit: input.cvCommit",
            "factMasterSha: input.factMasterSha",
            "promptVersion",
        ]:
            self.assertIn(field, bundle)
        self.assertIn("ON CONFLICT(generation_key) DO NOTHING", (ROOT / "app" / "lib" / "cv-prebuild-store.ts").read_text(encoding="utf-8"))

    def test_phase_two_never_calls_an_agent_or_exposes_a_private_bundle_url(self):
        route = (ROOT / "app" / "api" / "cv-prebuild" / "prepare" / "route.ts").read_text(encoding="utf-8")
        self.assertNotIn("api.openai.com", route)
        self.assertNotIn("conversation_url", route)
        self.assertNotIn("repositoryUrl", route)
        self.assertNotIn("bundlePath:", route)

    def test_migration_replaces_job_uniqueness_with_generation_history(self):
        migration = (ROOT / "drizzle" / "0014_lonely_riptide.sql").read_text(encoding="utf-8")
        self.assertIn('DROP INDEX `cv_prebuild_jobs_job_id_unique`', migration)
        self.assertIn('CREATE UNIQUE INDEX `cv_prebuild_jobs_pending_job_unique`', migration)
        self.assertIn('WHERE "cv_prebuild_jobs"."generation_key" IS NULL', migration)


if __name__ == "__main__":
    unittest.main()
