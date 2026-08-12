import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ApplicationArchiveSourceTests(unittest.TestCase):
    def test_archive_uses_stable_id_and_private_repository(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "archive" / "route.ts").read_text(encoding="utf-8")
        helper = (ROOT / "app" / "lib" / "application-archive.ts").read_text(encoding="utf-8")
        self.assertIn("stableArchiveId", route)
        self.assertIn("APP-${newYorkYear()}", helper)
        self.assertIn("XinyuIvy/job-application-archive", helper)
        self.assertIn("Create application bundle", route)
        self.assertIn("commitFilesAtomically", route)

    def test_bundle_freezes_complete_manual_review_inputs(self):
        helper = (ROOT / "app" / "lib" / "application-archive.ts").read_text(encoding="utf-8")
        for filename in [
            "application_record.yaml",
            "jd_snapshot.md",
            "jd_requirements.json",
            "match_packet.json",
            "fact_master_snapshot.md",
            "canonical_project_index.jsonl",
            "canonical_fact_index.jsonl",
            "canonical_capability_index.jsonl",
            "canonical_concept_index.jsonl",
            "canonical_relation_index.jsonl",
            "canonical_retrieval_index.jsonl",
            "cv_base.tex",
            "chat_prompt.txt",
        ]:
            self.assertIn(filename, helper)

    def test_prompt_enforces_human_review_content_first_and_keyword_priority(self):
        helper = (ROOT / "app" / "lib" / "application-archive.ts").read_text(encoding="utf-8")
        for phrase in [
            "初步分类，不是最终结论",
            "每次最多展示 3 至 5 条",
            "JD 中的关键词优先",
            "已有的行业关键词",
            "内容定稿",
            "保持母版",
            "不写入任何仓库",
        ]:
            self.assertIn(phrase, helper)
        self.assertIn("automatic_tex_generation_authorized: false", helper)

    def test_archive_stops_when_private_repo_is_missing(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "archive" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("ARCHIVE_REPOSITORY_REQUIRED", route)
        self.assertIn("ARCHIVE_WRITE_PERMISSION_REQUIRED", route)
        self.assertIn("请检查该凭据是否包含这个私有仓库", route)

    def test_contract_records_completed_repository_initialization(self):
        contract = (ROOT / "docs" / "APPLICATION_ARCHIVE_CONTRACT.md").read_text(encoding="utf-8")
        self.assertIn("private archive repository initialized", contract)
        self.assertIn("2026-08-12", contract)


if __name__ == "__main__":
    unittest.main()
