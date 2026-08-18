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

    def test_prompt_uses_application_id_in_cv_filenames(self):
        helper = (ROOT / "app" / "lib" / "application-archive.ts").read_text(encoding="utf-8")
        self.assertIn("cv_customized_${archiveId}.tex", helper)
        self.assertIn("cv_customized_${archiveId}.pdf", helper)
        self.assertIn("cv_submitted_${archiveId}.pdf", helper)
        self.assertIn("文件名必须保留完整 application ID", helper)
        self.assertIn("不得简化为 \\`cv_customized.tex\\`", helper)

    def test_archive_stops_when_private_repo_is_missing(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "archive" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("ARCHIVE_REPOSITORY_REQUIRED", route)
        self.assertIn("ARCHIVE_WRITE_PERMISSION_REQUIRED", route)
        self.assertIn("请检查该凭据是否包含这个私有仓库", route)

    def test_jd_can_be_supplied_or_edited_before_archive(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "archive" / "route.ts").read_text(encoding="utf-8")
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        self.assertIn("jdOverride?: string", route)
        self.assertIn("const jd = jdOverride || job?.description?.trim() || \"\"", route)
        self.assertIn('type Stage = "loading" | "review"', client)
        self.assertIn("确认并编辑完整 JD", client)
        self.assertIn("确认此 JD 并生成申请档案", client)
        self.assertIn("jdOverride: jd", client)

    def test_auto_read_jd_never_skips_human_review(self):
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        self.assertIn('setStage("review")', client)
        self.assertIn("系统已读取到 JD。请先核对", client)
        self.assertNotIn("void createArchive(result)", client)
        self.assertIn("只有你确认后才会生成匹配和 Prompt", client)
        self.assertIn("已确认并冻结的 JD", client)

    def test_contract_records_completed_repository_initialization(self):
        contract = (ROOT / "docs" / "APPLICATION_ARCHIVE_CONTRACT.md").read_text(encoding="utf-8")
        self.assertIn("private archive repository initialized", contract)
        self.assertIn("2026-08-12", contract)


if __name__ == "__main__":
    unittest.main()
