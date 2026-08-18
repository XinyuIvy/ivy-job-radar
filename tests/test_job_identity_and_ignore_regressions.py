import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class JobIdentityAndIgnoreRegressionTests(unittest.TestCase):
    def test_identity_preserves_posting_ids_and_never_merges_distinct_ids(self):
        helper = (ROOT / "app" / "lib" / "job-identity.ts").read_text(encoding="utf-8")
        self.assertIn('"gh_jid"', helper)
        self.assertIn('"currentjobid"', helper)
        self.assertIn('"requisitionid"', helper)
        self.assertIn("if (leftId && rightId) return leftId === rightId", helper)
        tracking_block = helper.split("const TRACKING_QUERY_KEYS", 1)[1].split("]);", 1)[0]
        self.assertNotIn('"gh_jid"', tracking_block)
        self.assertNotIn('"jobid"', tracking_block)

    def test_same_company_different_titles_remain_separate(self):
        helper = (ROOT / "app" / "lib" / "job-identity.ts").read_text(encoding="utf-8")
        self.assertIn("leftTitle === rightTitle", helper)
        self.assertIn("!isPlaceholderJobTitle(left.title)", helper)
        self.assertIn("!isPlaceholderJobTitle(right.title)", helper)

    def test_display_dedup_is_separate_but_keeps_distinct_requisitions(self):
        display = (ROOT / "app" / "lib" / "job-display-identity.ts").read_text(encoding="utf-8")
        jobs_route = (ROOT / "app" / "api" / "jobs" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("sameDisplayedJob", display)
        self.assertIn("sameLogicalJob", display)
        self.assertIn("extractStableJobId", display)
        self.assertIn("if (leftId && rightId) return false", display)
        self.assertIn("sameDisplayedJob(candidate, row)", jobs_route)
        self.assertIn("sameLogicalJob(row, incomingIdentity)", jobs_route)

    def test_all_ingestion_paths_use_stable_identity(self):
        for relative in [
            "app/api/jobs/route.ts",
            "app/api/jobs/import/route.ts",
            "app/api/bookmark-capture/route.ts",
            "app/api/manual-review/route.ts",
            "app/api/applications/route.ts",
        ]:
            source = (ROOT / relative).read_text(encoding="utf-8")
            self.assertIn("sameLogicalJob", source, relative)
        for relative in [
            "app/api/jobs/route.ts",
            "app/api/jobs/import/route.ts",
            "app/api/bookmark-capture/route.ts",
            "app/api/manual-review/route.ts",
        ]:
            source = (ROOT / relative).read_text(encoding="utf-8")
            self.assertIn("makeDistinctStoredJobUrl", source, relative)

    def test_application_tracking_does_not_merge_distinct_postings_by_title_alone(self):
        route = (ROOT / "app" / "api" / "applications" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("sameLogicalJob(row, incoming)", route)
        self.assertNotIn("normalize(row.company) === companyKey", route)
        self.assertNotIn("normalize(row.title) === titleKey", route)

    def test_bookmarklet_prefers_job_specific_title_and_id_fields(self):
        source = (ROOT / "app" / "bookmarklet" / "bookmarklet-installer.tsx").read_text(encoding="utf-8")
        title_line = next(line for line in source.splitlines() if line.startswith("const title="))
        self.assertLess(title_line.index('[data-testid*="job-title"]'), title_line.index("'h1'"))
        self.assertIn('data-automation-id="jobPostingHeader"', title_line)
        self.assertIn('params.get("currentJobId")', source)
        self.assertIn('params.get("postingId")', source)
        self.assertIn('params.get("vacancyId")', source)

    def test_hard_requirement_ignore_waits_for_persistence_then_reloads(self):
        source = (ROOT / "app" / "hard-requirement-ignore-actions.tsx").read_text(encoding="utf-8")
        self.assertIn("await submitHardRequirement(company, title, jobUrl, reason)", source)
        self.assertIn("jobUrl,", source)
        self.assertIn("window.location.reload()", source)
        self.assertIn("正在保存忽略原因并从岗位列表移除", source)
        self.assertLess(
            source.index("await submitHardRequirement(company, title, jobUrl, reason)"),
            source.index("closeDialog(dialog)"),
        )


if __name__ == "__main__":
    unittest.main()
