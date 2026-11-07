import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ApplicationArchiveSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.helper = (ROOT / "app" / "lib" / "application-archive.ts").read_text(encoding="utf-8")
        cls.shared = (ROOT / "app" / "lib" / "cv-prompt-v194.ts").read_text(encoding="utf-8")
        cls.route = (ROOT / "app" / "api" / "cv-tailor" / "archive" / "route.ts").read_text(encoding="utf-8")

    def test_archive_uses_stable_id_and_private_repository(self):
        self.assertIn("stableArchiveId", self.route)
        self.assertIn("APP-${newYorkYear()}", self.helper)
        self.assertIn("XinyuIvy/job-application-archive", self.helper)
        self.assertIn("Create application bundle", self.route)
        self.assertIn("commitFilesAtomically", self.route)

    def test_bundle_freezes_complete_manual_review_inputs(self):
        for filename in [
            "application_record.yaml", "jd_snapshot.md", "jd_requirements.json", "match_packet.json",
            "fact_master_snapshot.md", "cv_display_rules_snapshot.yaml", "canonical_project_index.jsonl",
            "canonical_fact_index.jsonl", "canonical_capability_index.jsonl", "canonical_concept_index.jsonl",
            "canonical_relation_index.jsonl", "canonical_retrieval_index.jsonl",
            "canonical_current_addendum.jsonl", "cv_base.tex", "chat_prompt.txt",
        ]:
            self.assertIn(filename, self.helper)

    def test_direct_submission_freezes_jd_source_cv_pdf_and_autofill_packet(self):
        bookmark = (ROOT / "app" / "bookmarklet" / "capture" / "page.tsx").read_text(encoding="utf-8")
        parser = (ROOT / "app" / "lib" / "template-autofill-packet.ts").read_text(encoding="utf-8")
        for phrase in [
            "freezeSubmittedTemplate", "submitted_template_freeze.json",
            "cv_submitted_${archiveId}.pdf", "application_autofill_${archiveId}.json",
            'encoding: "base64"', "frozenResumeVersion",
        ]:
            self.assertIn(phrase, self.route)
        self.assertIn('fetch("/api/cv-tailor/archive"', bookmark)
        self.assertIn("freezeSubmittedTemplate: true", bookmark)
        self.assertIn('input.provenance || "frozen_submitted_template"', parser)

    def test_applied_job_template_editor_replaces_only_the_frozen_cv(self):
        dashboard = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        for phrase in [
            "修改已申请岗位的 CV 母版", "saveAppliedCvSelection",
            "replaceSubmittedTemplate: true", "保存并冻结新母版",
            "岗位 JD 和 APP-ID 不变",
        ]:
            self.assertIn(phrase, dashboard)
        for phrase in [
            "replaceSubmittedTemplate?: boolean", "replacingSubmittedTemplate",
            "Replace frozen submitted template CV", "replacedSubmittedTemplate",
            "existingJdSnapshot ||",
        ]:
            self.assertIn(phrase, self.route)

    def test_formal_and_prebuild_prompts_share_v194_contract(self):
        prebuild = (ROOT / "app" / "lib" / "cv-prebuild-bundle.ts").read_text(encoding="utf-8")
        self.assertIn('CV_PROMPT_VERSION = "prompt-v1.9.4-site.3"', self.shared)
        self.assertIn("buildCvPromptV194SharedContract", self.helper)
        self.assertIn("buildCvPromptV194SharedContract", prebuild)
        self.assertIn("CV_PREBUILD_PROMPT_VERSION = CV_PROMPT_VERSION", prebuild)
        self.assertIn("prompt_version: ${yamlString(CV_PROMPT_VERSION)}", self.helper)
        self.assertIn("prompt_source_sha256", self.helper)

    def test_v194_integration_does_not_start_automatic_generation(self):
        pause = (ROOT / "app" / "lib" / "cv-prebuild-pause.ts").read_text(encoding="utf-8")
        dashboard = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn("CV_PREBUILD_AUTOMATION_PAUSED = true", pause)
        self.assertIn('code: "CV_AUTOMATION_PAUSED"', pause)
        self.assertIn("if (CV_PREBUILD_AUTOMATION_PAUSED) return;", dashboard)
        for name in ["queue", "prepare", "chat", "regenerate-pending"]:
            route = (ROOT / "app" / "api" / "cv-prebuild" / name / "route.ts").read_text(encoding="utf-8")
            self.assertIn("CV_PREBUILD_AUTOMATION_PAUSED", route)
            self.assertIn("CV_AUTOMATION_PAUSED_PAYLOAD", route)

    def test_v194_foregrounds_explicit_preferred_and_bonus_items(self):
        for phrase in [
            "明确优先/加分项必须单独、突出地审计",
            "把最强证据放在个人简介、专业能力或靠前经历中",
            "证据不足时，在审校记录中明确保留为 gap",
            "JD 没有明确优先项时不得自行制造",
        ]:
            self.assertIn(phrase, self.shared)

    def test_v194_uses_fixed_spine_and_job_specific_project_sections(self):
        for phrase in [
            "个人简介/Summary → 教育背景/Education → 专业能力/Professional Skills",
            "下一节必须是独立的实习/工作经历节",
            "项目经历是否拆成多个 section、如何分组以及每个 section 的名称",
            "不得强制合并成单一“研究经历”或“相关项目”",
            "如果一个 section 跨页",
            "不写“续”、Continued、cont.",
        ]:
            self.assertIn(phrase, self.shared)

    def test_v194_requires_three_papers_and_substantive_second_page_depth(self):
        for phrase in [
            "样本数、患者数、观测数、脑区数、体素数等规模数字不是固定必写项",
            "专有数据集名称默认不在可见 CV 中显示",
            "CV 必须列出至少三篇",
            "第二页有效正文占用深度必须严格超过 75%",
            "不得加入弱相关项目、虚构事实或拉长空话",
        ]:
            self.assertIn(phrase, self.shared)

    def test_v194_contains_confirmed_chinese_terminology(self):
        for phrase in [
            "脑区皮层厚度", "联合纵向混合模型", "日历外划分（Temporal Validation）",
            "基于模型依赖度（Model Reliance）的变量重要性",
            "配对比较识别到 3 个跨模型显著不同的脑区",
            "自助法（Bootstrap）", "二次型区间",
        ]:
            self.assertIn(phrase, self.shared)

    def test_v194_layout_contract_covers_visual_feedback(self):
        for phrase in [
            "姓名必须使用实际可用且视觉上明确的粗体",
            "标题后的实习生/第一作者/通讯作者/合作者等身份、地点、日期一律常规字重",
            "教育条目之间有一致正间距", "技能行之间有一致正间距",
            "项目标题与第一条 bullet 之间有小的正间距", "bullet 之间有小且一致的正间距",
            "项目与项目之间的间距明显大于项目内部间距",
            "论文/展示/荣誉条目间距为正且不大于普通 bullet 间距",
            "中文不得出现异常拉伸的字间距",
        ]:
            self.assertIn(phrase, self.shared)

    def test_v194_requires_two_page_render_and_visual_checks(self):
        for phrase in [
            "PDF 必须恰好两页", "LuaLaTeX 连续编译两次", "pdfinfo", "pdftotext", "pdffonts",
            "渲染两页并逐页目视检查", "文本可提取", "跨页标题精确重复",
        ]:
            self.assertIn(phrase, self.shared)

    def test_selected_template_language_is_an_explicit_prompt_authority(self):
        for phrase in ["输出语言：${languageLabel}", "已确认母版：\\`${templateFile}\\`", "冻结语言与母版"]:
            self.assertIn(phrase, self.helper)
        self.assertIn("language: ArchiveLanguage", self.helper)
        self.assertIn("templateFile: string", self.helper)
        self.assertIn("buildChatPrompt(archiveId, path, jd, language, templateFile)", self.route)
        self.assertIn("buildChatPrompt(archiveId, path, frozenJd, language, templateFile)", self.route)

    def test_existing_archive_never_silently_reuses_a_different_template(self):
        for phrase in [
            'existingArchiveTextFile(archiveApiRoot, path, "application_record.yaml", archiveToken)',
            'yamlScalar(existingApplicationRecord, "language")',
            'yamlScalar(existingApplicationRecord, "cv_template_path")',
            "const templateMatches = existingLanguage === language && existingTemplatePath === templatePath",
            "CV_TEMPLATE_CHANGE_AFTER_FINALIZATION", "refrozen: true",
        ]:
            self.assertIn(phrase, self.route)

    def test_prompt_uses_application_id_and_safe_pdf_workflow(self):
        for phrase in [
            "cv_customized_${archiveId}.tex", "cv_customized_${archiveId}.pdf",
            "cv_customized_${archiveId}.txt", "cv_build_manifest_${archiveId}.json",
            "cv_submitted_${archiveId}.pdf", "Build customized CV PDF", "scripts/build_cv.sh",
            "LuaLaTeX", "automatic_tex_generation_authorized: false",
            "local_chat_pdf_preview_authorized: true", "不能写入任何仓库",
        ]:
            self.assertIn(phrase, self.helper)

    def test_existing_archive_gets_current_prompt_without_rewriting_snapshot(self):
        for phrase in [
            "const existingPrompt = await existingArchiveTextFile", "jd_snapshot.md",
            "const frozenJd = fullJdFromSnapshot(existingJdSnapshot)",
            "const currentPrompt = buildChatPrompt(archiveId, path, frozenJd, language, templateFile)",
            "prompt: currentPrompt", "promptContractUpdated: existingPrompt !== currentPrompt",
        ]:
            self.assertIn(phrase, self.route)

    def test_prompt_embeds_complete_confirmed_jd(self):
        for phrase in [
            "BEGIN CONFIRMED FULL JD", "END CONFIRMED FULL JD", "${confirmedFullJd}",
            "jd_snapshot.md 从第一行读到 EOF", "绝对不能替代完整 JD",
        ]:
            self.assertIn(phrase, self.helper)

    def test_archive_stops_when_private_repo_is_missing(self):
        for phrase in ["ARCHIVE_REPOSITORY_REQUIRED", "ARCHIVE_WRITE_PERMISSION_REQUIRED", "请检查该凭据是否包含这个私有仓库"]:
            self.assertIn(phrase, self.route)

    def test_jd_and_template_are_human_confirmed_before_archive(self):
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        for phrase in ["jdOverride?: string", 'const jd = jdOverride || extractCoreJobDescription(job?.description || "").text']:
            self.assertIn(phrase, self.route)
        for phrase in ['type Stage = "loading" | "review"', "确认并编辑完整 JD", "确认母版与 JD 并生成申请档案", "selectedTemplateKey", "jdOverride: jd", "CV_TEMPLATE_REQUIRED"]:
            self.assertIn(phrase, client)

    def test_auto_read_jd_never_skips_human_review(self):
        client = (ROOT / "app" / "cv-tailor" / "cv-tailor-client.tsx").read_text(encoding="utf-8")
        self.assertIn('setStage("review")', client)
        self.assertIn("系统已读取到 JD", client)
        self.assertNotIn("void createArchive(result)", client)

    def test_contract_records_completed_repository_initialization(self):
        contract = (ROOT / "docs" / "APPLICATION_ARCHIVE_CONTRACT.md").read_text(encoding="utf-8")
        self.assertIn("private archive repository initialized", contract)
        self.assertIn("2026-08-12", contract)


if __name__ == "__main__":
    unittest.main()
