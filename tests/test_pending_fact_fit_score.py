import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PendingFactFitScoreTests(unittest.TestCase):
    def test_score_uses_explainable_fact_classifications(self):
        source = (ROOT / "app" / "lib" / "application-fit-score.ts").read_text(encoding="utf-8")
        for classification in [
            'Direct: 1',
            '"Credential Direct": 1',
            '"Strong Transferable": 0.76',
            '"Coursework Match": 0.58',
            'Adjacent: 0.28',
            '"No Evidence": 0',
        ]:
            self.assertIn(classification, source)
        self.assertIn("evidenceCoverage", source)
        self.assertIn("directCoverage", source)
        self.assertIn("transferableCoverage", source)
        self.assertIn("cvCoverage", source)
        self.assertIn("gapRisk", source)
        self.assertIn("unsupported / total >= 0.4", source)

    def test_scores_compact_favorites_with_fact_master_analysis(self):
        component = (ROOT / "app" / "pending-application-fit-scores.tsx").read_text(encoding="utf-8")
        dashboard = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        route = (ROOT / "app" / "api" / "cv-tailor" / "job" / "route.ts").read_text(encoding="utf-8")
        self.assertIn('[data-fact-fit-job]', component)
        self.assertIn('/api/cv-tailor/job?jobId=', component)
        self.assertIn('fetch("/api/cv-tailor/analyze"', component)
        self.assertIn("事实库评分中", component)
        self.assertIn("Direct", component)
        self.assertIn("可迁移", component)
        self.assertIn("当前 CV", component)
        self.assertIn("Gap 风险", component)
        self.assertIn("MAX_CONCURRENT = 2", component)
        self.assertNotIn("CACHE_TTL_MS", component)
        self.assertIn("重新评分", component)
        self.assertIn("clearCache(jobId)", component)
        self.assertIn("/api/cv-tailor/job-score?jobId=", component)
        self.assertIn('fetch("/api/cv-tailor/job-score"', component)
        self.assertIn("待补完 JD", component)
        self.assertIn("<CandidateFactFitScores />", dashboard)
        self.assertIn('data-fact-fit-job={entry.job.id}', dashboard)
        self.assertIn("IntersectionObserver", component)
        self.assertIn('rootMargin: "600px"', component)
        self.assertIn('ivy-job-radar-candidate-rendered', component)
        self.assertNotIn("MutationObserver", component)
        for token in ["getChatGPTUser", "getDb", "jobs", "jobId", "extractCoreJobDescription", "inferTrack"]:
            self.assertIn(token, route)

    def test_fact_scores_are_persisted_until_an_explicit_rescore(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "job-score" / "route.ts").read_text(encoding="utf-8")
        schema = (ROOT / "db" / "schema.ts").read_text(encoding="utf-8")
        runtime = (ROOT / "db" / "index.ts").read_text(encoding="utf-8")
        migration = (ROOT / "drizzle" / "0017_odd_morgan_stark.sql").read_text(encoding="utf-8")
        for token in ["getChatGPTUser", "jobFactScores", "savedJobs", "onConflictDoUpdate"]:
            self.assertIn(token, route)
        self.assertIn('sqliteTable("job_fact_scores"', schema)
        self.assertIn("CREATE TABLE IF NOT EXISTS job_fact_scores", runtime)
        self.assertIn("CREATE TABLE `job_fact_scores`", migration)

    def test_fact_sources_are_cached_without_calling_openai(self):
        route = (ROOT / "app" / "api" / "cv-tailor" / "analyze" / "route.ts").read_text(encoding="utf-8")
        self.assertIn("PRIVATE_FILE_CACHE_TTL_MS", route)
        self.assertIn("readPrivateFileCached", route)
        self.assertNotIn("OPENAI_API_KEY", route)


if __name__ == "__main__":
    unittest.main()
