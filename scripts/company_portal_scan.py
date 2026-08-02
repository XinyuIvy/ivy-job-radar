#!/usr/bin/env python3
"""Company portal scanner with salary retained for diagnostics only."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any


_IMPL_PATH = Path(__file__).with_name("_company_portal_scan_impl.py")
_SPEC = importlib.util.spec_from_file_location("_ivy_company_portal_scan_impl", _IMPL_PATH)
if _SPEC is None or _SPEC.loader is None:
    raise RuntimeError(f"Cannot load company portal implementation: {_IMPL_PATH}")
_IMPL = importlib.util.module_from_spec(_SPEC)
sys.modules[_SPEC.name] = _IMPL
_SPEC.loader.exec_module(_IMPL)


class DiagnosticSalaryFloor(float):
    """Numeric salary value that cannot be used as the retired 20K cutoff."""

    @staticmethod
    def _is_retired_cutoff(other: Any) -> bool:
        try:
            return float(other) == 20.0
        except (TypeError, ValueError):
            return False

    def __lt__(self, other: Any) -> bool:
        if self._is_retired_cutoff(other):
            return False
        return bool(float.__lt__(self, other))

    def __ge__(self, other: Any) -> bool:
        if self._is_retired_cutoff(other):
            return True
        return bool(float.__ge__(self, other))


_ORIGINAL_SALARY_PARSER = _IMPL.monthly_salary_floor_k


def monthly_salary_floor_k(value: str) -> DiagnosticSalaryFloor | None:
    """Parse salary for display and diagnostics without using it to reject jobs."""
    parsed = _ORIGINAL_SALARY_PARSER(value)
    return None if parsed is None else DiagnosticSalaryFloor(parsed)


_IMPL.monthly_salary_floor_k = monthly_salary_floor_k

for _name in dir(_IMPL):
    if not _name.startswith("__"):
        globals()[_name] = getattr(_IMPL, _name)

globals()["monthly_salary_floor_k"] = monthly_salary_floor_k


if __name__ == "__main__":
    _IMPL.main()
