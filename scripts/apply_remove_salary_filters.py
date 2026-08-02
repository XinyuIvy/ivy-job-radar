#!/usr/bin/env python3
"""One-time migration: remove every China salary eligibility filter."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def path(relative: str) -> Path:
    return ROOT / relative


def read(relative: str) -> str:
    return path(relative).read_text(encoding="utf-8")


def write(relative: str, content: str) -> None:
    path(relative).write_text(content, encoding="utf-8")


def replace_once(relative: str, old: str, new: str) -> None:
    content = read(relative)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {relative}, found {count}: {old[:120]!r}")
    write(relative, content.replace(old, new, 1))


def regex_once(relative: str, pattern: str, replacement: str) -> None:
    content = read(relative)
    updated, count = re.subn(pattern, replacement, content, count=1, flags=re.DOTALL)
    if count != 1:
        raise RuntimeError(f"Expected one regex match in {relative}, found {count}: {pattern}")
    write(relative, updated)


def restore_direct_sources() -> None:
    pairs = (
        ("local-collector/_boss_radar_impl.py", "local-collector/boss_radar.py"),
        ("scripts/_china_scan_impl.py", "scripts/china_scan.py"),
        ("scripts/_company_portal_scan_impl.py", "scripts/company_portal_scan.py"),
        ("tests/_test_boss_radar_legacy.py", "tests/test_boss_radar.py"),
        ("tests/_test_china_scan_legacy.py", "tests/test_china_scan.py"),
    )
    for source, target in pairs:
        source_path = path(source)
        if not source_path.exists():
            raise RuntimeError(f"Missing temporary source needed for restoration: {source}")
        path(target).write_bytes(source_path.read_bytes())
        source_path.unlink()


def remove_runtime_filters() -> None:
    regex_once(
        "local-collector/boss_radar.py",
        r"\n    salary_floor = monthly_salary_floor_k\(salary_text\(row\)\)\n"
        r"    if salary_floor is not None and salary_floor < 20:\n"
        r"        return \"salary_below_20k\"\n",
        "\n",
    )
    regex_once(
        "local-collector/boss_radar.py",
        r"(?m)^(\s*)if \(salary_floor is not None and salary_floor < 20\) or "
        r"\(years is not None and years > 3\):\n\s+continue$",
        r"\1if years is not None and years > 3:\n\1    continue",
    )

    replace_once("scripts/china_scan.py", '    "salary_below_20k",\n', "")
    regex_once(
        "scripts/china_scan.py",
        r"    salary_floor = monthly_salary_floor_k\(combined\)\n"
        r"    if salary_floor is not None and salary_floor < 20:\n"
        r"        if rejection_stats is not None:\n"
        r"            rejection_stats\[\"salary_below_20k\"\] \+= 1\n"
        r"        return None\n"
        r"    if salary_floor is None and rejection_stats is not None:\n",
        "    salary_floor = monthly_salary_floor_k(combined)\n"
        "    if salary_floor is None and rejection_stats is not None:\n",
    )

    regex_once(
        "scripts/company_portal_scan.py",
        r"(?m)^\s*and \(salary_floor is None or salary_floor >= 20\)\n",
        "",
    )

    route = read("app/api/jobs/import/route.ts")
    route = re.sub(
        r"\nfunction monthlySalaryFloorK\(content: string\) \{.*?\n\}\n\nfunction isEligibleChinaImport",
        "\nfunction isEligibleChinaImport",
        route,
        count=1,
        flags=re.DOTALL,
    )
    route, count = re.subn(
        r"function isEligibleChinaImport\(raw: ImportJob, title: string, description: string, evidence: string\) \{.*?\n\}",
        '''function isEligibleChinaImport(raw: ImportJob, title: string, description: string, evidence: string) {
  const content = `${title} ${description} ${evidence} ${cleanText(raw.salary)}`;
  const years = requiredExperience(content);
  return chinaRelevant.test(content)
    && !chinaExcludedTitle.test(title)
    && !chinaIrrelevant.test(title)
    && !chinaExcludedCore.test(content)
    && (years === null || years <= 3);
}''',
        route,
        count=1,
        flags=re.DOTALL,
    )
    if count != 1:
        raise RuntimeError("Could not normalize China import eligibility")
    write("app/api/jobs/import/route.ts", route)


def update_ui() -> None:
    path("vite.config.ts").write_bytes(
        subprocess.check_output(["git", "show", "origin/main:vite.config.ts"], cwd=ROOT)
    )
    path("build/salary-policy-vite-plugin.ts").unlink(missing_ok=True)
    replace_once("app/job-radar.tsx", '  salary_below_20k: "工资下限不足 20K",\n', "")
    replace_once("app/job-radar.tsx", '  salary_below_20k_or_missing: "工资不足或缺失",\n', "")
    replace_once(
        "app/job-radar.tsx",
        '排除原因：缺少标题或链接 {chinaProgress.rejectionReasons.missing_title_or_url ?? chinaProgress.rejectionReasons.missing_required_fields ?? 0}；关键词不匹配 {chinaProgress.rejectionReasons.title_not_targeted ?? 0}；高年资、工程类或无关岗位 {chinaProgress.rejectionReasons.excluded_seniority_or_role ?? 0}；经验超过 3 年或核心方向不符 {chinaProgress.rejectionReasons.degree_experience_or_skill_gap ?? 0}；明确工资下限不足 20K {chinaProgress.rejectionReasons.salary_below_20k ?? chinaProgress.rejectionReasons.salary_below_20k_or_missing ?? 0}。保留待核验：工资缺失或面议 {chinaProgress.reviewCounts?.salary_missing_or_negotiable ?? chinaProgress.rejectionReasons.salary_missing_or_negotiable ?? 0}。',
        '排除原因：缺少标题或链接 {chinaProgress.rejectionReasons.missing_title_or_url ?? chinaProgress.rejectionReasons.missing_required_fields ?? 0}；关键词不匹配 {chinaProgress.rejectionReasons.title_not_targeted ?? 0}；高年资、工程类或无关岗位 {chinaProgress.rejectionReasons.excluded_seniority_or_role ?? 0}；经验超过 3 年或核心方向不符 {chinaProgress.rejectionReasons.degree_experience_or_skill_gap ?? 0}。工资仅展示，不参与自动筛选。',
    )


def update_tests() -> None:
    replace_once(
        "tests/test_boss_radar.py",
        "    def test_salary_floor_and_hard_exclusions_control_china_retention(self):\n",
        "    def test_salary_is_display_only_and_other_hard_exclusions_remain(self):\n",
    )
    replace_once(
        "tests/test_boss_radar.py",
        '        self.assertFalse(BOSS_RADAR.title_prefilter({**base, "job_id": "low", "title": "统计建模研究员", "salary": "15-30K"}))\n',
        '        self.assertTrue(BOSS_RADAR.title_prefilter({**base, "job_id": "low", "title": "统计建模研究员", "salary": "15-30K"}))\n',
    )
    regex_once(
        "tests/test_boss_radar.py",
        r"        self\.assertEqual\(\n"
        r"            BOSS_RADAR\.title_prefilter_reason\(\{\*\*base, \"job_id\": \"low\", \"title\": \"统计建模研究员\", \"salary\": \"15-30K\"\}\),\n"
        r"            \"salary_below_20k\",\n"
        r"        \)\n",
        '        self.assertEqual(\n'
        '            BOSS_RADAR.title_prefilter_reason({**base, "job_id": "low", "title": "统计建模研究员", "salary": "15-30K"}),\n'
        '            "",\n'
        '        )\n',
    )
    replace_once(
        "tests/test_boss_radar.py",
        '                    "salary": "20-30K·13薪",\n',
        '                    "salary": "15-18K·13薪",\n',
    )

    regex_once(
        "tests/test_china_scan.py",
        r"        self\.assertEqual\(stats\[0\]\[\"source_status\"\], \"rate_limited\"\)\n"
        r"        self\.assertEqual\(stats\[0\]\[\"matched\"\], 0\)\n"
        r"        self\.assertEqual\(stats\[0\]\[\"rejected\"\]\[\"salary_below_20k\"\], 1\)\n",
        '        self.assertEqual(stats[0]["source_status"], "rate_limited")\n'
        '        self.assertEqual(stats[0]["matched"], 1)\n'
        '        self.assertNotIn("salary_below_20k", stats[0]["rejected"])\n',
    )
    regex_once(
        "tests/test_china_scan.py",
        r"    def test_low_chinese_platform_salary_is_rejected\(self\):.*?\n"
        r"    def test_parses_brave_result_without_unrelated_navigation_links",
        '''    def test_low_chinese_platform_salary_is_kept(self):
        stats = CHINA_SCAN.empty_filter_stats()
        row = CHINA_SCAN.normalize_result(
            {
                "title": "数据分析师招聘 | 广州 | 1-1.5万 | 某科技股份有限公司",
                "url": "https://jobs.51job.com/guangzhou/172962369.html",
                "description": "统计学专业，熟练使用 SQL。",
            },
            {"source": "前程无忧", "query": "site:jobs.51job.com 数据分析师"},
            "2026-08-02T00:00:00+00:00",
            stats,
        )

        self.assertIsNotNone(row)
        self.assertEqual(row["salary_min_monthly_k"], 10)
        self.assertNotIn("salary_below_20k", stats)

    def test_low_daily_rate_is_kept_when_role_is_otherwise_eligible(self):
        stats = CHINA_SCAN.empty_filter_stats()
        row = CHINA_SCAN.normalize_result(
            {
                "title": "数据分析师",
                "url": "https://jobs.51job.com/shanghai/172962370.html",
                "description": "统计学专业，熟练使用 SQL，300元/天。",
            },
            {"source": "前程无忧", "query": "site:jobs.51job.com 数据分析师"},
            "2026-08-02T00:00:00+00:00",
            stats,
        )

        self.assertIsNotNone(row)
        self.assertAlmostEqual(row["salary_min_monthly_k"], 6.525)
        self.assertNotIn("salary_below_20k", stats)

    def test_parses_brave_result_without_unrelated_navigation_links''',
    )
    write(
        "tests/test_china_scan.py",
        read("tests/test_china_scan.py").replace('            "salary_below_20k": 0,\n', ""),
    )

    path("tests/test_salary_policy.py").write_text(
        '''import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_module(name: str, module_path: Path):
    spec = importlib.util.spec_from_file_location(name, module_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SalaryPolicyTests(unittest.TestCase):
    def test_company_portal_keeps_low_salary_role(self):
        scanner = load_module(
            "ivy_company_portal_salary_policy_test",
            ROOT / "scripts" / "company_portal_scan.py",
        )
        eligible, salary_floor = scanner.china_job_eligible(
            "数据科学家",
            "统计学博士，经验不限，使用 Python 开展医疗数据分析。",
            "15-18K",
        )
        self.assertTrue(eligible)
        self.assertEqual(salary_floor, 15)

    def test_no_salary_rejection_keys_or_thresholds_remain(self):
        paths = [
            ROOT / "local-collector" / "boss_radar.py",
            ROOT / "scripts" / "china_scan.py",
            ROOT / "scripts" / "company_portal_scan.py",
            ROOT / "app" / "api" / "jobs" / "import" / "route.ts",
            ROOT / "app" / "job-radar.tsx",
        ]
        combined = "\\n".join(item.read_text(encoding="utf-8") for item in paths)
        self.assertNotIn("salary_below_20k", combined)
        self.assertNotRegex(combined, r"salary_floor[^\\n]*(?:<\\s*20|>=\\s*20)")
        self.assertNotIn("工资下限不足 20K", combined)


if __name__ == "__main__":
    unittest.main()
''',
        encoding="utf-8",
    )


def restore_workflows_and_cleanup() -> None:
    pr_tests = subprocess.check_output(
        ["git", "show", "origin/main:.github/workflows/pr-python-tests.yml"],
        cwd=ROOT,
    )
    path(".github/workflows/pr-python-tests.yml").write_bytes(pr_tests)

    platform_workflow = subprocess.check_output(
        ["git", "show", "origin/main:.github/workflows/test-china-platforms.yml"],
        cwd=ROOT,
        text=True,
    )
    platform_workflow = platform_workflow.replace(
        "          - id: 51job\n"
        "            source: 前程无忧\n"
        "            query: site:jobs.51job.com 数据分析师 统计学\n"
        "            minimum_matched: 1\n",
        "          - id: 51job\n"
        "            source: 前程无忧\n"
        "            query: site:jobs.51job.com 数据分析师 统计学\n"
        "            minimum_matched: 0\n",
    )
    platform_workflow = platform_workflow.replace(
        "          python -m unittest discover -s tests -p 'test_china*.py'\n",
        "          python -m unittest discover -s tests -p 'test_china*.py'\n"
        "          python -m unittest tests.test_company_portal_scan tests.test_salary_policy\n",
    )
    path(".github/workflows/test-china-platforms.yml").write_text(
        platform_workflow,
        encoding="utf-8",
    )

    for relative in (
        ".direct-salary-filter-removal-trigger",
        ".github/workflows/p0-pr-trigger.yml",
        ".github/workflows/p0-remove-china-salary-filter.yml",
    ):
        path(relative).unlink(missing_ok=True)

    path("scripts/apply_remove_salary_filters.py").unlink()


def main() -> None:
    restore_direct_sources()
    remove_runtime_filters()
    update_ui()
    update_tests()
    restore_workflows_and_cleanup()


if __name__ == "__main__":
    main()
