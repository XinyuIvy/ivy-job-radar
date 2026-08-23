import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class SavedJobsSourceTests(unittest.TestCase):
    def test_route_exposes_authoritative_get_post_and_delete_handlers(self):
        route = (ROOT / "app" / "api" / "saved-jobs" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("export async function GET()", route)
        self.assertIn("export async function POST", route)
        self.assertIn("export async function DELETE", route)
        self.assertIn("listSavedJobs(await getD1())", route)
        self.assertIn("saveJob(await getD1()", route)
        self.assertIn("deleteSavedJob(await getD1()", route)

    def test_store_uses_a_unique_insert_and_only_deletes_the_saved_relation(self):
        store = (ROOT / "app" / "lib" / "saved-jobs-store.ts").read_text(encoding="utf-8")
        self.assertIn("ON CONFLICT(job_id) DO NOTHING", store)
        self.assertIn("SELECT id FROM jobs WHERE id = ?", store)
        self.assertIn("DELETE FROM saved_jobs WHERE job_id = ?", store)
        self.assertNotIn("DELETE FROM jobs", store)


if __name__ == "__main__":
    unittest.main()
