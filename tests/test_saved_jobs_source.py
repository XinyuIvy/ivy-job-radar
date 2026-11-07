import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class SavedJobsSourceTests(unittest.TestCase):
    def test_route_exposes_authoritative_get_post_and_delete_handlers(self):
        route = (ROOT / "app" / "api" / "saved-jobs" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("export async function GET()", route)
        self.assertIn("export async function POST", route)
        self.assertIn("export async function PUT", route)
        self.assertIn("export async function DELETE", route)
        self.assertIn("listSavedJobs(await getD1())", route)
        self.assertIn("const database = await getD1()", route)
        self.assertIn("saveJob(database", route)
        self.assertIn("deleteSavedJob(database", route)
        self.assertIn("updateSavedJobCvSelection", route)

    def test_saved_job_template_selection_is_only_persisted_when_moving_to_pending(self):
        component = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        route = (ROOT / "app" / "api" / "saved-jobs" / "route.ts").read_text(encoding="utf-8")
        favorites_start = component.index('className="compact-candidate-row favorites"')
        favorites_end = component.index('</article>', favorites_start)
        favorites = component[favorites_start:favorites_end]
        self.assertNotIn("修改母版", favorites)
        self.assertIn("进入待申请", favorites)
        self.assertIn("persistSavedJobCvSelection(job, language, templateFile)", component)
        self.assertIn('method: "PUT"', component)
        self.assertIn("updateSavedJobCvSelection", route)
        self.assertIn("frozenApplicationPreserved", route)
        self.assertNotIn("cv_base.tex", route)

    def test_store_uses_a_unique_insert_and_only_deletes_the_saved_relation(self):
        store = (ROOT / "app" / "lib" / "saved-jobs-store.ts").read_text(encoding="utf-8")
        self.assertIn("ON CONFLICT(job_id) DO NOTHING", store)
        self.assertIn("WHERE EXISTS (SELECT 1 FROM jobs WHERE id = ?)", store)
        self.assertIn("RETURNING id, job_id AS jobId", store)
        self.assertIn("DELETE FROM saved_jobs WHERE job_id = ?", store)
        self.assertNotIn("DELETE FROM jobs", store)


if __name__ == "__main__":
    unittest.main()
