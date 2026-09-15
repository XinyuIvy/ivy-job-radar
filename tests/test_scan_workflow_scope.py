"""Daily collection must not be coupled to unrelated application contracts."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ScanWorkflowScopeTests(unittest.TestCase):
    def test_scanner_keeps_relevant_tests_and_fails_on_errors(self):
        source = (ROOT / ".github/workflows/daily-us-jobscan.yml").read_text()
        step = source.split("- name: Run scanner fixture tests", 1)[1].split("- name:", 1)[0]
        self.assertIn("python -m unittest", step)
        for name in ["company_portal_scan", "split_json_batches", "publish_us_scan_progress", "verify_application_id", "merge_china_sources", "salary_policy", "scan_workflow_scope"]:
            self.assertIn(f"tests.test_{name}", step)
        for unsafe in ["discover", "continue-on-error", "|| true", "test_autofill", "test_cv_prebuild", "test_application_archive"]:
            self.assertNotIn(unsafe, step)

    def test_full_suite_is_retained_separately(self):
        source = (ROOT / ".github/workflows/pr-python-tests.yml").read_text()
        self.assertIn("python -m unittest discover -s tests -p 'test_*.py'", source)
        self.assertIn("pull_request:", source)
        self.assertIn("push:", source)
        self.assertIn("branches: [main]", source)
        for path in ["app/**", "db/**", "docs/**", "browser-extension/**", "tests/**"]:
            self.assertIn(path, source)


if __name__ == "__main__":
    unittest.main()
