import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CvPrebuildPhase3SourceTests(unittest.TestCase):
    def test_openai_key_stays_server_side_and_cost_boundary_is_explicit(self):
        helper = (ROOT / "app" / "lib" / "openai-cv-prebuilder.ts").read_text(encoding="utf-8")
        prepare = (ROOT / "app" / "api" / "cv-prebuild" / "prepare" / "route.ts").read_text(encoding="utf-8")
        queue = (ROOT / "app" / "api" / "cv-prebuild" / "queue" / "route.ts").read_text(encoding="utf-8")
        client = (ROOT / "app" / "cv-prebuild" / "[jobId]" / "cv-prebuild-workspace.tsx").read_text(encoding="utf-8")
        self.assertIn("env.OPENAI_API_KEY", prepare)
        self.assertIn("env.OPENAI_API_KEY", queue)
        self.assertNotIn("VITE_OPENAI_API_KEY", "\n".join([helper, prepare, queue, client]))
        self.assertIn('DEFAULT_CV_MODEL = "gpt-5.6-terra"', helper)
        self.assertIn('DEFAULT_CV_SERVICE_TIER = "flex"', helper)
        self.assertIn('RETRY_CV_SERVICE_TIER = "default"', helper)
        self.assertIn("requestedServiceTier", prepare)
        self.assertIn("generation.row?.attempts", prepare)
        self.assertIn('request.headers.get("x-cv-maintenance-token")', prepare)
        self.assertIn("maintenanceAuthorized", prepare)
        self.assertIn("只有首次生成", client)

    def test_favorites_are_free_and_pending_jobs_enter_the_automatic_queue(self):
        saved = (ROOT / "app" / "api" / "saved-jobs" / "route.ts").read_text(encoding="utf-8")
        queue = (ROOT / "app" / "api" / "cv-prebuild" / "queue" / "route.ts").read_text(encoding="utf-8")
        dashboard = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        application_detail = (ROOT / "app" / "applications" / "[applicationId]" / "page.tsx").read_text(encoding="utf-8")
        self.assertIn('created: result.outcome === "created"', saved)
        self.assertNotIn("initializeCvPrebuildJob", saved)
        self.assertIn("initializeCvPrebuildJob", queue)
        self.assertIn("const moveFavoriteToPending", dashboard)
        self.assertIn('fetch("/api/cv-prebuild/queue"', dashboard)
        self.assertIn("nextQueuedCvJobId", dashboard)
        self.assertIn("进入待申请", dashboard)
        self.assertIn("取消收藏", dashboard)
        self.assertIn("打开 CV Chat", application_detail)
        self.assertIn("查看 CV 进度", application_detail)
        self.assertIn("/api/cv-prebuild/status?jobId=", dashboard)
        self.assertIn("templateTrack", dashboard)
        self.assertIn("选择生成语言和 CV 模板", dashboard)
        self.assertIn("CV_TEMPLATE_LANGUAGE_STORAGE_KEY", dashboard)
        self.assertIn("language,", dashboard)
        self.assertIn("templateTrack,", dashboard)
        self.assertIn("requestedLanguage", queue)
        self.assertIn("selectionChanged", queue)
        self.assertIn("自动生成规则", dashboard)
        self.assertIn("generationRules", dashboard)
        self.assertIn('手动定制 CV', application_detail)
        for label in ["收藏", "待申请", "生成中", "已生成", "需处理"]:
            self.assertIn(label, dashboard)
        self.assertIn("cvPrebuildSummaryBucket", dashboard)
        self.assertIn('/api/cv-prebuild/tasks', dashboard)
        self.assertIn("收藏不会调用 API", dashboard)
        self.assertIn("按顺序生成 CV", dashboard)
        self.assertIn("applicationRowId", saved)
        self.assertIn("db.insert(jobs)", saved)

    def test_cv_task_summary_uses_all_saved_tasks_not_filtered_job_cards(self):
        route = (ROOT / "app" / "api" / "cv-prebuild" / "tasks" / "route.ts").read_text(encoding="utf-8")
        dashboard = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn("savedRows.flatMap", route)
        self.assertIn("prebuildByJobId", route)
        self.assertIn("reconcileCvPrebuildRun", route)
        self.assertIn("needsLegacyFailureDiagnosis", route)
        self.assertIn('["agent_queued", "agent_running"]', route)
        self.assertIn('eq(applications.status, "准备材料")', route)
        self.assertIn("const pendingCvJobs = pendingApplications.flatMap", dashboard)

    def test_lost_favorites_can_be_recovered_in_one_batch(self):
        route = (ROOT / "app" / "api" / "cv-prebuild" / "recovery" / "route.ts").read_text(encoding="utf-8")
        dashboard = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn("lastSavedJobId", route)
        self.assertIn("找回刚才未写入后台的收藏", dashboard)
        self.assertIn("恢复到收藏", dashboard)
        self.assertIn("不会调用 CV API", dashboard)
        self.assertIn("PENDING_CV_FAVORITES_STORAGE_KEY", dashboard)

    def test_saved_cv_tasks_bypass_active_job_display_filters(self):
        jobs = (ROOT / "app" / "api" / "jobs" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("activeJobStatuses.has(row.status)", jobs)
        self.assertIn("savedIds.has(row.id)", jobs)
        self.assertIn("isTrackedForToday(row)", jobs)

    def test_each_job_has_authenticated_chat_status_and_private_artifacts(self):
        status = (ROOT / "app" / "api" / "cv-prebuild" / "status" / "route.ts").read_text(encoding="utf-8")
        chat = (ROOT / "app" / "api" / "cv-prebuild" / "chat" / "route.ts").read_text(encoding="utf-8")
        artifact = (ROOT / "app" / "api" / "cv-prebuild" / "artifact" / "route.ts").read_text(encoding="utf-8")
        schema = (ROOT / "db" / "schema.ts").read_text(encoding="utf-8")
        runtime = (ROOT / "db" / "index.ts").read_text(encoding="utf-8")
        for source in [status, chat, artifact]:
            self.assertIn("getChatGPTUser", source)
            self.assertIn("savedJobs", source)
        self.assertIn('sqliteTable("cv_prebuild_messages"', schema)
        self.assertIn("openaiConversationId", schema)
        self.assertIn("const SCHEMA_VERSION = 6", runtime)
        self.assertIn('ensureColumn("cv_prebuild_jobs", "openai_conversation_id"', runtime)
        self.assertIn("needsLegacyFailureDiagnosis", status)
        self.assertIn("failureMessage", status)
        self.assertIn("env.BUCKET", artifact)
        self.assertNotIn("OPENAI_API_KEY", artifact)

    def test_prebuild_remains_temporary_and_never_writes_final_application_files(self):
        helper = (ROOT / "app" / "lib" / "openai-cv-prebuilder.ts").read_text(encoding="utf-8")
        chat = (ROOT / "app" / "api" / "cv-prebuild" / "chat" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("Do not write to GitHub", helper)
        self.assertNotIn("commitPrivateRepositoryFiles", chat)
        self.assertNotIn("cv_customized_", chat)
        self.assertNotIn("cv_submitted_", chat)

    def test_initial_cv_input_is_bounded_but_the_private_archive_stays_complete(self):
        helper = (ROOT / "app" / "lib" / "openai-cv-prebuilder.ts").read_text(encoding="utf-8")
        bundle = (ROOT / "app" / "lib" / "cv-prebuild-bundle.ts").read_text(encoding="utf-8")
        dashboard = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        self.assertIn("MAX_CV_AGENT_INPUT_CHARS = 120_000", helper)
        self.assertIn('FALLBACK_CV_MODEL = "gpt-5.6-luna"', helper)
        self.assertIn("MAX_CV_FALLBACK_INPUT_CHARS = 30_000", helper)
        self.assertIn("FALLBACK_CV_MAX_OUTPUT_TOKENS = 32_000", helper)
        self.assertIn("compactCvBundleFilesForAgent(input.files, input.maxInputChars)", helper)
        self.assertIn('"agent_context_manifest.md"', helper)
        self.assertIn("The private archive retains every complete frozen source file.", helper)
        self.assertIn('CV_PREBUILD_PROMPT_VERSION = "cv-prebuilder-v9-language-specific-contracts"', bundle)
        rules = (ROOT / "app" / "lib" / "cv-generation-rules.ts").read_text(encoding="utf-8")
        self.assertIn("资深 HR 与招聘评估者", rules)
        self.assertIn("初稿生成、资深 HR 差距复核与事实补强", rules)
        self.assertIn("PDF 首次生成后，如果两页内仍有明显且合理的空余位置", rules)
        self.assertIn("按照与 JD 和岗位画像的相关性补入已经核验的代表性论文", rules)
        self.assertIn("招聘信号优先级", rules)
        self.assertIn("最可能三个理由", rules)
        self.assertIn("10 秒招聘官扫描测试", rules)
        self.assertIn("CHINESE_CV_GENERATION_RULES", rules)
        self.assertIn("ENGLISH_CV_GENERATION_RULES", rules)
        self.assertIn("中文母语招聘官", rules)
        self.assertIn("idiomatic U.S. English resume", rules)
        self.assertIn("cvLanguageGenerationRules(input.identity.language)", bundle)
        self.assertIn("最终交付必须同时通过五个门槛", rules)
        self.assertIn("本轮输入、关键判断、实际修改、通过或未通过", rules)
        self.assertIn("application_decision.json", helper)
        self.assertIn("MAX_AUTOMATIC_CV_ATTEMPTS = 7", dashboard)
        self.assertIn("canAutomaticallyRetryCv(job)", dashboard)
        self.assertIn("PREBUILD_REPOSITORY_ACCESS_REQUIRED", dashboard)
        self.assertIn("retryDelayMs", dashboard)
        self.assertIn("cvPrebuildAttempts", dashboard)
        self.assertNotIn("AUTO_REQUEUED_CV_JOBS_STORAGE_KEY", dashboard)

    def test_transient_failures_self_heal_with_a_fresh_low_cost_conversation(self):
        recovery = (ROOT / "app" / "lib" / "cv-prebuild-recovery.ts").read_text(encoding="utf-8")
        store = (ROOT / "app" / "lib" / "cv-prebuild-store.ts").read_text(encoding="utf-8")
        status = (ROOT / "app" / "api" / "cv-prebuild" / "status" / "route.ts").read_text(encoding="utf-8")
        tasks = (ROOT / "app" / "api" / "cv-prebuild" / "tasks" / "route.ts").read_text(encoding="utf-8")
        maintenance = (ROOT / "app" / "api" / "cv-prebuild" / "maintenance" / "route.ts").read_text(encoding="utf-8")
        for token in [
            "MAX_AUTOMATIC_CV_ATTEMPTS = 7",
            "server_is_overloaded|rate_limit_exceeded|server_error|max_output_tokens|OPENAI_",
            "createOpenAiConversation",
            "FALLBACK_CV_MODEL",
            "FALLBACK_CV_MAX_OUTPUT_TOKENS",
            "MAX_CV_FALLBACK_INPUT_CHARS",
            "useHighCapacityRecovery",
            "reasoningEffort: \"medium\"",
            "claimCvPrebuildFallback",
            "activeCvStatuses",
            "Date.parse(left.updatedAt) - Date.parse(right.updatedAt)",
            "slice(0, 1)",
            "releaseStaleCvPrebuildClaim",
        ]:
            self.assertIn(token, recovery)
        self.assertIn("attempts = attempts + 1", store)
        self.assertIn("created_at = ?", store)
        self.assertIn("latest?.applicationRowId ?? null", store)
        self.assertIn("MAX_OPENAI_RESPONSE_AGE_MS", (ROOT / "app" / "lib" / "cv-prebuild-runtime.ts").read_text(encoding="utf-8"))
        prepare = (ROOT / "app" / "api" / "cv-prebuild" / "prepare" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("sameCompanyRole(application, job)", prepare)
        self.assertIn("DUPLICATE_APPLICATION_HISTORY", prepare)
        self.assertIn("AND NOT EXISTS", store)
        self.assertIn("pending_application.status = '准备材料'", store)
        self.assertIn("recoverTransientCvJobs", status)
        self.assertIn("recoverTransientCvJobs", tasks)
        self.assertIn('eq(applications.status, "准备材料")', status)
        self.assertIn('eq(applications.status, "准备材料")', tasks)
        self.assertIn("CV_MAINTENANCE_TOKEN", maintenance)
        self.assertIn("reconcileCvPrebuildRun", maintenance)
        self.assertIn("recoverTransientCvJobs", maintenance)
        self.assertIn("onConflictDoNothing", maintenance)
        self.assertIn('status: "收藏"', maintenance)
        self.assertIn("SET application_row_id = ?", maintenance)
        self.assertNotIn("getChatGPTUser", maintenance)


if __name__ == "__main__":
    unittest.main()
