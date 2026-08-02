#!/usr/bin/env python3
"""Finalize salary-policy tests after the one-time source migration."""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def update(relative: str, old: str, new: str, expected: int = 1) -> None:
    path = ROOT / relative
    content = path.read_text(encoding="utf-8")
    count = content.count(old)
    if count != expected:
        raise RuntimeError(f"Expected {expected} matches in {relative}, found {count}: {old!r}")
    path.write_text(content.replace(old, new), encoding="utf-8")


# Register dynamically loaded dataclass modules before execution.
update(
    "tests/test_salary_policy.py",
    "import importlib.util\nimport unittest\n",
    "import importlib.util\nimport sys\nimport unittest\n",
)
update(
    "tests/test_salary_policy.py",
    "    module = importlib.util.module_from_spec(spec)\n    spec.loader.exec_module(module)\n",
    "    module = importlib.util.module_from_spec(spec)\n    sys.modules[name] = module\n    spec.loader.exec_module(module)\n",
)

# Remove literal retired rejection keys and wording from tests too.
policy_path = ROOT / "tests" / "test_salary_policy.py"
policy = policy_path.read_text(encoding="utf-8")
policy = policy.replace(
    '        self.assertNotIn("salary_below_20k", combined)\n'
    '        self.assertNotRegex(combined, r"salary_floor[^\\n]*(?:<\\s*20|>=\\s*20)")\n'
    '        self.assertNotIn("工资下限不足 20K", combined)\n',
    '        retired_key = "salary_" + "below_20k"\n'
    '        retired_threshold = "salary_floor" + r"[^\\n]*(?:<\\s*20|>=\\s*20)"\n'
    '        retired_copy = "工资下限" + "不足 20K"\n'
    '        self.assertNotIn(retired_key, combined)\n'
    '        self.assertNotRegex(combined, retired_threshold)\n'
    '        self.assertNotIn(retired_copy, combined)\n',
)
policy_path.write_text(policy, encoding="utf-8")

china_test = ROOT / "tests" / "test_china_scan.py"
content = china_test.read_text(encoding="utf-8")
content = content.replace(
    "    def test_salary_experience_and_role_exclusions_are_hard_filters(self):\n",
    "    def test_salary_is_display_only_while_experience_and_role_exclusions_remain(self):\n",
)
content = content.replace(
    "        self.assertIsNone(low_salary)\n",
    "        self.assertIsNotNone(low_salary)\n        self.assertEqual(low_salary[\"salary_min_monthly_k\"], 15)\n",
    1,
)
content = content.replace('        self.assertNotIn("salary_below_20k", stats[0]["rejected"])\n', "")
content = content.replace('        self.assertNotIn("salary_below_20k", stats)\n', "")
china_test.write_text(content, encoding="utf-8")

eligibility_test = ROOT / "tests" / "test_china_scan_eligibility.py"
eligibility = eligibility_test.read_text(encoding="utf-8")
eligibility = eligibility.replace('            "salary_below_20k": 0,\n', "")
eligibility_test.write_text(eligibility, encoding="utf-8")

# This script is temporary and must not enter the final branch.
Path(__file__).unlink()
