from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "china_snapshot_import.py"
SPEC = importlib.util.spec_from_file_location("china_snapshot_import", MODULE_PATH)
assert SPEC and SPEC.loader
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)


class ChinaSnapshotImportTests(unittest.TestCase):
    def test_flattens_job_hunting_style_backup(self) -> None:
        payload = {
            "data": {
                "jobs": [
                    {
                        "jobName": "生物统计师",
                        "companyName": "示例药企",
                        "jobUrl": "https://www.zhipin.com/job_detail/abc.html?ka=search",
                        "jobDescription": "要求博士学历，熟悉 R、SAS 和临床试验。",
                        "cityName": "上海",
                    }
                ]
            }
        }
        rows = IMPORTER.flatten_candidates(payload)
        self.assertEqual(len(rows), 1)
        job = IMPORTER.normalize(rows[0], "2026-08-01T00:00:00+00:00", "snapshot")
        self.assertIsNotNone(job)
        assert job is not None
        self.assertEqual(job["company"], "示例药企")
        self.assertEqual(job["source"], "BOSS直聘·人工捕获")
        self.assertEqual(job["canonical_url"], "https://zhipin.com/job_detail/abc.html")
        self.assertIn("SAS", job["skills"])
        self.assertEqual(job["status"], "已捕获完整JD")

    def test_rejects_non_target_and_senior_titles(self) -> None:
        now = "2026-08-01T00:00:00+00:00"
        self.assertIsNone(
            IMPORTER.normalize(
                {"title": "软件工程师", "url": "https://example.cn/1", "description": "博士"},
                now,
                "snapshot",
            )
        )
        self.assertIsNone(
            IMPORTER.normalize(
                {"title": "高级数据科学家", "url": "https://example.cn/2", "description": "博士"},
                now,
                "snapshot",
            )
        )

    def test_reads_csv_and_deduplicates_by_canonical_url(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "jobs.csv").write_text(
                "title,company,url,description,location\n"
                "数据科学家,示例公司,https://jobs.example.cn/1?utm_source=x,要求博士和Python,北京\n",
                encoding="utf-8",
            )
            (root / "jobs.json").write_text(
                json.dumps(
                    [
                        {
                            "title": "数据科学家",
                            "company": "示例公司",
                            "url": "https://jobs.example.cn/1",
                            "description": "要求博士，熟悉 Python、R、因果推断和机器学习。",
                            "location": "北京",
                        }
                    ],
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            jobs, summary = IMPORTER.run([root])
        self.assertEqual(summary["files_scanned"], 2)
        self.assertEqual(summary["matched_jobs"], 1)
        self.assertIn("Causal inference", jobs[0]["skills"])
        self.assertGreater(len(jobs[0]["full_description"]), 20)


if __name__ == "__main__":
    unittest.main()
