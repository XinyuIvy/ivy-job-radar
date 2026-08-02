#!/usr/bin/env python3
"""Poll Ivy Job Radar for China scan requests and run them on this Mac."""

from __future__ import annotations

import argparse
import json
import os
import plistlib
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_DIR = Path.home() / ".ivy-job-radar"
DEFAULT_ENV_FILE = APP_DIR / "collector.env"
REPORT_PATH = APP_DIR / "reports" / "china-all-latest.json"
ACTIVE_REQUEST_PATH = APP_DIR / "china-active-request.txt"
LABEL = "com.ivy.jobradar.china-web-control"
POLL_SECONDS = 15


def load_env(path: Path) -> None:
    if not path.exists():
        raise RuntimeError(f"Missing collector configuration: {path}")
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        cleaned = value.strip()
        if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {"'", '"'}:
            cleaned = cleaned[1:-1]
        os.environ.setdefault(key.strip(), cleaned)


def request_json(path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    base_url = os.environ.get("IVY_JOB_RADAR_URL", "").rstrip("/")
    token = os.environ.get("IVY_JOB_RADAR_SYNC_TOKEN", "")
    sites_token = os.environ.get("IVY_JOB_RADAR_SITES_BYPASS_TOKEN", "")
    if not base_url or not token or not sites_token:
        raise RuntimeError("collector.env is missing the Job Radar URL or private tokens.")
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}{path}",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "OAI-Sites-Authorization": f"Bearer {sites_token}",
            "Content-Type": "application/json",
        },
        method="GET" if payload is None else "POST",
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))


def summarize_report(report: dict[str, Any]) -> tuple[str, str]:
    report_status = str(report.get("status", "failed"))
    state = {
        "completed": "completed",
        "partial": "attention_required",
        "failed": "failed",
    }.get(report_status, "failed")
    message = (
        f"发现 {int(report.get('jobs_discovered', 0))} 个岗位，"
        f"筛选后 {int(report.get('jobs_eligible', 0))} 个，"
        f"新增 {int(report.get('jobs_created', 0))} 个。"
    )
    if int(report.get("sources_failed", 0)):
        message += f" {int(report.get('sources_failed', 0))} 个来源需要处理。"
        attention_kinds = {
            str(item.get("attention_kind", ""))
            for item in report.get("results", [])
            if isinstance(item, dict) and item.get("attention_kind")
        }
        if "login_required" in attention_kinds:
            message += " BOSS 登录已失效：有空时打开专用 Chrome 登录后，再点一次更新中国岗位。"
        elif "verification_required" in attention_kinds:
            message += " BOSS 触发验证码或安全验证：有空时在专用 Chrome 完成验证后，再点一次更新中国岗位。"
        elif "network_error" in attention_kinds:
            message += " 网络连接失败；本轮不会据此判定岗位过期，下次更新会自动重试。"
    return state, message



def refresh_repository(repo_dir: Path) -> bool:
    """Fast-forward the local main branch and stage an updated agent for restart."""
    git_dir = repo_dir / ".git"
    if not git_dir.exists():
        raise RuntimeError(f"Collector repository is not a Git checkout: {repo_dir}")

    branch = subprocess.run(
        ["git", "-C", str(repo_dir), "branch", "--show-current"],
        check=False,
        capture_output=True,
        text=True,
    )
    current_branch = branch.stdout.strip()
    if branch.returncode != 0 or current_branch != "main":
        detail = branch.stderr.strip() or current_branch or "unknown"
        raise RuntimeError(f"Collector auto-update requires the main branch; found {detail}.")

    update = subprocess.run(
        ["git", "-C", str(repo_dir), "pull", "--ff-only", "origin", "main"],
        check=False,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if update.returncode != 0:
        detail = update.stderr.strip() or update.stdout.strip() or f"exit code {update.returncode}"
        raise RuntimeError(f"Collector auto-update failed: {detail}")

    repository_agent = repo_dir / "local-collector" / "china_scan_agent.py"
    installed_agent = Path(__file__).resolve()
    if installed_agent == repository_agent.resolve():
        return False
    if not repository_agent.exists():
        raise RuntimeError(f"Updated collector agent is missing: {repository_agent}")
    if installed_agent.read_bytes() == repository_agent.read_bytes():
        return False

    shutil.copy2(repository_agent, installed_agent)
    return True


def restart_updated_agent() -> None:
    """Replace this process with the newly installed collector agent."""
    os.execv(sys.executable, [sys.executable, *sys.argv])

def run_request(repo_dir: Path, request_id: str) -> None:
    script = repo_dir / "local-collector" / "china_one_click.py"
    if not script.exists():
        raise RuntimeError(f"China scanner is missing: {script}")
    ACTIVE_REQUEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    ACTIVE_REQUEST_PATH.write_text(request_id, encoding="utf-8")
    started_at = time.time()
    child_env = os.environ.copy()
    child_env["IVY_CHINA_SCAN_REQUEST_ID"] = request_id
    result = subprocess.run(
        [sys.executable, str(script), "run"],
        cwd=repo_dir,
        check=False,
        env=child_env,
    )

    if REPORT_PATH.exists() and REPORT_PATH.stat().st_mtime >= started_at - 1:
        report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
        state, message = summarize_report(report)
    else:
        state = "failed"
        message = f"本地扫描未生成新报告，退出码 {result.returncode}。"

    request_json("/api/china-scan-control", {
        "action": "finish",
        "request_id": request_id,
        "state": state,
        "message": message,
    })
    ACTIVE_REQUEST_PATH.unlink(missing_ok=True)


def poll_once(repo_dir: Path) -> bool:
    control = request_json("/api/china-scan-control")
    request_id = str(control.get("requestId", "")).strip()
    state = str(control.get("state", "idle"))
    active_request = ACTIVE_REQUEST_PATH.read_text(encoding="utf-8").strip() if ACTIVE_REQUEST_PATH.exists() else ""

    if state == "running" and request_id and active_request == request_id:
        run_request(repo_dir, request_id)
        return True
    if state != "queued" or not request_id:
        return False

    # Update only when the website has queued work. This keeps the Mac collector
    # current without polling GitHub continuously or accepting arbitrary commands.
    if refresh_repository(repo_dir):
        print(f"{datetime.now(timezone.utc).isoformat()} Collector updated; restarting.", flush=True)
        restart_updated_agent()

    claim = request_json("/api/china-scan-control", {
        "action": "claim",
        "request_id": request_id,
    })
    if not claim.get("claimed"):
        return False
    run_request(repo_dir, request_id)
    return True


def serve(repo_dir: Path, env_file: Path, poll_seconds: int) -> None:
    load_env(env_file)
    print(f"{datetime.now(timezone.utc).isoformat()} China web control is ready.", flush=True)
    while True:
        try:
            poll_once(repo_dir)
        except (urllib.error.URLError, urllib.error.HTTPError, OSError, RuntimeError, ValueError) as exc:
            print(f"{datetime.now(timezone.utc).isoformat()} {exc}", file=sys.stderr, flush=True)
        time.sleep(max(5, poll_seconds))


def install(repo_dir: Path, env_file: Path) -> None:
    if sys.platform != "darwin":
        raise RuntimeError("The background agent installer requires macOS.")
    if not env_file.exists():
        raise RuntimeError(f"Missing collector configuration: {env_file}")

    installed_dir = APP_DIR / "collector"
    log_dir = APP_DIR / "logs"
    launch_agents = Path.home() / "Library" / "LaunchAgents"
    installed_dir.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(parents=True, exist_ok=True)
    launch_agents.mkdir(parents=True, exist_ok=True)

    installed_script = installed_dir / "china_scan_agent.py"
    shutil.copy2(Path(__file__).resolve(), installed_script)
    plist_path = launch_agents / f"{LABEL}.plist"
    payload = {
        "Label": LABEL,
        "ProgramArguments": [
            sys.executable,
            str(installed_script),
            "serve",
            "--repo-dir",
            str(repo_dir.resolve()),
            "--env-file",
            str(env_file.resolve()),
        ],
        "RunAtLoad": True,
        "KeepAlive": True,
        "ThrottleInterval": 30,
        "StandardOutPath": str(log_dir / "china-web-control.log"),
        "StandardErrorPath": str(log_dir / "china-web-control-error.log"),
    }
    with plist_path.open("wb") as handle:
        plistlib.dump(payload, handle, sort_keys=False)

    domain = f"gui/{os.getuid()}"
    subprocess.run(["launchctl", "bootout", domain, str(plist_path)], check=False, capture_output=True)
    subprocess.run(["launchctl", "bootstrap", domain, str(plist_path)], check=True)

    # Disable the legacy twice-daily BOSS schedule. The agent now waits for a
    # manual request from the website and never starts a scan on its own.
    legacy_plist = launch_agents / "com.ivy.jobradar.boss.plist"
    subprocess.run(["launchctl", "bootout", domain, str(legacy_plist)], check=False, capture_output=True)
    legacy_plist.unlink(missing_ok=True)

    # Remove the obsolete desktop entry after the website-controlled agent is installed.
    desktop_launcher = Path.home() / "Desktop" / "一键扫描BOSS.command"
    desktop_launcher.unlink(missing_ok=True)
    print("Manual website-controlled China scanning is installed and waiting.")


def uninstall() -> None:
    plist_path = Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"
    domain = f"gui/{os.getuid()}"
    subprocess.run(["launchctl", "bootout", domain, str(plist_path)], check=False, capture_output=True)
    plist_path.unlink(missing_ok=True)
    print("Website-controlled China scanning is disabled.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("install", "serve", "poll-once", "uninstall"))
    parser.add_argument("--repo-dir", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument("--poll-seconds", type=int, default=POLL_SECONDS)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.command == "install":
        install(args.repo_dir, args.env_file)
    elif args.command == "uninstall":
        uninstall()
    elif args.command == "poll-once":
        load_env(args.env_file)
        poll_once(args.repo_dir)
    else:
        serve(args.repo_dir, args.env_file, args.poll_seconds)


if __name__ == "__main__":
    main()
