from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "merge_china_sources.py"
SPEC = importlib.util.spec_from_file_location("merge_china_sources", MODULE_PATH)
assert SPEC and SPEC.loader
MERGER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MERGER)


class MergeChinaSourcesTests(unittest.TestCase):
    def test_prefers_captured_full_jd_and_preserves_sources(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            scan_dir = Path(directory)
            url = "https://example.cn/jobs/1"
            (scan_dir / "china_jobs_latest.json").write_text(
                json.dumps([{"company": "示例", "title": "数据科学家", "job_url": url, "score": 50, "source": "公开索引"}]),
                encoding="utf-8",
            )
            (scan_dir / "china_local_import_latest.json").write_text(
                json.dumps(
                    [
                        {
                            "company": "示例",
                            "title": "数据科学家",
                            "canonical_url": url,
                            "score": 70,
                            "source": "人工捕获",
                            "status": "已捕获完整JD",
                            "full_description": "要求博士，熟悉 R 和 Python。",
                        }
                    ],
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            jobs, summary = MERGER.run(scan_dir)
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["score"], 70)
        self.assertEqual(set(jobs[0]["sources"]), {"公开索引", "人工捕获"})
        self.assertEqual(summary["matched_jobs"], 1)
        self.assertEqual(summary["source_counts"]["zhaopin_apify_jobs_latest.json"], 0)


if __name__ == "__main__":
    unittest.main()
