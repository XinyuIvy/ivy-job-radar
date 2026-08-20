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
            "cv_display_rules_snapshot.yaml",
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
            "不能写入任何仓库",
        ]:
            self.assertIn(phrase, helper)
        self.assertIn("automatic_tex_generation_authorized: false", helper)

    def test_prompt_freezes_authoritative_cv_display_rules(self):
        helper = (ROOT / "app" / "lib" / "application-archive.ts").read_text(encoding="utf-8")
        self.assertIn("master/project-evidence/CV_DISPLAY_RULES.yaml", helper)
        self.assertIn("cv_display_rules_snapshot.yaml", helper)
        self.assertIn("用户确认的权威 CV 展示边界", helper)
        self.assertIn("不得因为 JD 关键词", helper)

    def test_selected_template_language_is_an_explicit_prompt_authority(self):
        helper = (ROOT / "app" / "lib" / "application-archive.ts").read_text(encoding="utf-8")
        route = (ROOT / "app" / "api" / "cv-tailor" / "archive" / "route.ts").read_text(encoding="utf-8")
        for phrase in [
            "本次已确认的 CV 语言与母版（一级硬约束）",
            "输出语言：${languageLabel}",
            "已确认母版：\\`${templateFile}\\`",
            "最终 CV 的 Summary/个人简介、技能、经历、项目、论文/荣誉等自然语言内容必须使用中文",
            "不得因为 JD 是英文",
            "冻结母版与本次选择不一致",
        ]:
            self.assertIn(phrase, helper)
        self.assertIn("language: ArchiveLanguage", helper)
        self.assertIn("templateFile: string", helper)
        self.assertIn("buildChatPrompt(archiveId, path, jd, language, templateFile)", route)
        self.assertIn("buildChatPrompt(archiveId, path, frozenJd, language, templateFile)", route)

    def test_existing_archive_never_silently_reuses_a_different_template(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "archive" / "route.ts").read_text(encoding="utf-8")
        for phrase in [
            'existingArchiveTextFile(archiveApiRoot, path, "application_record.yaml", archiveToken)',
            'yamlScalar(existingApplicationRecord, "language")',
            'yamlScalar(existingApplicationRecord, "cv_template_path")',
            "const templateMatches = existingLanguage === language && existingTemplatePath === templatePath",
            "archiveFileExists",
            "CV_TEMPLATE_CHANGE_AFTER_FINALIZATION",
            "Re-freeze application bundle ${archiveId} with ${templateFile}",
            "refrozen: true",
            "previousLanguage: existingLanguage",
            "previousTemplatePath: existingTemplatePath",
        ]:
            self.assertIn(phrase, route)
        self.assertIn("cv_customized_${archiveId}.tex", route)
        self.assertIn("cv_submitted_${archiveId}.pdf", route)

    def test_prompt_uses_application_id_in_cv_filenames(self):
        helper = (ROOT / "app" / "lib" / "application-archive.ts").read_text(encoding="utf-8")
        self.assertIn("cv_customized_${archiveId}.tex", helper)
        self.assertIn("cv_customized_${archiveId}.pdf", helper)
        self.assertIn("cv_submitted_${archiveId}.pdf", helper)
        self.assertIn("文件名必须保留完整 application ID", helper)
        self.assertIn("不得简化为 \\`cv_customized.tex\\`", helper)

    def test_prompt_delegates_binary_pdf_build_to_github_actions(self):
        helper = (ROOT / "app" / "lib" / "application-archive.ts").read_text(encoding="utf-8")
        for phrase in [
            "automatic_pdf_compilation_authorized: true",
            "manual_binary_pdf_upload_by_chat_authorized: false",
            "Build customized CV PDF",
            "不要在 Chat 中把 PDF 二进制重新编码成 base64",
            "scripts/build_cv.sh",
            "workflow 成功且这些归档文件确实存在之前，不得声称归档 PDF 已成功生成",
        ]:
            self.assertIn(phrase, helper)

    def test_prompt_uses_lualatex_for_local_and_archived_pdfs(self):
        helper = (ROOT / "app" / "lib" / "application-archive.ts").read_text(encoding="utf-8")
        self.assertIn("LuaLaTeX", helper)
        self.assertNotIn("XeLaTeX", helper)

    def test_prompt_allows_local_pdf_preview_before_archive_write(self):
        helper = (ROOT / "app" / "lib" / "application-archive.ts").read_text(encoding="utf-8")
        for phrase in [
            "local_chat_pdf_preview_authorized: true",
            "local_preview_repository_write_authorized: false",
            "Chat 内 PDF 预览规则",
            "不要只告诉我“编译成功”",
            "PDF定稿",
            "GitHub connector 不能可靠读取二进制 PDF 内容",
            "cv_customized_${archiveId}.txt",
            "cv_build_manifest_${archiveId}.json",
        ]:
            self.assertIn(phrase, helper)

    def test_existing_archive_gets_current_operational_prompt_without_rewriting_matching_snapshot(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "archive" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("const existingPrompt = await existingArchiveTextFile", route)
        self.assertIn("jd_snapshot.md", route)
        self.assertIn("const frozenJd = fullJdFromSnapshot(existingJdSnapshot)", route)
        self.assertIn("const currentPrompt = buildChatPrompt(archiveId, path, frozenJd, language, templateFile)", route)
        self.assertIn("prompt: currentPrompt", route)
        self.assertIn("promptContractUpdated: existingPrompt !== currentPrompt", route)

    def test_prompt_embeds_complete_confirmed_jd_and_treats_summaries_as_secondary(self):
        helper = (ROOT / "app" / "lib" / "application-archive.ts").read_text(encoding="utf-8")
        route = (ROOT / "app" / "api" / "cv-tailor" / "archive" / "route.ts").read_text(encoding="utf-8")
        for phrase in [
            "完整 JD 是本次定制的主输入",
            "BEGIN CONFIRMED FULL JD",
            "END CONFIRMED FULL JD",
            "${confirmedFullJd}",
            "如果 GitHub/connector 返回内容被截断，继续分段读取直到 EOF",
            "绝对不能替代完整 JD",
            "不要只根据 \`jd_requirements.json\` 里的几条 fact / requirement 做匹配",
            "完整 JD 的全部主要板块",
        ]:
            self.assertIn(phrase, helper)
        self.assertIn("buildChatPrompt(archiveId, path, jd, language, templateFile)", route)
        self.assertIn('existingArchiveTextFile(archiveApiRoot, path, "jd_snapshot.md", archiveToken)', route)
        self.assertIn("fullJdFromSnapshot(existingJdSnapshot)", route)

    def test_archive_stops_when_private_repo_is_missing(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "archive" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("ARCHIVE_REPOSITORY_REQUIRED", route)
        self.assertIn("ARCHIVE_WRITE_PERMISSION_REQUIRED", route)
        self.assertIn("请检查该凭据是否包含这个私有仓库", route)

    def test_jd_and_template_are_both_human_confirmed_before_archive(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "archive" / "route.ts").read_text(encoding="utf-8")
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        self.assertIn("jdOverride?: string", route)
        self.assertIn("const jd = jdOverride || job?.description?.trim() || \"\"", route)
        self.assertIn('type Stage = "loading" | "review"', client)
        self.assertIn("确认并编辑完整 JD", client)
        self.assertIn("确认母版与 JD 并生成申请档案", client)
        self.assertIn("selectedTemplateKey", client)
        self.assertIn("CV_TEMPLATE_REQUIRED", client)
        self.assertIn("jdOverride: jd", client)

    def test_auto_read_jd_never_skips_human_review(self):
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        self.assertIn('setStage("review")', client)
        self.assertIn("系统已读取到 JD", client)
        self.assertIn("再核对 JD", client)
        self.assertNotIn("void createArchive(result)", client)
        self.assertIn("只有你确认后才会生成匹配和 Prompt", client)
        self.assertIn("已确认并冻结的输入", client)

    def test_contract_records_completed_repository_initialization(self):
        contract = (ROOT / "docs" / "APPLICATION_ARCHIVE_CONTRACT.md").read_text(encoding="utf-8")
        self.assertIn("private archive repository initialized", contract)
        self.assertIn("2026-08-12", contract)


if __name__ == "__main__":
    unittest.main()
